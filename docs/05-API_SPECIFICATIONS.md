# Eventify Platform — API Specifications

**Course:** SWAPD 351 — Software Architecture and Design (Spring 2026)  
**Date:** April 2026

This document provides complete OpenAPI/Swagger specifications for all Eventify services. Services communicate synchronously via REST APIs (documented here) and asynchronously via RabbitMQ (see Messaging Specification).

---

## 1. API Overview

### Base URL

```
Development: http://localhost:3000/api
Production: https://eventify.example.com/api
```

### Authentication

All endpoints (except `/health`, `/metrics`) require a Bearer token:

```
Authorization: Bearer <JWT_TOKEN>
```

**Token Structure (JWT RS256):**

```json
{
  "sub": "user123",          // User ID (from Google)
  "email": "user@gmail.com",
  "iat": 1712192400,
  "exp": 1712192700          // Expires in 5 minutes
}
```

### Response Format

All responses are JSON:

```json
{
  "data": { /* success data */ },
  "error": null,
  "timestamp": "2026-04-04T10:00:00Z"
}
```

**Error responses:**

```json
{
  "data": null,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Event capacity reached",
    "details": "Maximum 100 attendees"
  },
  "timestamp": "2026-04-04T10:00:00Z"
}
```

---

## 2. Authentication API (User Service)

### 2.1 Initiate Google OAuth2 Login

**Endpoint:** `GET /auth/google`

**Description:** Redirects browser to Google's OAuth2 consent screen

**Parameters:** None

**Response:** `302 Found` redirect to Google

**Example:**

```bash
curl -i http://localhost:3000/api/auth/google

# Response:
# HTTP/1.1 302 Found
# Location: https://accounts.google.com/o/oauth2/v2/auth?...
```

---

### 2.2 Google OAuth2 Callback

**Endpoint:** `GET /auth/google/callback`

**Description:** Handles callback from Google after user authorization. Issues access + refresh tokens.

**Parameters:**

| Name | Type | Location | Required | Description |
|---|---|---|---|---|
| code | string | query | Yes | Authorization code from Google |
| state | string | query | No | CSRF protection token |

**Response:** `200 OK`

```json
{
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "refresh_token": "refresh_eyJhbGciOiJIUz...",
    "expires_in": 300,
    "token_type": "Bearer",
    "user": {
      "id": "user123",
      "email": "user@gmail.com",
      "name": "John Doe",
      "avatar": "https://..."
    }
  },
  "error": null
}
```

**Error Responses:**

```json
// 400 Bad Request - Missing code
{
  "error": {
    "code": "MISSING_AUTHORIZATION_CODE",
    "message": "Authorization code is required"
  }
}

// 401 Unauthorized - Invalid code
{
  "error": {
    "code": "INVALID_AUTHORIZATION_CODE",
    "message": "Code is invalid or expired"
  }
}
```

---

### 2.3 Refresh Access Token

**Endpoint:** `POST /auth/refresh`

**Description:** Exchange refresh token for new access token

**Request Body:**

```json
{
  "refresh_token": "refresh_eyJhbGciOiJIUz..."
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "expires_in": 300,
    "token_type": "Bearer"
  }
}
```

**Error:**

```json
{
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Refresh token is invalid or expired"
  }
}
```

---

### 2.4 Get Current User Profile

**Endpoint:** `GET /users/me`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "user123",
    "email": "user@gmail.com",
    "name": "John Doe",
    "avatar": "https://lh3.googleusercontent.com/...",
    "created_at": "2026-03-15T10:00:00Z",
    "updated_at": "2026-04-04T10:00:00Z"
  }
}
```

---

### 2.5 Update User Profile

**Endpoint:** `PUT /users/me`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "John Doe Updated",
  "avatar": "https://..." 
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "user123",
    "email": "user@gmail.com",
    "name": "John Doe Updated",
    "avatar": "https://...",
    "updated_at": "2026-04-04T11:00:00Z"
  }
}
```

---

## 3. Event Service API

### 3.1 List Events

**Endpoint:** `GET /events`

**Query Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| page | integer | 1 | Page number (1-indexed) |
| limit | integer | 20 | Items per page (max 100) |
| category | string | — | Filter by category (e.g., "sports", "music") |
| search | string | — | Full-text search on title/description |
| date_from | date | — | ISO 8601 date (e.g., 2026-04-05) |
| date_to | date | — | ISO 8601 date (e.g., 2026-05-05) |
| created_by | string | — | Filter by creator user ID |
| sort | string | date_asc | Sort field: `date_asc`, `date_desc`, `trending` |

**Response:** `200 OK`

```json
{
  "data": {
    "events": [
      {
        "id": "event123",
        "title": "Tech Conference 2026",
        "description": "Annual tech conference...",
        "date": "2026-04-15T14:00:00Z",
        "location": "San Francisco, CA",
        "category": "technology",
        "capacity": 100,
        "rsvp_count": 42,
        "created_by": "user456",
        "created_at": "2026-03-20T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 143,
      "pages": 8
    }
  }
}
```

**Example Request:**

```bash
curl "http://localhost:3000/api/events?category=sports&date_from=2026-04-05&limit=10" \
  -H "Authorization: Bearer <TOKEN>"
```

---

### 3.2 Get Event Details

**Endpoint:** `GET /events/{event_id}`

**Path Parameters:**

| Name | Type | Description |
|---|---|---|
| event_id | string | Event ID (MongoDB ObjectId) |

**Response:** `200 OK`

```json
{
  "data": {
    "id": "event123",
    "title": "Tech Conference 2026",
    "description": "Annual tech conference with keynote speeches...",
    "date": "2026-04-15T14:00:00Z",
    "location": "San Francisco, CA",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "category": "technology",
    "capacity": 100,
    "rsvp_count": 42,
    "created_by": "user456",
    "created_at": "2026-03-20T10:00:00Z",
    "updated_at": "2026-03-25T15:30:00Z",
    "attendees": [
      {
        "user_id": "user123",
        "name": "John Doe",
        "rsvp_status": "going",
        "rsvp_date": "2026-03-21T10:00:00Z"
      }
    ]
  }
}
```

**Error:** `404 Not Found`

```json
{
  "error": {
    "code": "EVENT_NOT_FOUND",
    "message": "Event with ID event123 not found"
  }
}
```

---

### 3.3 Create Event

**Endpoint:** `POST /events`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "React Workshop",
  "description": "Learn React hooks and state management",
  "date": "2026-04-20T18:00:00Z",
  "location": "New York, NY",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "category": "technology",
  "capacity": 50
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "event789",
    "title": "React Workshop",
    "date": "2026-04-20T18:00:00Z",
    "location": "New York, NY",
    "capacity": 50,
    "rsvp_count": 0,
    "created_by": "user123",
    "created_at": "2026-04-04T10:00:00Z"
  }
}
```

**Error:** `400 Bad Request`

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required and must be 1-200 characters",
    "details": ["title required", "capacity must be > 0"]
  }
}
```

---

### 3.4 Update Event

**Endpoint:** `PUT /events/{event_id}`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "React Advanced Workshop",
  "description": "Advanced React patterns...",
  "capacity": 60
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "event789",
    "title": "React Advanced Workshop",
    "capacity": 60,
    "updated_at": "2026-04-04T11:00:00Z"
  }
}
```

**Error:** `403 Forbidden` (not creator)

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only event creator can update event"
  }
}
```

---

### 3.5 Delete Event

**Endpoint:** `DELETE /events/{event_id}`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
```

**Response:** `204 No Content`

---

## 4. RSVP Management API

### 4.1 Create RSVP

**Endpoint:** `POST /events/{event_id}/rsvps`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

**Request Body:**

```json
{}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "rsvp456",
    "event_id": "event789",
    "user_id": "user123",
    "status": "going",
    "rsvp_date": "2026-04-04T10:00:00Z"
  }
}
```

**Error:** `409 Conflict` (capacity reached)

```json
{
  "error": {
    "code": "CAPACITY_REACHED",
    "message": "Event has reached maximum capacity of 50",
    "details": {
      "capacity": 50,
      "current_rsvps": 50
    }
  }
}
```

---

### 4.2 Get User's RSVPs

**Endpoint:** `GET /users/me/rsvps`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
```

**Query Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| status | string | — | Filter by status: `going`, `maybe`, `not_going` |
| sort | string | date_asc | `date_asc` or `date_desc` |

**Response:** `200 OK`

```json
{
  "data": {
    "rsvps": [
      {
        "id": "rsvp456",
        "event": {
          "id": "event789",
          "title": "React Workshop",
          "date": "2026-04-20T18:00:00Z",
          "location": "New York, NY"
        },
        "status": "going",
        "rsvp_date": "2026-04-04T10:00:00Z"
      }
    ]
  }
}
```

---

### 4.3 Cancel RSVP

**Endpoint:** `DELETE /events/{event_id}/rsvps`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
```

**Response:** `204 No Content`

---

## 5. Chat API

### 5.1 WebSocket Connection

**Endpoint:** `ws://localhost:3002/chat?event_id=event789`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
```

**Connection Messages:**

**Connected:**

```json
{
  "type": "connected",
  "message": "Connected to event789 chat",
  "user_count": 5
}
```

**User joined:**

```json
{
  "type": "user_joined",
  "user_id": "user123",
  "user_name": "John Doe",
  "user_count": 6,
  "timestamp": "2026-04-04T10:00:00Z"
}
```

---

### 5.2 Send Message

**Client → Server:**

```json
{
  "type": "message",
  "content": "Hey everyone!",
  "timestamp": "2026-04-04T10:00:01Z"
}
```

**Server broadcasts to all clients:**

```json
{
  "type": "message",
  "message_id": "msg789",
  "user_id": "user123",
  "user_name": "John Doe",
  "content": "Hey everyone!",
  "timestamp": "2026-04-04T10:00:01Z"
}
```

---

### 5.3 Get Chat History

**Endpoint:** `GET /events/{event_id}/chat/history`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
```

**Query Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| limit | integer | 50 | Number of messages to retrieve |
| before | timestamp | — | ISO 8601; get messages before this timestamp |

**Response:** `200 OK`

```json
{
  "data": {
    "messages": [
      {
        "message_id": "msg789",
        "user_id": "user123",
        "user_name": "John Doe",
        "content": "Hey everyone!",
        "timestamp": "2026-04-04T10:00:01Z"
      }
    ]
  }
}
```

---

## 6. Notification API

### 6.1 Get Notifications

**Endpoint:** `GET /notifications`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
```

**Query Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| read | boolean | — | Filter by read status |
| limit | integer | 20 | Items per page |

**Response:** `200 OK`

```json
{
  "data": {
    "notifications": [
      {
        "id": "notif123",
        "type": "rsvp_confirmed",
        "title": "RSVP Confirmed",
        "message": "Your RSVP to React Workshop confirmed",
        "read": false,
        "event_id": "event789",
        "created_at": "2026-04-04T10:00:00Z"
      }
    ]
  }
}
```

---

### 6.2 Mark Notification as Read

**Endpoint:** `PUT /notifications/{notif_id}`

**Headers:**

```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

**Request Body:**

```json
{
  "read": true
}
```

**Response:** `200 OK`

---

## 7. Health & Metrics

### 7.1 Service Health Check

**Endpoint:** `GET /health`

**Response:** `200 OK`

```json
{
  "status": "healthy",
  "service": "event-service",
  "timestamp": "2026-04-04T10:00:00Z",
  "uptime": 3600,
  "checks": {
    "database": "ok",
    "cache": "ok",
    "message_broker": "ok"
  }
}
```

---

### 7.2 Prometheus Metrics

**Endpoint:** `GET /metrics`

**Response:** `200 OK` (Prometheus text format)

```
# HELP event_service_requests_total Total number of requests
# TYPE event_service_requests_total counter
event_service_requests_total{method="GET",endpoint="/events",status="200"} 1234

# HELP event_service_request_duration_seconds Request duration in seconds
# TYPE event_service_request_duration_seconds histogram
event_service_request_duration_seconds_bucket{le="0.1",endpoint="/events"} 1000
event_service_request_duration_seconds_bucket{le="0.5",endpoint="/events"} 1200
```

---

## 8. Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| INVALID_REQUEST | 400 | Malformed request (missing field, invalid type) |
| VALIDATION_ERROR | 400 | Business logic validation failed |
| UNAUTHORIZED | 401 | Missing or invalid access token |
| FORBIDDEN | 403 | User lacks permission (e.g., not event creator) |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict (e.g., RSVP already exists) |
| RATE_LIMITED | 429 | Rate limit exceeded |
| SERVICE_UNAVAILABLE | 503 | Dependency unavailable (DB, cache) |
| INTERNAL_ERROR | 500 | Unexpected server error |

---

## 9. Rate Limiting

**Policy:** 100 requests per minute per IP address

**Response headers:**

```
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 1712192460
```

**On limit exceeded:** `429 Too Many Requests`

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded: 100 requests per minute",
    "retry_after": 30
  }
}
```

---

## 10. Pagination

All list endpoints support pagination:

**Request:**

```
GET /events?page=2&limit=20
```

**Response:**

```json
{
  "data": {
    "events": [ /* items */ ],
    "pagination": {
      "page": 2,
      "limit": 20,
      "total": 143,
      "pages": 8,
      "has_next": true,
      "has_prev": true
    }
  }
}
```

---

**Document Status:** APPROVED  
**Last Updated:** April 4, 2026

---

## Appendix: cURL Examples

### Login with Google OAuth2

```bash
# Step 1: Get authorization code (browser redirect)
curl -i "http://localhost:3000/api/auth/google"

# Step 2: After user grants permission, Google redirects with code
# Browser automatically handles callback
```

### Get Events

```bash
TOKEN="eyJhbGciOiJSUzI1NiIs..."
curl "http://localhost:3000/api/events?category=sports" \
  -H "Authorization: Bearer $TOKEN"
```

### Create Event

```bash
TOKEN="eyJhbGciOiJSUzI1NiIs..."
curl -X POST "http://localhost:3000/api/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Football Game",
    "description": "Giants vs Cowboys",
    "date": "2026-04-15T18:00:00Z",
    "location": "MetLife Stadium",
    "capacity": 200
  }'
```

### Create RSVP

```bash
TOKEN="eyJhbGciOiJSUzI1NiIs..."
curl -X POST "http://localhost:3000/api/events/event123/rsvps" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d ''
```

### WebSocket Chat

```bash
# Using websocat (https://github.com/vi/websocat)
TOKEN="eyJhbGciOiJSUzI1NiIs..."
websocat "ws://localhost:3002/chat?event_id=event789" \
  -H "Authorization: Bearer $TOKEN"

# Type message and press Enter
{"type": "message", "content": "Hey!"}
```
