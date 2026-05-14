# Analytics Service

A high-performance **Go microservice** for tracking, analyzing, and reporting on platform analytics in the Eventify system.

## Overview

The Analytics Service collects real-time data about user activities, events, RSVPs, and platform metrics. It provides comprehensive analytics endpoints for dashboards and reporting.

### Key Features

✅ **Real-time Event Tracking** — Async event collection via RabbitMQ  
✅ **Redis Caching** — Fast data aggregation and retrieval  
✅ **Prometheus Metrics** — Service-level monitoring  
✅ **RESTful API** — Simple JSON endpoints  
✅ **Scalable Architecture** — Built with Go's concurrency model  
✅ **Docker Ready** — Multi-stage build for minimal image size  

## Architecture

```
┌──────────────────────────────┐
│  Other Services              │
│  (Event, User, Chat, etc.)   │
└────────────┬─────────────────┘
             │
             │ POST /api/analytics/track
             ▼
    ┌────────────────────────┐
    │ Analytics Service (Go) │
    │  ├─ Track events      │
    │  ├─ Aggregate stats   │
    │  ├─ Dashboard data    │
    │  └─ /metrics endpoint │
    └──────┬─────────┬──────┘
           │         │
    ┌──────▼──┐   ┌──▼────────┐
    │  Redis  │   │ RabbitMQ  │
    │ Caching │   │ Async Job │
    └─────────┘   └───────────┘
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Track Event
```bash
POST /api/analytics/track
Content-Type: application/json

{
  "type": "event_created|rsvp_created|user_signup|event_viewed|message_sent",
  "user_id": "uuid",
  "event_id": "uuid",
  "action": "create|rsvp|signup",
  "metadata": {
    "key": "value"
  }
}

Response: 201 Created
{
  "id": "uuid",
  "type": "event_created",
  "user_id": "uuid",
  "timestamp": "2026-05-14T10:30:00Z"
}
```

### Get Platform Summary
```bash
GET /api/analytics/summary

Response: 200 OK
{
  "total_events": 1250,
  "total_rsvps": 5420,
  "total_users": 890,
  "average_event_size": 4.34,
  "events_last_24h": 45,
  "rsvps_last_24h": 234,
  "active_users_last_24h": 120,
  "timestamp": "2026-05-14T10:30:00Z"
}
```

### Get Event Analytics
```bash
GET /api/analytics/events/{event_id}

Response: 200 OK
{
  "event_id": "uuid",
  "views": 156,
  "rsvps": 42,
  "shares": 8,
  "comments": 23,
  "timestamp": "2026-05-14T10:30:00Z"
}
```

### Get User Analytics
```bash
GET /api/analytics/users/{user_id}

Response: 200 OK
{
  "user_id": "uuid",
  "events_created": 5,
  "events_attended": 12,
  "messages_sent": 89,
  "activity_score": 78.5,
  "timestamp": "2026-05-14T10:30:00Z"
}
```

### Get Dashboard Data
```bash
GET /api/analytics/dashboard

Response: 200 OK
{
  "timestamp": "2026-05-14T10:30:00Z",
  "metrics": {
    "total_events": 1250,
    "total_rsvps": 5420,
    "total_users": 890,
    "events_last_24h": 45,
    "active_events": 320
  },
  "trends": {
    "events_trend": "up",
    "rsvps_trend": "stable",
    "user_engagement": 0.65
  },
  "top_categories": ["Music", "Tech", "Sports"],
  "activity_heatmap": { ... }
}
```

### List Recent Events
```bash
GET /api/analytics/events

Response: 200 OK
{
  "events": [
    {
      "id": "uuid",
      "type": "event_created",
      "user_id": "uuid",
      "event_id": "uuid",
      "timestamp": "2026-05-14T10:30:00Z"
    }
  ],
  "count": 100
}
```

### Prometheus Metrics
```bash
GET /metrics
```

Exposed metrics:
- `analytics_events_tracked_total{event_type="..."}` — Total events tracked by type
- `analytics_request_duration_seconds{endpoint="..."}` — Request latency histogram

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5003` | HTTP server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ connection URL |
| `JWT_SECRET` | `eventify_jwt_secret_key_2026` | JWT secret for validation |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

## Building & Running

### Local Development

```bash
# Install Go 1.23+
# https://golang.org/dl

# Clone & navigate to service
cd services/analytics-service

# Download dependencies
go mod download
go mod verify

# Run
go run main.go
```

### Docker Build

```bash
# Build image
docker build -t analytics-service:latest .

# Run container
docker run -p 5003:5003 \
  -e REDIS_URL=redis://redis:6379 \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  analytics-service:latest
```

### With Docker Compose

```bash
# Start entire stack
docker-compose up --build

# Access analytics service
curl http://localhost:5003/health
curl http://localhost:5003/api/analytics/summary
```

## Development

### Project Structure

```
analytics-service/
├── main.go              # Service entry point, API routes
├── go.mod              # Go module definition
├── go.sum              # Dependency checksums
├── Dockerfile          # Multi-stage container build
├── .env.example        # Environment variables template
└── README.md           # This file
```

### Key Dependencies

- **github.com/go-redis/redis/v8** — Redis client
- **github.com/streadway/amqp** — RabbitMQ client
- **github.com/gorilla/mux** — HTTP router
- **github.com/prometheus/client_golang** — Prometheus instrumentation
- **github.com/google/uuid** — UUID generation

### Adding New Event Types

Edit `main.go` and add to the `declareQueues()` function:

```go
queues := []string{
    "analytics.events",
    "analytics.rsvps",
    "analytics.chat",
    "analytics.new_event_type",  // Add here
}
```

### Adding New API Endpoints

```go
router.HandleFunc("/api/analytics/new-endpoint", handlerFunction).Methods("GET")
```

## Testing

### Manual Testing

```bash
# Health check
curl http://localhost:5003/health

# Track an event
curl -X POST http://localhost:5003/api/analytics/track \
  -H "Content-Type: application/json" \
  -d '{
    "type": "event_created",
    "user_id": "user-123",
    "event_id": "event-456",
    "action": "create",
    "metadata": {"category": "tech"}
  }'

# Get summary
curl http://localhost:5003/api/analytics/summary

# Get metrics
curl http://localhost:5003/metrics
```

### Integration with Other Services

Each service should emit analytics events when significant actions occur:

**Event Service** → publishes when events are created/updated/deleted
**User Service** → publishes when users sign up/login
**Chat Service** → publishes when messages are sent
**Notification Service** → publishes when notifications are sent

## Deployment

### Kubernetes (Future)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-service
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: analytics-service
        image: analytics-service:latest
        ports:
        - containerPort: 5003
        env:
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: analytics-config
              key: redis_url
        - name: RABBITMQ_URL
          valueFrom:
            secretKeyRef:
              name: analytics-secrets
              key: rabbitmq_url
```

### Production Considerations

1. **High Availability** — Deploy multiple replicas behind load balancer
2. **Redis Cluster** — Use Redis Sentinel or Cluster for failover
3. **RabbitMQ Cluster** — Ensure message broker redundancy
4. **Monitoring** — Set up Prometheus scraping for service metrics
5. **Rate Limiting** — Implement rate limits on `/api/analytics/track`
6. **Authentication** — Add JWT validation before accepting events

## Troubleshooting

### Service Won't Start

```bash
# Check Redis connection
redis-cli ping

# Check RabbitMQ
curl http://localhost:15672/api/overview -u guest:guest

# Check logs
docker-compose logs analytics-service
```

### High Memory Usage

- Implement event retention policies in Redis
- Use Redis sorted sets with automatic expiration
- Add TTL to Redis keys

### Slow Response Times

- Check Redis performance: `redis-cli --latency`
- Monitor RabbitMQ queue depth
- Scale horizontally (add more service replicas)

## Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Event Track P95 | <50ms | - |
| Summary Query P95 | <100ms | - |
| Dashboard Load P95 | <200ms | - |
| Throughput | 1000+ evt/sec | - |

## Contributing

- Follow Go conventions and idioms
- Use `gofmt` for code formatting
- Add tests for new endpoints
- Update this README with new features

## License

Part of Eventify Platform — SWAPD 351 (Spring 2026)

## Team

**Course:** SWAPD 351 — Software Architecture and Design  
**Team:** Habiba Magdy, Basmala Salah, Arwa Mohamed, Lana Mohamed
