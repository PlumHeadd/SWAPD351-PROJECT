package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/streadway/amqp"
)

var (
	redisClient *redis.Client
	amqpConn    *amqp.Connection
	amqpChan    *amqp.Channel

	// Prometheus metrics
	eventsTracked = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "analytics_events_tracked_total",
			Help: "Total number of events tracked",
		},
		[]string{"event_type"},
	)

	analyticsRequests = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name: "analytics_request_duration_seconds",
			Help: "Duration of analytics requests in seconds",
		},
		[]string{"endpoint"},
	)
)

func init() {
	prometheus.MustRegister(eventsTracked)
	prometheus.MustRegister(analyticsRequests)
}

// Event represents an analytics event
type Event struct {
	ID        string            `json:"id"`
	Type      string            `json:"type"`
	UserID    string            `json:"user_id"`
	EventID   string            `json:"event_id"`
	Action    string            `json:"action"`
	Metadata  map[string]string `json:"metadata"`
	Timestamp time.Time         `json:"timestamp"`
}

// Analytics represents analytics data
type Analytics struct {
	TotalEvents        int       `json:"total_events"`
	TotalRSVPs         int       `json:"total_rsvps"`
	TotalUsers         int       `json:"total_users"`
	AverageEventSize   float64   `json:"average_event_size"`
	TopEvents          []string  `json:"top_events"`
	EventsLast24h      int       `json:"events_last_24h"`
	RSVPsLast24h       int       `json:"rsvps_last_24h"`
	ActiveUsersLast24h int       `json:"active_users_last_24h"`
	Timestamp          time.Time `json:"timestamp"`
}

func main() {
	// Load configuration
	cfg := LoadConfig()

	// Initialize Redis
	redisURL := cfg.RedisURL
	redisClient = redis.NewClient(&redis.Options{
		Addr: redisURL[8:], // Remove "redis://" prefix
	})
	defer redisClient.Close()

	// Test Redis connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Redis connection failed: %v\n", err)
	} else {
		log.Println("✓ Connected to Redis")
	}

	// Initialize RabbitMQ
	rabbitmqURL := cfg.RabbitMQURL
	var err error
	amqpConn, err = amqp.Dial(rabbitmqURL)
	if err != nil {
		log.Printf("Warning: RabbitMQ connection failed: %v\n", err)
	} else {
		defer amqpConn.Close()
		amqpChan, err = amqpConn.Channel()
		if err != nil {
			log.Printf("Warning: Failed to open RabbitMQ channel: %v\n", err)
		} else {
			defer amqpChan.Close()
			declareQueues(amqpChan)
			log.Println("✓ Connected to RabbitMQ")
		}
	}

	// Setup HTTP routes
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", healthCheck).Methods("GET")

	// Metrics
	router.Handle("/metrics", promhttp.Handler())

	// Analytics endpoints
	router.HandleFunc("/api/analytics/track", trackEvent).Methods("POST")
	router.HandleFunc("/api/analytics/summary", getAnalyticsSummary).Methods("GET")
	router.HandleFunc("/api/analytics/events/{event_id}", getEventAnalytics).Methods("GET")
	router.HandleFunc("/api/analytics/users/{user_id}", getUserAnalytics).Methods("GET")
	router.HandleFunc("/api/analytics/dashboard", getDashboard).Methods("GET")
	router.HandleFunc("/api/analytics/events", listRecentEvents).Methods("GET")

	// CORS middleware
	corsHandler := handlers.CORS(
		handlers.AllowedOrigins([]string{"*"}),
		handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
	)

	// Start server
	port := cfg.Port

	server := &http.Server{
		Addr:    ":" + port,
		Handler: corsHandler(router),
	}

	log.Printf("Analytics Service starting on port %s...\n", port)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("\nShutting down gracefully...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Shutdown error: %v\n", err)
		}
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v\n", err)
	}
}

func declareQueues(ch *amqp.Channel) {
	queues := []string{
		"analytics.events",
		"analytics.rsvps",
		"analytics.chat",
	}

	for _, q := range queues {
		_, err := ch.QueueDeclare(
			q,     // name
			true,  // durable
			false, // delete when unused
			false, // exclusive
			false, // no-wait
			nil,   // arguments
		)
		if err != nil {
			log.Printf("Warning: Failed to declare queue %s: %v\n", q, err)
		}
	}
}

// healthCheck returns service health status
func healthCheck(w http.ResponseWriter, r *http.Request) {
	status := map[string]interface{}{
		"status":    "UP",
		"service":   "analytics-service",
		"version":   "1.0.0",
		"timestamp": time.Now(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// trackEvent tracks an analytics event
func trackEvent(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		analyticsRequests.WithLabelValues("track").Observe(time.Since(start).Seconds())
	}()

	var event Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	event.ID = uuid.New().String()
	event.Timestamp = time.Now()

	// Store in Redis
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	eventJSON, err := json.Marshal(event)
	if err != nil {
		http.Error(w, "Failed to marshal event", http.StatusInternalServerError)
		return
	}

	// Store event in Redis sorted set with timestamp as score
	key := "analytics:events:" + event.Type
	if err := redisClient.ZAdd(ctx, key, &redis.Z{
		Score:  float64(event.Timestamp.Unix()),
		Member: string(eventJSON),
	}).Err(); err != nil {
		log.Printf("Error storing event in Redis: %v\n", err)
	}

	// Publish to RabbitMQ for real-time processing
	if amqpChan != nil {
		queueName := "analytics." + event.Type
		err := amqpChan.Publish(
			"",        // exchange
			queueName, // routing key
			false,     // mandatory
			false,     // immediate
			amqp.Publishing{
				ContentType: "application/json",
				Body:        eventJSON,
			},
		)
		if err != nil {
			log.Printf("Error publishing event to RabbitMQ: %v\n", err)
		}
	}

	eventsTracked.WithLabelValues(event.Type).Inc()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(event)
}

// getAnalyticsSummary returns overall platform analytics
func getAnalyticsSummary(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		analyticsRequests.WithLabelValues("summary").Observe(time.Since(start).Seconds())
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	analytics := Analytics{
		Timestamp: time.Now(),
	}

	// Get counts from Redis
	eventCount, err := redisClient.ZCard(ctx, "analytics:events:event_created").Result()
	if err == nil {
		analytics.TotalEvents = int(eventCount)
	}

	rsvpCount, err := redisClient.ZCard(ctx, "analytics:events:rsvp_created").Result()
	if err == nil {
		analytics.TotalRSVPs = int(rsvpCount)
	}

	userCount, err := redisClient.ZCard(ctx, "analytics:events:user_signup").Result()
	if err == nil {
		analytics.TotalUsers = int(userCount)
	}

	// Calculate last 24h metrics
	now := time.Now()
	oneDayAgo := now.AddDate(0, 0, -1)

	events24h, err := redisClient.ZCountByScore(ctx, "analytics:events:event_created",
		&redis.ZRangeByScore{Min: float64(oneDayAgo.Unix()), Max: float64(now.Unix())}).Result()
	if err == nil {
		analytics.EventsLast24h = int(events24h)
	}

	rsvps24h, err := redisClient.ZCountByScore(ctx, "analytics:events:rsvp_created",
		&redis.ZRangeByScore{Min: float64(oneDayAgo.Unix()), Max: float64(now.Unix())}).Result()
	if err == nil {
		analytics.RSVPsLast24h = int(rsvps24h)
	}

	// Calculate average event size
	if analytics.TotalRSVPs > 0 && analytics.TotalEvents > 0 {
		analytics.AverageEventSize = float64(analytics.TotalRSVPs) / float64(analytics.TotalEvents)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analytics)
}

// getEventAnalytics returns analytics for a specific event
func getEventAnalytics(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		analyticsRequests.WithLabelValues("event_analytics").Observe(time.Since(start).Seconds())
	}()

	vars := mux.Vars(r)
	eventID := vars["event_id"]

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	eventData := map[string]interface{}{
		"event_id":  eventID,
		"views":     0,
		"rsvps":     0,
		"shares":    0,
		"comments":  0,
		"timestamp": time.Now(),
	}

	// Fetch from Redis
	views, err := redisClient.Get(ctx, "analytics:event:"+eventID+":views").Int64()
	if err == nil {
		eventData["views"] = views
	}

	rsvps, err := redisClient.Get(ctx, "analytics:event:"+eventID+":rsvps").Int64()
	if err == nil {
		eventData["rsvps"] = rsvps
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(eventData)
}

// getUserAnalytics returns analytics for a specific user
func getUserAnalytics(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		analyticsRequests.WithLabelValues("user_analytics").Observe(time.Since(start).Seconds())
	}()

	vars := mux.Vars(r)
	userID := vars["user_id"]

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	userData := map[string]interface{}{
		"user_id":         userID,
		"events_created":  0,
		"events_attended": 0,
		"messages_sent":   0,
		"activity_score":  0,
		"timestamp":       time.Now(),
	}

	// Fetch from Redis
	created, err := redisClient.Get(ctx, "analytics:user:"+userID+":events_created").Int64()
	if err == nil {
		userData["events_created"] = created
	}

	attended, err := redisClient.Get(ctx, "analytics:user:"+userID+":events_attended").Int64()
	if err == nil {
		userData["events_attended"] = attended
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userData)
}

// getDashboard returns comprehensive dashboard data
func getDashboard(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		analyticsRequests.WithLabelValues("dashboard").Observe(time.Since(start).Seconds())
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	dashboard := map[string]interface{}{
		"timestamp": time.Now(),
		"metrics": map[string]interface{}{
			"total_events":    0,
			"total_rsvps":     0,
			"total_users":     0,
			"events_last_24h": 0,
			"active_events":   0,
		},
		"trends": map[string]interface{}{
			"events_trend":    "stable",
			"rsvps_trend":     "stable",
			"user_engagement": 0.0,
		},
		"top_categories":   []string{},
		"activity_heatmap": map[string]int{},
	}

	// Get total metrics
	events, _ := redisClient.ZCard(ctx, "analytics:events:event_created").Result()
	rsvps, _ := redisClient.ZCard(ctx, "analytics:events:rsvp_created").Result()
	users, _ := redisClient.ZCard(ctx, "analytics:events:user_signup").Result()

	metrics := dashboard["metrics"].(map[string]interface{})
	metrics["total_events"] = events
	metrics["total_rsvps"] = rsvps
	metrics["total_users"] = users

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

// listRecentEvents returns recent analytics events
func listRecentEvents(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	defer func() {
		analyticsRequests.WithLabelValues("list_events").Observe(time.Since(start).Seconds())
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get last 100 events from Redis
	events, err := redisClient.ZRevRange(ctx, "analytics:events:event_created", 0, 99).Result()
	if err != nil {
		http.Error(w, "Failed to fetch events", http.StatusInternalServerError)
		return
	}

	var eventList []Event
	for _, eventJSON := range events {
		var event Event
		if err := json.Unmarshal([]byte(eventJSON), &event); err == nil {
			eventList = append(eventList, event)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"events": eventList,
		"count":  len(eventList),
	})
}
