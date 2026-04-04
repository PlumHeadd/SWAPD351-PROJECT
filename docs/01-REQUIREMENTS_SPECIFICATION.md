# Eventify Platform — Requirements Specification Document

**Course:** SWAPD 351 — Software Architecture and Design (Spring 2026)  
**Team:** Habiba Magdy, Basmala Salah, Arwa Mohamed, Lana Mohamed  
**Date:** April 2026

---

## 1. Executive Summary

Eventify is a **scalable, event management web application** built with a microservices architecture. The platform enables users to discover, create, and manage events with real-time collaboration features. The system demonstrates enterprise-grade architectural patterns including service-oriented design, polyglot persistence, asynchronous communication, and comprehensive monitoring.

---

## 2. Functional Requirements

### 2.1 User Management & Authentication

| ID | Requirement | Description |
|---|---|---|
| FR-1.1 | Google OAuth2 Login | Users can authenticate via Google OAuth2 without managing passwords |
| FR-1.2 | JWT Token Management | System issues access tokens (5-min expiry) and refresh tokens (7-day expiry) |
| FR-1.3 | User Profiles | Users can view and update their profile (name, email, avatar) |
| FR-1.4 | Token Refresh | Users with valid refresh tokens can obtain new access tokens |
| FR-1.5 | Session Management | User sessions persisted in Redis for distributed authentication |

### 2.2 Event Management

| ID | Requirement | Description |
|---|---|---|
| FR-2.1 | Create Event | Authenticated users can create events with title, description, date, location, capacity |
| FR-2.2 | List Events | Users can browse all events with pagination (20 events/page) |
| FR-2.3 | Filter Events | Events can be filtered by category, date range, and keyword search |
| FR-2.4 | View Event Details | Users can view full event details including attendee count and RSVP status |
| FR-2.5 | Update Event | Event creator can update event details (except location after creation) |
| FR-2.6 | Delete Event | Event creator can delete events (including all RSVPs) |
| FR-2.7 | Trending Events | Dashboard displays trending events (by RSVP count in last 7 days) |
| FR-2.8 | Event Caching | Frequently accessed events cached in Redis (TTL: 5 minutes) |

### 2.3 RSVP Management

| ID | Requirement | Description |
|---|---|---|
| FR-3.1 | Create RSVP | Users can RSVP to events (first-come, first-served until capacity reached) |
| FR-3.2 | Cancel RSVP | Users can cancel their RSVP anytime |
| FR-3.3 | Check Capacity | System prevents RSVPs when event reaches capacity |
| FR-3.4 | Attendee List | Event creators can view attendee list |
| FR-3.5 | RSVP Notifications | Users receive notifications when RSVP confirmed or event capacity reached |

### 2.4 Real-Time Chat

| ID | Requirement | Description |
|---|---|---|
| FR-4.1 | WebSocket Connection | Establish persistent WebSocket connection per event |
| FR-4.2 | Send Message | Users can send text messages in event chat |
| FR-4.3 | Message History | Chat messages persisted in MongoDB with timestamp |
| FR-4.4 | Broadcast Messages | Messages broadcast to all connected users in event chat |
| FR-4.5 | User Metadata | Display sender name and avatar with each message |

### 2.5 Notifications (Async)

| ID | Requirement | Description |
|---|---|---|
| FR-5.1 | Event Update Notifications | Notify RSVPs when event details change |
| FR-5.2 | Capacity Notifications | Notify waiting users when capacity becomes available |
| FR-5.3 | RSVP Confirmations | Send confirmation when user RSVPs to event |
| FR-5.4 | Chat Notifications | Notify event attendees of new messages (optional) |
| FR-5.5 | Queue Durability | Messages remain in RabbitMQ if notification service down |

### 2.6 Dashboard & Analytics

| ID | Requirement | Description |
|---|---|---|
| FR-6.1 | Dashboard Overview | Display upcoming events, trending events, user's RSVPs |
| FR-6.2 | Event Statistics | Show event count, total RSVPs, average capacity utilization |
| FR-6.3 | Real-Time Stats | Dashboard updates real-time via WebSocket or polling |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-1.1 | API Response Time | p95 < 200ms for read operations |
| NFR-1.2 | P99 Response Time | p99 < 500ms for user-facing endpoints |
| NFR-1.3 | Chat Latency | WebSocket message delivery < 100ms, p95 |
| NFR-1.4 | Throughput | System supports 10,000 concurrent users |
| NFR-1.5 | Cache Hit Ratio | Maintain > 80% cache hit rate for event queries |

### 3.2 Reliability & Availability

| ID | Requirement | Target |
|---|---|---|
| NFR-2.1 | Uptime SLA | 99.9% (4 nines) availability excluding scheduled maintenance |
| NFR-2.2 | Service Fault Isolation | Failure of one service does not cascade to others |
| NFR-2.3 | Graceful Degradation | System remains functional if notification service is down |
| NFR-2.4 | Circuit Breaker | Prevent cascading failures with automatic fallback |
| NFR-2.5 | Health Checks | All services expose `/health` endpoint |

### 3.3 Scalability

| ID | Requirement | Target |
|---|---|---|
| NFR-3.1 | Horizontal Scaling | All services can scale horizontally via Docker/Kubernetes |
| NFR-3.2 | Database Sharding | PostgreSQL sharded via Citus, MongoDB sharded by event_id |
| NFR-3.3 | Stateless Services | All services are stateless (session state in Redis) |
| NFR-3.4 | Load Balancing | API Gateway distributes load across service instances |

### 3.4 Security

| ID | Requirement | Target |
|---|---|---|
| NFR-4.1 | Authentication | All APIs (except `/health` and `/metrics`) require Bearer token |
| NFR-4.2 | OAuth2 Standard | Google OAuth2 Authorization Code flow (RFC 6749) |
| NFR-4.3 | Token Expiry | Access tokens expire in 5 minutes; refresh tokens in 7 days |
| NFR-4.4 | HTTPS | All production traffic over TLS 1.2+ |
| NFR-4.5 | CORS | API Gateway enforces CORS policy |
| NFR-4.6 | Rate Limiting | 100 requests/minute per IP address |
| NFR-4.7 | Data Encryption | Passwords hashed with bcrypt; sensitive data at-rest encrypted |

### 3.5 Maintainability

| ID | Requirement | Target |
|---|---|---|
| NFR-5.1 | Observability | Full distributed tracing via OpenSearch + ELK stack |
| NFR-5.2 | Metrics | Prometheus metrics for all services; Grafana dashboards |
| NFR-5.3 | Logging | Structured JSON logs; centralized in OpenSearch |
| NFR-5.4 | Code Coverage | Minimum 70% test coverage for unit tests |
| NFR-5.5 | API Documentation | OpenAPI/Swagger specs for all services |

---

## 4. Architectural Drivers

### 4.1 Scalability
- **Challenge:** Handle peak traffic (events going viral, group RSVPs)
- **Solution:** Microservices allow independent scaling; Redis caching reduces DB load; MongoDB sharding for high write throughput
- **Trade-off:** Increased operational complexity vs. simpler monolith

### 4.2 Resilience
- **Challenge:** Notifications must not block user-facing operations; one service outage should not break entire platform
- **Solution:** Async messaging via RabbitMQ; circuit breakers; health checks; graceful degradation
- **Trade-off:** Eventual consistency vs. strong consistency

### 4.3 Maintainability
- **Challenge:** Team has diverse language preferences; need clear ownership boundaries
- **Solution:** Microservices per domain; polyglot architecture (Node.js + Python); clear API contracts
- **Trade-off:** Multiple runtimes vs. simpler deployment

### 4.4 Time-to-Market
- **Challenge:** Deliver MVP within semester
- **Solution:** Leverage existing frameworks (Express, Flask, React); use managed services (Google OAuth, RabbitMQ, Redis)
- **Trade-off:** Custom auth vs. OAuth2 simplicity

---

## 5. User Stories & Use Cases

### 5.1 User Story: Discover and RSVP to Events

**As a** user  
**I want to** browse events and RSVP  
**So that** I can attend events matching my interests

**Acceptance Criteria:**
- User can filter events by category and date
- User can see event details (capacity, attendee count, location)
- User can RSVP if capacity available
- User receives confirmation notification

**Preconditions:**
- User authenticated via Google OAuth2
- Event Service accessible

**Postconditions:**
- RSVP record created in MongoDB
- Attendee count incremented
- Notification queued in RabbitMQ

---

### 5.2 User Story: Create Event

**As a** user  
**I want to** create an event  
**So that** others can discover and join it

**Acceptance Criteria:**
- User can specify event title, description, date, location, capacity
- Event created with current user as organizer
- Event appears in browsable list
- User receives event creation confirmation

**Preconditions:**
- User authenticated

**Postconditions:**
- Event record in MongoDB
- Event cached in Redis
- Event indexed in OpenSearch

---

### 5.3 User Story: Real-Time Chat

**As an** attendee  
**I want to** chat with other attendees before the event  
**So that** we can coordinate logistics

**Acceptance Criteria:**
- Users connected to same event chat room via WebSocket
- Messages delivered in real-time (< 100ms latency)
- Message history available for late joiners
- User sees sender name and avatar

**Preconditions:**
- User RSVP'd to event
- Chat Service running

**Postconditions:**
- Message persisted in MongoDB
- Message broadcast to all connected users

---

### 5.4 User Story: Receive Notifications

**As a** user  
**I want to** be notified of event updates and confirmations  
**So that** I don't miss important information

**Acceptance Criteria:**
- Notifications sent asynchronously (don't block user operations)
- Notifications delivered even if user momentarily offline
- User can see notification history in UI

**Preconditions:**
- Event Service publishes events to RabbitMQ

**Postconditions:**
- Notification Service consumes RabbitMQ messages
- Notification queued for mail/push backend

---

## 6. Key Constraints & Assumptions

### 6.1 Constraints
- **Google OAuth2 Dependency:** Without Google's OAuth provider, users cannot authenticate
- **Network Latency:** Microservices introduce inter-service latency (add ~20-50ms per hop)
- **Database Consistency:** MongoDB (eventually consistent) acceptable for event data; PostgreSQL (ACID) for auth
- **Message Ordering:** RabbitMQ per queue (global ordering across services not guaranteed)
- **Docker Deployment:** All services containerized; local development requires Docker

### 6.2 Assumptions
- Teams have Docker & Docker Compose installed
- Google OAuth2 credentials provisioned (see `.env.example`)
- Kubernetes not required for Phase 1 (Docker Compose sufficient)
- Users tolerate ~5 second cache; event updates not instantaneous globally
- Network link between services is reliable (< 1% packet loss)

---

## 7. Success Criteria

| Metric | Target | Owner |
|---|---|---|
| All APIs documented in OpenAPI | 100% | Tech Lead |
| Unit test coverage | > 70% | QA Lead |
| Integration test pass rate | 100% | QA Lead |
| API response time (p95) | < 200ms | DevOps Lead |
| System uptime | 99.5% during demo | DevOps Lead |
| Team deployment <5 min | Achieved | DevOps Lead |

---

## 8. Out of Scope

- **SMS Notifications:** Only email/in-app notifications (Phase 2)
- **Payment Processing:** No ticketing or payment (external integration)
- **Mobile App:** Web-only in Phase 1; mobile in Phase 2
- **AI Recommendations:** No ML-based event suggestions
- **Video Streaming:** Event details only (no video playback)

---

## 9. Glossary

| Term | Definition |
|---|---|
| **RSVP** | Répondez S'il Vous Plaît — user's commitment to attend an event |
| **JWT** | JSON Web Token — stateless bearer token for authentication |
| **Circuit Breaker** | Pattern to fail fast and prevent cascading failures |
| **Sharding** | Horizontal database partitioning strategy |
| **Eventual Consistency** | Data consistency model where all updates propagate asynchronously |
| **Durable Queue** | Message queue persisted to disk; survives broker restart |

---

**Document Status:** APPROVED  
**Last Updated:** April 4, 2026
