package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthCheck(t *testing.T) {
	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(healthCheck)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusOK)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}

	if result["status"] != "UP" {
		t.Errorf("health check status incorrect: got %v want UP", result["status"])
	}
}

func TestTrackEventValidation(t *testing.T) {
	// Test invalid JSON
	invalidJSON := []byte("not valid json")
	req, err := http.NewRequest("POST", "/api/analytics/track", bytes.NewBuffer(invalidJSON))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(trackEvent)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("handler returned wrong status code for invalid JSON: got %v want %v",
			status, http.StatusBadRequest)
	}
}

func TestTrackEventSuccess(t *testing.T) {
	event := Event{
		Type:     "event_created",
		UserID:   "user-123",
		EventID:  "event-456",
		Action:   "create",
		Metadata: map[string]string{"category": "tech"},
	}

	eventJSON, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}

	req, err := http.NewRequest("POST", "/api/analytics/track", bytes.NewBuffer(eventJSON))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(trackEvent)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusCreated {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusCreated)
	}

	var responseEvent Event
	if err := json.NewDecoder(rr.Body).Decode(&responseEvent); err != nil {
		t.Fatal(err)
	}

	if responseEvent.Type != "event_created" {
		t.Errorf("response event type incorrect: got %v want event_created", responseEvent.Type)
	}

	if responseEvent.ID == "" {
		t.Error("response event ID should not be empty")
	}

	if responseEvent.Timestamp.IsZero() {
		t.Error("response event timestamp should not be zero")
	}
}

func TestEventStructure(t *testing.T) {
	now := time.Now()
	event := Event{
		ID:        "test-id",
		Type:      "rsvp_created",
		UserID:    "user-123",
		EventID:   "event-456",
		Action:    "rsvp",
		Metadata:  map[string]string{"status": "attending"},
		Timestamp: now,
	}

	if event.ID != "test-id" {
		t.Error("event ID not set correctly")
	}

	if event.Type != "rsvp_created" {
		t.Error("event type not set correctly")
	}

	eventJSON, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}

	var decoded Event
	if err := json.Unmarshal(eventJSON, &decoded); err != nil {
		t.Fatal(err)
	}

	if decoded.ID != event.ID {
		t.Error("event ID not preserved through JSON marshaling")
	}
}

func TestAnalyticsStructure(t *testing.T) {
	now := time.Now()
	analytics := Analytics{
		TotalEvents:        100,
		TotalRSVPs:         250,
		TotalUsers:         50,
		AverageEventSize:   2.5,
		EventsLast24h:      10,
		RSVPsLast24h:       30,
		ActiveUsersLast24h: 15,
		Timestamp:          now,
	}

	if analytics.TotalEvents != 100 {
		t.Error("total events not set correctly")
	}

	if analytics.AverageEventSize != 2.5 {
		t.Error("average event size not calculated correctly")
	}

	analyticsJSON, err := json.Marshal(analytics)
	if err != nil {
		t.Fatal(err)
	}

	var decoded Analytics
	if err := json.Unmarshal(analyticsJSON, &decoded); err != nil {
		t.Fatal(err)
	}

	if decoded.TotalEvents != analytics.TotalEvents {
		t.Error("total events not preserved through JSON marshaling")
	}
}

func TestConfigLoad(t *testing.T) {
	cfg := LoadConfig()

	if cfg.Port == "" {
		t.Error("port should not be empty")
	}

	if cfg.RedisURL == "" {
		t.Error("redis URL should not be empty")
	}

	if cfg.RabbitMQURL == "" {
		t.Error("rabbitmq URL should not be empty")
	}

	if cfg.JWTSecret == "" {
		t.Error("JWT secret should not be empty")
	}
}
