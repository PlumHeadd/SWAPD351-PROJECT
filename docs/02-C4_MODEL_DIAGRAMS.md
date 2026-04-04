# Eventify Platform — C4 Model Architecture Diagrams

**Course:** SWAPD 351 — Software Architecture and Design (Spring 2026)  
**Date:** April 2026

This document contains the C4 Model diagrams (Context, Container, Component) for the Eventify event management platform.

---

## Level 1: System Context Diagram

Shows the Eventify system in context, with users and external systems.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     EVENTIFY SYSTEM CONTEXT                    │
│                                                                 │
│  ┌──────────────┐                    ┌─────────────────────┐   │
│  │     Web      │                    │   Eventify Event    │   │
│  │  Browser     │──────HTTP/HTTPS───▶│ Management Platform │   │
│  │   (React)    │◀─────Response───────│    (Docker Swarm)   │   │
│  └──────────────┘                    └─────────────────────┘   │
│        │                                        │               │
│        │                                        │               │
│  ┌─────▼──────────┐              ┌──────────────▼────────┐     │
│  │ Google OAuth2  │◀─────Verify──│   Eventify API        │     │
│  │  Provider      │──────Token───▶│   Gateway             │     │
│  └────────────────┘              └──────────────────────┘      │
│                                           │                     │
│                              ┌────────────┼────────────┐        │
│                              ▼            ▼            ▼        │
│                        ┌─────────┐ ┌────────┐ ┌────────┐       │
│                        │ User    │ │ Event  │ │ Chat   │       │
│                        │ Service │ │Service │ │Service │       │
│                        └─────────┘ └────────┘ └────────┘       │
│                                                                 │
│  Notes:                                                         │
│  - Users authenticate via Google OAuth2 (no password stored)    │
│  - API Gateway is single entry point; routes to services       │
│  - Services communicate via REST (sync) and RabbitMQ (async)   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Context Diagram Description

**External Actors:**
1. **Web User** — Events via React UI running in browser
2. **Google OAuth2 Provider** — Third-party authentication service

**System Boundary:**
- Eventify Platform consumes Google's OAuth2 service
- Platform exposes REST API via API Gateway
- Frontend calls API Gateway (not individual services)

---

## Level 2: Container Diagram

Shows major containers (microservices, databases, message queues) within Eventify.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EVENTIFY PLATFORM (Docker Compose)                   │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Load Balancer / Reverse Proxy                 │  │
│  │                         (Nginx / Docker Network)                      │  │
│  └───────────────┬──────────────────────────────────────────────────────┘  │
│                  │                                                          │
│    ┌─────────────┴──────────────────────────────────────┐                  │
│    │                                                    │                  │
│    ▼                                                    ▼                  │
│ ┌──────────────────────────────────┐  ┌──────────────────────────────┐   │
│ │      API Gateway                 │  │    Frontend                  │   │
│ │    (Node.js + Express)           │  │   (React + Nginx)            │   │
│ │  • Rate limiting (100 req/min)   │  │  • Serves UI                 │   │
│ │  • JWT validation                │  │  • Calls API Gateway         │   │
│ │  • Request routing               │  │  • Port 3080                 │   │
│ │  • Prometheus metrics            │  └──────────────────────────────┘   │
│ │  • Port 3000                     │                                       │
│ └──────┬──────────────────────────┘                                        │
│        │                                                                   │
│    ┌───┴────────────────┬──────────────────┬────────────────┐               │
│    ▼                    ▼                  ▼                ▼               │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ ┌───────────────┐  │
│ │ User Service │  │Event Service │  │Chat Service  │ │Notification   │  │
│ │(Node.js)     │  │(Python/Flask)│  │(Node.js)     │ │ Service       │  │
│ │ • OAuth2     │  │ • CRUD events│  │ • WebSocket  │ │(Python/Flask) │  │
│ │ • JWT issue  │  │ • RSVP mgmt  │  │ • Real-time  │ │ • RabbitMQ    │  │
│ │ • Passport.js│  │ • Caching    │  │   messaging  │ │   consumer    │  │
│ │ • Port 3001  │  │ • Port 5001  │  │ • Port 3002  │ │ • Email/push  │  │
│ └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │ • Port 5002   │  │
│        │                 │                  │         └───────┬───────┘  │
│        │                 │                  │                 │           │
│    ┌───┴──────┬──────────┴──────┬──────────┴──────┬──────────┴────┐       │
│    │          │                 │                 │               │       │
│    ▼          ▼                 ▼                 ▼               ▼       │
│ ┌──────────┐  ┌───────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────┐ │
│ │PostgreSQL│  │ MongoDB   │  │ RabbitMQ    │  │  Redis   │  │OpenSearch│ │
│ │Database  │  │ Database  │  │Message Queue│  │  Cache   │  │  Logs    │ │
│ │ • Users  │  │ • Events  │  │ • durable   │  │ • Session│  │ • Kibana │ │
│ │ • OAuth2 │  │ • Chat    │  │   queues    │  │ • Cache  │  │ • Dashboard
│ │   tokens │  │ • RSVP    │  │ • Durable   │  │ • Tokens │  │          │ │
│ │ • Port   │  │   messages│  │   delivery  │  │ • Rate   │  │ • Port   │ │
│ │   5432   │  │ • Port    │  │ • Port 5672 │  │  limits  │  │   9200   │ │
│ │ (Citus)  │  │   27017   │  │(admin: 15672)│ │ • Port  │  │ • Port   │ │
│ │(Sharded) │  │(Sharded)  │  │             │  │   6379  │  │   9300   │ │
│ └──────────┘  └───────────┘  └─────────────┘  └──────────┘  └─────────┘ │
│                                                                             │
│ Legend:                                                                    │
│  ─────► Synchronous (REST HTTP)                                           │
│  ═════► Asynchronous (RabbitMQ messaging)                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Container Diagram Legend

**Microservices (Compute):**
- **API Gateway:** Entry point; routes to services; validates JWT
- **User Service:** Authentication, profile management
- **Event Service:** Event CRUD, RSVP management, Redis caching
- **Chat Service:** WebSocket server, real-time messaging
- **Notification Service:** Asynchronous consumer; sends notifications

**Data Stores:**
- **PostgreSQL:** ACID for user/auth (Citus sharding for scale)
- **MongoDB:** Document DB for events, chat, RSVPs (sharded by event_id)
- **Redis:** In-memory cache; sessions; rate limit counters
- **RabbitMQ:** Durable message queue; topic-based routing
- **OpenSearch:** Centralized logging; full-text search

**Communication Patterns:**
- **Synchronous:** REST HTTP (solid lines)
- **Asynchronous:** RabbitMQ (dashed lines)

---

## Level 3: Component Diagram (Event Service)

Shows internal structure of Event Service — a key microservice with complex logic.

```
┌────────────────────────────────────────────────────────────────────┐
│                     EVENT SERVICE (Python/Flask)                   │
│                                                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                 Express Middleware Layer                  │   │
│  │  • JWT validation (x-user-id header)                      │   │
│  │  • CORS, Helmet                                           │   │
│  │  • Morgan logging                                         │   │
│  │  • Error handling                                         │   │
│  └────────────────────┬──────────────────────────────────────┘   │
│                       │                                           │
│    ┌──────────────────┼────────────────────────────────┐          │
│    │                  │                                │          │
│    ▼                  ▼                                │          │
│ ┌──────────────┐  ┌──────────────┐                   │          │
│ │Event Routes  │  │ RSVP Routes  │                   │          │
│ │ • GET /      │  │ • POST /     │                   │          │
│ │ • POST /     │  │ • DELETE /   │                   │          │
│ │ • GET /:id   │  │ • GET /:id   │                   │          │
│ │ • PUT /:id   │  │             │                   │          │
│ │ • DELETE/:id │  └───────┬──────┘                   │          │
│ └───────┬──────┘          │                          │          │
│         │                 ▼                          │          │
│         │         ┌──────────────┐                   │          │
│         │         │ Event Logic  │                   │          │
│         │         │ • Validate   │                   ▼          │
│         └────────▶│ • Transform  │───────────▶┌────────────┐    │
│                   │ • Pagination │            │Redis Cache │    │
│                   └───────┬──────┘            │ Component  │    │
│                           │                   │ • get()    │    │
│                           ▼                   │ • set()    │    │
│                   ┌───────────────┐          │ • TTL 5min │    │
│                   │DB Abstraction │          └────────────┘    │
│                   │ • Query build │                 ▲           │
│                   │ • Serialize   │                 │           │
│                   │ • Validate schema│            ┌─┴────────┐  │
│                   └────────┬───────┘             │          │  │
│                            │              ┌──────▼───┐  ┌───▼───┐│
│                            ▼              │Circuit   │  │Message │
│                   ┌─────────────────┐    │Breaker   │  │Publisher
│                   │MongoDB Driver   │    │Component │  │Component
│                   │ • Connection    │    │ • fail() │  │ • publish()
│                   │ • Query execute │    │ • reset()│  │ • bulkPublish
│                   │ • Error handling│    └──────────┘  └────────┘
│                   │ • Reconnect     │      (Pybreaker)  (pika)
│                   └─────────────────┘
│
│  Dependencies:
│   • Flask: Web framework
│   • PyMongo: MongoDB driver
│   • Redis: Connection pool
│   • pika: RabbitMQ client
│   • pybreaker: Circuit breaker
│   • prometheus_client: Metrics
│
│  Dataflow:
│   1. Request → JWT validation
│   2. Route handler → Business logic
│   3. Logic → Redis cache (check/set)
│   4. Cache miss → MongoDB query
│   5. Response transformation → JSON
│   6. Side effects → RabbitMQ publish
│
└────────────────────────────────────────────────────────────────────┘
```

### Component Diagram Description

**Internal Components:**

1. **Express Middleware Layer** — Authentication, logging, error handling
2. **Event Routes** — HTTP endpoints for CRUD operations
3. **RSVP Routes** — RSVP-specific endpoints
4. **Event Logic** — Business logic; validation; transformation
5. **Redis Cache Component** — Read-through cache for events
6. **Database Abstraction** — Query builder; serialization
7. **MongoDB Driver** — Connection pool; query execution
8. **Circuit Breaker Component** — Fault tolerance; fallback
9. **Message Publisher Component** — Publishes events to RabbitMQ

**Data Flow:**
1. Request arrives with JWT
2. Middleware validates token and injects `x-user-id`
3. Route handler calls event logic
4. Logic checks Redis cache first (TTL: 5 min)
5. Cache miss → MongoDB query via circuit breaker
6. Response serialized to JSON
7. Side effects (RSVP) published to RabbitMQ asynchronously

---

## Level 3: Component Diagram (API Gateway)

Shows API Gateway's routing and middleware responsibilities.

```
┌──────────────────────────────────────────────────────────────────┐
│           API GATEWAY (Node.js + Express)                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Incoming Request (Port 3000)                 │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│           ┌───────────────┼──────────────────┐                  │
│           ▼               ▼                  ▼                  │
│       ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│       │CORS Filter │  │Helmet      │  │Morgan      │           │
│       │(cors)      │  │(security)  │  │(logging)   │           │
│       └────────────┘  └────────────┘  └────────────┘           │
│           │               │                  │                  │
│           └───────────────┼──────────────────┘                  │
│                           │                                     │
│                           ▼                                     │
│                    ┌──────────────────┐                         │
│                    │ Rate Limiter     │                         │
│                    │ • Window: 60s    │                         │
│                    │ • Max: 100 req   │                         │
│                    │ • Per IP address │                         │
│                    └────────┬─────────┘                         │
│                           │                                     │
│                           ▼                                     │
│                    ┌──────────────────┐                         │
│                    │ JWT Validator    │                         │
│                    │ • Verify RS256   │                         │
│                    │ • Extract claims │                         │
│                    │ • Inject headers │                         │
│                    └────────┬─────────┘                         │
│                            │                                    │
│                ┌───────────┼────────────────┐                   │
│                │           │                │                   │
│                ▼           ▼                ▼                   │
│         ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│         │/api/auth │  │/api/     │  │/api/chat │              │
│         │router    │  │events    │  │router    │              │
│         │          │  │router    │  │          │              │
│         └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│              │             │             │                    │
│              │   ┌─────────┼─────────┐   │                    │
│              │   ▼         ▼         ▼   │                    │
│              │ ┌────────────────────────┐│                    │
│              └─▶│ HTTP Proxy Middleware ││                    │
│                │ (http-proxy-middleware)││                    │
│                │ • Target routing      ││                    │
│                │ • Request forwarding  ││                    │
│                │ • Response transparent││                    │
│                └────┬────────┬────────┬─┘                    │
│                     │        │        │                       │
│        ┌────────────┘        │        └──────────┐            │
│        ▼                     ▼                   ▼            │
│   ┌─────────────┐   ┌─────────────┐   ┌──────────────┐      │
│   │User Service │   │Event Service│   │Chat Service  │      │
│   │:3001        │   │:5001        │   │:3002         │      │
│   └─────────────┘   └─────────────┘   └──────────────┘      │
│                                                                │
│  Metrics:                                                     │
│   • http_requests_total{method, route, status}              │
│   • /metrics endpoint exposed for Prometheus scrape         │
│                                                                │
└──────────────────────────────────────────────────────────────────┘
```

### API Gateway Components

1. **CORS Filter** — Allows cross-origin requests from frontend
2. **Helmet** — Sets security headers (X-Frame-Options, CSP, etc.)
3. **Morgan Logger** — Logs all HTTP requests
4. **Rate Limiter** — 100 requests/minute per IP
5. **JWT Validator** — Verifies RS256 tokens; injects x-user-id header
6. **Proxy Routers** — Routes requests to appropriate services
7. **HTTP Proxy Middleware** — Transparent request/response forwarding

---

## Integration Points Between Components

### Synchronous Communication (REST)

```
Browser → API Gateway → User Service → PostgreSQL
                    ↓
                Event Service → MongoDB
                    ↓
                Chat Service → MongoDB
```

### Asynchronous Communication (RabbitMQ)

```
Event Service (RSVP created) → RabbitMQ Topic Exchange (eventify.events)
                                  ↓
                            [event.rsvp.created routing key]
                                  ↓
                        Notification Service consumes
                                  ↓
                            Send email/push notification
```

---

## Technology Stack per Component

| Component | Technology | Justification |
|---|---|---|
| API Gateway | Node.js/Express | Lightweight; excellent middleware ecosystem |
| User Service | Node.js/Express + Passport.js | Mature OAuth2 support |
| Event Service | Python/Flask + PyMongo | Fast CRUD; team familiarity |
| Chat Service | Node.js + Socket.io | Native WebSocket support |
| Notification Service | Python/Flask + pika | AMQP support; background jobs |
| PostgreSQL | Citus extension | Sharded ACID DB for auth data |
| MongoDB | (sharded by event_id) | Document DB for events/chat |
| Redis | Standalone | In-memory cache; sessions |
| RabbitMQ | (durable queues) | Reliable async messaging |
| OpenSearch | (ELK stack) | Centralized logging; dashboards |

---

**Document Status:** APPROVED  
**Last Updated:** April 4, 2026
