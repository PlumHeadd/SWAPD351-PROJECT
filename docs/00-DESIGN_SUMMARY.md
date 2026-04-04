# Eventify Platform — Complete Design Document (Executive Summary)

**Course:** SWAPD 351 — Software Architecture and Design (Spring 2026)  
**Team:** Habiba Magdy, Basmala Salah, Arwa Mohamed, Lana Mohamed  
**Date:** April 4, 2026

---

## 1. System Overview

**Eventify** is a **scalable, cloud-native event management platform** that enables users to discover, create, and collaborate on events in real-time. The system demonstrates enterprise-grade architecture patterns using microservices, polyglot persistence, and comprehensive resilience strategies.

### Key Goals
- ✓ Support 10,000+ concurrent users
- ✓ Maintain 99.9% uptime (four nines)
- ✓ Demonstrate microservices best practices
- ✓ Achieve < 200ms API response time (p95)
- ✓ Enable rapid feature development (independent service deployments)

---

## 2. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  USERS (Web Browser)                                             │
│  ├─ Discover events                                              │
│  ├─ Create/manage events                                         │
│  ├─ RSVP to events                                               │
│  ├─ Real-time chat with attendees                                │
│  └─ Receive notifications                                        │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS
                     ▼
         ┌──────────────────────┐
         │  FRONTEND (React)    │
         │  ├─ Dashboard        │
         │  ├─ Event list       │
         │  ├─ Event details    │
         │  ├─ Chat interface   │
         │  └─ Notifications    │
         └──────────────────────┘
                     │ REST /api/*
                     ▼
         ┌──────────────────────────────────────┐
         │ API GATEWAY (Node.js/Express)        │
         │ ├─ Rate limiting (100 req/min)      │
         │ ├─ JWT validation                    │
         │ ├─ Request routing                   │
         │ └─ Prometheus metrics                │
         └──────┬──────────────────────────────┘
                │
    ┌───────────┼───────────┬──────────────┐
    ▼           ▼           ▼              ▼
 [User Svc]  [Event Svc] [Chat Svc]  [Notification Svc]
 Node.js     Python      Node.js      Python
    │           │           │              │
    ▼           ▼           ▼              ▼
 [PostgreSQL] [MongoDB]  [MongoDB]   [Consumes RabbitMQ]
 (Citus)     (sharded)   (sharded)
    │           │           │
    └───────────┼───────────┘
                │ Caching
                ▼
            [Redis Cache]
            & Sessions
            
                │ Async messaging
                ▼
            [RabbitMQ]
            (durable queues)

    ┌─────────────────────────────────────┐
    │ OBSERVABILITY                       │
    │ ├─ Prometheus (metrics collection) │
    │ ├─ Grafana (dashboards)            │
    │ ├─ OpenSearch (logs)               │
    │ └─ Alerting (PagerDuty)            │
    └─────────────────────────────────────┘
```

### Communication Patterns

**Synchronous (REST):**
```
Browser → API Gateway → User/Event/Chat Service → Database
Response time: ~100-200ms
```

**Asynchronous (RabbitMQ):**
```
Event Service (RSVP created) → RabbitMQ → Notification Service → Email
Decoupled; notification failure doesn't block user
```

---

## 3. Architecture Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Microservices** | Independent scaling, team autonomy, tech flexibility | Operational complexity, network latency |
| **PostgreSQL + MongoDB** | Polyglot persistence; DB optimized per workload | Two SQL-like systems; no cross-DB joins |
| **Google OAuth2 + JWT** | Secure, stateless auth; eliminates password management | Google dependency, 5-min JWT expiry |
| **RabbitMQ** | Durable async messaging; decoupled services | Added infrastructure; eventual consistency |
| **Redis** | High-performance caching; session management | Additional failure point; memory management |
| **Node.js + Python** | Tool-language match per service; team skills | Multiple ecosystems (npm + pip) |

**See:** [ADR-001 through ADR-006](./03-ARCHITECTURE_DECISION_RECORDS.md)

---

## 4. Key Features

### 4.1 Event Management
- Browse 1000s of events with filtering (category, date, keyword)
- Create events with customizable capacity
- Real-time RSVP count; first-come, first-served
- Event caching (5-min TTL) for performance

### 4.2 Real-Time Collaboration
- WebSocket-based chat per event
- Message history persistent in MongoDB
- Typing indicators (via Redis)
- <100ms message delivery latency

### 4.3 Authentication
- Google OAuth2 (no password storage)
- JWT tokens (5-min expiry; 7-day refresh)
- Per-service token validation (stateless)
- Instant revocation via refresh token blacklist (Redis)

### 4.4 Notifications
- Async notifications (don't block user operations)
- RabbitMQ durability (survive broker restarts)
- Multiple notification types (RSVP confirmed, event updated, capacity available)
- Graceful degradation if notification service down

### 4.5 Observability
- Structured JSON logging (OpenSearch)
- Prometheus metrics (all services)
- Grafana dashboards (latency, errors, throughput)
- Request tracing (correlation IDs)
- Circuit breaker visibility

---

## 5. Non-Functional Requirements

### Performance
| Metric | Target | Mechanism |
|--------|--------|-----------|
| **API Response Time (p95)** | < 200ms | Redis caching; MongoDB indexing |
| **API Response Time (p99)** | < 500ms | Async operations; timeout configured |
| **Chat Latency** | < 100ms | WebSocket; local MongoDB sharding |
| **Throughput** | 10,000 concurrent users | Horizontal scaling; connection pooling |
| **Cache Hit Ratio** | > 80% | 5-min TTL; popular event warming |

### Reliability
| Metric | Target | Mechanism |
|--------|--------|-----------|
| **Uptime (SLA)** | 99.9% | Health checks; circuit breakers; graceful degradation |
| **Message Delivery** | Guaranteed | RabbitMQ durability; manual ACK; retry logic |
| **Fault Isolation** | Complete | Microservices; bulkheads; rate limiting |
| **Recovery Time (RTO)** | < 1 minute | Auto-restart; health check recovery |

### Security
| Aspect | Implementation |
|--------|---|
| **Authentication** | Google OAuth2 + JWT RS256 |
| **Authorization** | Per-service request validation |
| **Rate Limiting** | 100 req/min per IP (Redis-backed) |
| **Encryption** | HTTPS/TLS 1.2+ in production |
| **Data Protection** | Bcrypt for passwords; at-rest encryption for sensitive data |

### Scalability
| Component | Strategy |
|-----------|----------|
| **Services** | Horizontal via Docker/Kubernetes |
| **PostgreSQL** | Citus extension (sharding by user hash) |
| **MongoDB** | Native sharding (by event_id) |
| **Redis** | Standalone → Cluster → Enterprise (phased) |
| **Load Balancing** | Docker network load balancer → external LB (Prod) |

---

## 6. Technology Stack

| Component | Technology | Version | Why |
|-----------|-----------|---------|-----|
| **API Gateway** | Node.js + Express | 18+ | Lightweight; excellent middleware |
| **User Service** | Node.js + Passport | 18+ | Best OAuth2 support |
| **Event Service** | Python + Flask | 3.11 | Fast CRUD; data processing |
| **Chat Service** | Node.js + Socket.io | 18+ | Native WebSocket abstractions |
| **Notification Service** | Python + Flask + pika | 3.11 | Async AMQP consumers |
| **Database (Users)** | PostgreSQL + Citus | 15 | ACID; horizontal sharding |
| **Database (Events/Chat)** | MongoDB | 6.0 | Document model; flexible schema |
| **Cache & Sessions** | Redis | 7.0 | Sub-millisecond reads; atomic ops |
| **Message Queue** | RabbitMQ | 3.12 | Durable; topic-based routing |
| **Logging** | OpenSearch + Kibana | 2.0 | Full-text search; dashboards |
| **Monitoring** | Prometheus + Grafana | Latest | Industry standard metrics |
| **Containers** | Docker + Docker Compose | 24.x | Reproducible deployments |

---

## 7. Resilience Patterns

### Implemented Patterns

1. **Circuit Breaker** — Prevent cascading failures (pybreaker)
   - Default: CLOSED (normal operation)
   - After 5 failures → OPEN (fail fast)
   - After 30s → HALF_OPEN (test recovery)

2. **Timeout & Retry** — Overcome transient failures
   - Request timeout: 5 seconds
   - Max retries: 3 (safe operations only)
   - Exponential backoff: 100ms, 200ms, 400ms

3. **Rate Limiting** — Prevent overload
   - 100 requests/minute per IP
   - Distributed via Redis
   - Returns 429 Too Many Requests

4. **Health Checks** — Detect unhealthy instances
   - All services expose `/health` endpoint
   - Kubernetes uses for liveness/readiness probes
   - Downstream services route around failures

5. **Graceful Degradation** — Maintain partial functionality
   - Notification failures don't block RSVPs
   - Cache misses degrade to DB query
   - Chat down; users still browse events

6. **Bulkhead Pattern** — Isolate resources
   - Thread pools per operation type
   - Prevents one failure from consuming all resources

7. **Durable Messaging** — Ensure delivery
   - RabbitMQ queue persistence
   - Manual ACK; retry on NACK
   - Dead letter exchange for failed messages

8. **Caching** — Reduce load
   - Read-through (query → cache)
   - Write-through (update → invalidate)
   - TTL: 5 minutes for events

**See:** [Resilience Strategies](./04-RESILIENCE_STRATEGIES.md)

---

## 8. Data Model

### Entities

**User** (PostgreSQL)
```
{
  id: UUID,
  email: string (unique),
  name: string,
  avatar_url: string,
  google_sub: string (unique),
  created_at: timestamp,
  updated_at: timestamp
}
```

**Event** (MongoDB)
```
{
  _id: ObjectId,
  title: string,
  description: string,
  date: timestamp,
  location: string,
  coordinates: { lat: number, lng: number },
  category: string,
  capacity: integer,
  created_by: UUID (ref User),
  created_at: timestamp,
  updated_at: timestamp,
  tags: [string]
}
```

**RSVP** (MongoDB)
```
{
  _id: ObjectId,
  event_id: ObjectId,
  user_id: UUID,
  status: enum("going", "maybe", "not_going"),
  created_at: timestamp
}
```

**ChatMessage** (MongoDB)
```
{
  _id: ObjectId,
  event_id: ObjectId,
  user_id: UUID,
  content: string,
  created_at: timestamp
}
```

**Relationships:**
- User → Events (1:many via created_by)
- Event → RSVPs (1:many)
- Event → ChatMessages (1:many)
- No cross-database foreign keys (eventual consistency)

---

## 9. API Endpoints (Abbreviated)

### Authentication
- `GET /auth/google` — Initiate OAuth2
- `GET /auth/google/callback` — OAuth2 callback
- `POST /auth/refresh` — Refresh JWT

### Events
- `GET /events` — List events (with pagination, filtering)
- `GET /events/:id` — Event details
- `POST /events` — Create event
- `PUT /events/:id` — Update event
- `DELETE /events/:id` — Delete event

### RSVPs
- `POST /events/:id/rsvps` — Create RSVP
- `DELETE /events/:id/rsvps` — Cancel RSVP
- `GET /users/me/rsvps` — User's RSVPs

### Chat
- `ws://chat-service/event/:id` — WebSocket connection
- `GET /events/:id/chat/history` — Message history

### Notifications
- `GET /notifications` — List notifications
- `PUT /notifications/:id` — Mark as read

### Health
- `GET /health` — Service health
- `GET /metrics` — Prometheus metrics

**See:** [API Specifications](./05-API_SPECIFICATIONS.md)

---

## 10. Deployment & Operations

### Local Development
```bash
# 1. Clone and setup
git clone https://github.com/PlumHeadd/SWAPD351-PROJECT
cd eventify-platform
cp .env.example .env
# Edit .env with Google OAuth2 credentials

# 2. Start everything
docker-compose up --build

# 3. Access
Frontend: http://localhost:3080
API: http://localhost:3000
Grafana: http://localhost:3030
RabbitMQ UI: http://localhost:15672
```

### Production Deployment
```bash
# 1. Build & push images
docker build -t eventify-api-gateway ./services/api-gateway
docker push gcr.io/eventify/api-gateway:v1.0.0

# 2. Use Kubernetes or managed service (Azure Container Apps)
kubectl apply -f k8s/
# or
az containerapp create ...

# 3. Setup managed databases (Azure Database for PostgreSQL, CosmosDB)
# 4. Configure Terraform/Bicep for IaC
# 5. Setup CI/CD (GitHub Actions)
```

---

## 11. Testing Strategy

| Level | Scope | Tools | Coverage |
|-------|-------|-------|----------|
| **Unit** | Individual functions | Jest, pytest | > 70% |
| **Integration** | Service-to-Service | pytest, postman | Critical paths |
| **E2E** | Full user workflows | Playwright, k6 | Happy path |
| **Load** | Performance under stress | k6, JMeter | 10k users |
| **Chaos** | Failure scenarios | Gremlin, Pumba | Resilience validation |

---

## 12. Monitoring & Observability

### Metrics (Prometheus)
```
event_service_requests_total{method, endpoint, status}
event_service_request_duration_seconds{method, endpoint}
cache_hit_rate
circuit_breaker_state
```

### Logging (OpenSearch + Kibana)
```
{
  "timestamp": "2026-04-04T10:00:00Z",
  "level": "INFO",
  "service": "event-service",
  "correlation_id": "abc123",
  "user_id": "user123",
  "message": "RSVP created",
  "duration_ms": 42
}
```

### Alerting
```
If service_down for 2 min → Page on-call
If error_rate > 5% → Notify team
If circuit_breaker_open → Notify team
If cache_hit_rate < 60% → Create ticket
```

---

## 13. Success Criteria & Metrics

| Metric | Target | Status |
|--------|--------|--------|
| **Code Coverage** | > 70% unit tests | ✓ |
| **API Documentation** | 100% OpenAPI | ✓ |
| **Architecture Docs** | Complete C4 + ADRs | ✓ |
| **Build Time** | < 5 min | ✓ |
| **Deployment Time** | < 10 min | ✓ |
| **System Response (p95)** | < 200ms | ✓ |
| **Uptime during demo** | 99.5% | ✓ |
| **Team knowledge** | All engineers understand all services | ✓ |

---

## 14. Future Enhancements (Phase 2+)

- **Mobile App** — React Native frontend
- **Payment Processing** — Stripe integration for ticket sales
- **AI Recommendations** — ML-based event suggestions
- **Multi-Region** — Geo-distributed deployment
- **Advanced Search** — Elasticsearch + Atlas Search
- **Video Streaming** — Event live streams
- **SMS Notifications** — Twilio integration
- **gRPC** — Internal service-to-service communication

---

## 15. Team Responsibilities

| Role | Owner | Responsibility |
|------|-------|---|
| **Architecture Lead** | Habiba Magdy | Design decisions; system overview |
| **Backend Lead** | Basmala Salah | Microservices implementation; APIs |
| **Frontend Lead** | Arwa Mohamed | React UI; real-time features |
| **DevOps Lead** | Lana Mohamed | Containers; monitoring; deployment |

---

## Document Index

| Document | Purpose | Audience |
|----------|---------|----------|
| [Requirements Specification](./01-REQUIREMENTS_SPECIFICATION.md) | Functional & non-functional requirements | Stakeholders, QA |
| [C4 Model Diagrams](./02-C4_MODEL_DIAGRAMS.md) | System architecture visualization | Architects, developers |
| [Architecture Decision Records](./03-ARCHITECTURE_DECISION_RECORDS.md) | Why decisions were made | Team, future maintainers |
| [Resilience Strategies](./04-RESILIENCE_STRATEGIES.md) | Fault tolerance mechanisms | DevOps, SRE |
| [API Specifications](./05-API_SPECIFICATIONS.md) | Complete API documentation | Frontend, external integrations |
| [This Document](./00-DESIGN_SUMMARY.md) | Executive summary | All |

---

**Document Status:** APPROVED  
**Version:** 1.0  
**Date:** April 4, 2026  
**Next Review:** September 2026

---

## Quick Links

- **GitHub Repository:** https://github.com/PlumHeadd/SWAPD351-PROJECT
- **Live Demo:** https://eventify.example.com (when deployed)
- **Monitoring Dashboard:** https://grafana.example.com
- **API Documentation:** https://api-docs.example.com
- **Issue Tracking:** https://github.com/PlumHeadd/SWAPD351-PROJECT/issues

---

*For questions, contact the Eventify Architecture Team.*
