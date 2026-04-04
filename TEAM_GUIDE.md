# Eventify Platform — Team Guide

**Course:** SWAPD 351 — Software Architecture and Design, Spring 2026
**Team:** Habiba Magdy, Basmala Salah, Arwa Mohamed, Lana Mohamed

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Summary](#architecture-summary)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Service Details](#service-details)
6. [Database Design](#database-design)
7. [Authentication Flow](#authentication-flow)
8. [Message Flow (RabbitMQ)](#message-flow-rabbitmq)
9. [Caching Strategy (Redis)](#caching-strategy-redis)
10. [Monitoring & Logging](#monitoring--logging)
11. [How to Run](#how-to-run)
12. [How to Test](#how-to-test)
13. [API Endpoints Reference](#api-endpoints-reference)
14. [Frontend Pages](#frontend-pages)
15. [Docker Compose Services](#docker-compose-services)
16. [Phase 1 Documents](#phase-1-documents)
17. [Phase 2 Deliverables](#phase-2-deliverables)
18. [Common Issues & Fixes](#common-issues--fixes)
19. [What Each Team Member Should Know](#what-each-team-member-should-know)

---

## Project Overview

Eventify is an **event management platform** where users can:
- Sign in with their Google account (OAuth2)
- Create, browse, and search events
- RSVP to events (with capacity limits)
- Chat in real-time with other attendees (WebSocket)
- View a live dashboard with event stats and trending events
- Receive notifications when events are updated or when someone RSVPs

The system is built as **5 microservices** communicating via REST (synchronous) and RabbitMQ (asynchronous), backed by PostgreSQL, MongoDB, and Redis, with full monitoring via Prometheus + Grafana and centralized logging via OpenSearch.

---

## Architecture Summary

```
                    ┌─────────────┐
                    │   Browser   │
                    │  (React UI) │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │ API Gateway │ ← JWT validation, rate limiting
                    │  (Node.js)  │
                    └──┬──┬──┬────┘
              ┌────────┘  │  └────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │   User   │ │  Event   │ │   Chat   │
        │ Service  │ │ Service  │ │ Service  │
        │(Node.js) │ │(Python)  │ │(Node.js) │
        └────┬─────┘ └──┬───┬──┘ └──┬───────┘
             │          │   │       │
        ┌────▼───┐ ┌────▼─┐ │  ┌────▼────┐
        │Postgres│ │Mongo │ │  │  Redis   │
        └────────┘ │  DB  │ │  └─────────┘
                   └──────┘ │
                      ┌─────▼─────┐
                      │ RabbitMQ  │
                      └─────┬─────┘
                      ┌─────▼──────────┐
                      │  Notification  │
                      │   Service      │
                      │   (Python)     │
                      └────────────────┘
```

**Communication patterns:**
- **Synchronous (REST):** Client → API Gateway → User/Event/Chat Service. Used for operations needing immediate response (create event, RSVP, login).
- **Asynchronous (RabbitMQ):** Event/Chat Service → RabbitMQ → Notification Service. Used for side-effects (notifications) that don't need to block the user.

---

## Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| API Gateway | Node.js + Express | Lightweight, proxy middleware, JWT validation |
| User Service | Node.js + Express + Passport.js | Passport has mature Google OAuth2 support |
| Event Service | Python + Flask | Team familiarity, clean CRUD, pybreaker for circuit breakers |
| Chat Service | Node.js + Socket.io | Native WebSocket support for real-time messaging |
| Notification Service | Python + Flask + pika | Consumes RabbitMQ messages, Python AMQP libraries |
| User Database | PostgreSQL | ACID for user/auth data, Citus sharding |
| Event/Chat Database | MongoDB | Flexible schema, native sharding, high write throughput |
| Cache + Sessions | Redis | Sub-ms reads, session storage, rate limit counters |
| Message Broker | RabbitMQ | Durable queues, topic routing, reliable delivery |
| Logging | OpenSearch | Full-text log search, Kibana-compatible dashboards |
| Monitoring | Prometheus + Grafana | Industry standard metrics + visualization |
| Frontend | React + Bootstrap 5 | Component-based UI, responsive |
| Containers | Docker + Docker Compose | Consistent environments, one-command startup |

---

## Project Structure

```
eventify-platform/
├── start.bat                    # One-click launcher (double-click to run)
├── docker-compose.yml           # All 14 containers defined here
├── .env                         # Google OAuth2 + SMTP credentials (secret)
├── .env.example                 # Template for .env
├── .gitignore
├── README.md                    # Quick-start README
├── TEAM_GUIDE.md                # THIS FILE
│
├── docs/
│   ├── phase1/
│   │   ├── main.tex             # Full LaTeX design document (18 pages)
│   │   ├── main.pdf             # Compiled PDF
│   │   ├── adr-001.tex          # ADR: Microservices
│   │   ├── adr-002.tex          # ADR: Database selection
│   │   ├── adr-003.tex          # ADR: OAuth2 + JWT
│   │   ├── adr-004.tex          # ADR: RabbitMQ
│   │   ├── adr-005.tex          # ADR: Redis
│   │   └── adr-006.tex          # ADR: Multi-language
│   ├── adrs/                    # Same ADRs in Markdown for GitHub
│   │   ├── ADR-001-microservices.md
│   │   ├── ADR-002-database.md
│   │   ├── ADR-003-authentication.md
│   │   ├── ADR-004-message-broker.md
│   │   ├── ADR-005-redis.md
│   │   └── ADR-006-languages.md
│   └── api-specs/
│       ├── event-service-api.yaml   # OpenAPI 3.0 spec
│       └── user-service-api.yaml    # OpenAPI 3.0 spec
│
├── services/
│   ├── api-gateway/             # Port 3000
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/index.js         # Proxy + JWT + rate limit + metrics
│   ├── user-service/            # Port 3001
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/index.js         # Google OAuth2, profile CRUD, PostgreSQL
│   ├── event-service/           # Port 5001
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── app.py               # Event/RSVP CRUD, MongoDB, Redis, RabbitMQ
│   ├── chat-service/            # Port 3002
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/index.js         # Socket.io WebSocket chat, MongoDB
│   └── notification-service/    # Port 5002
│       ├── Dockerfile
│       ├── requirements.txt
│       └── app.py               # RabbitMQ consumer, Redis notifications
│
├── frontend/                    # Port 3080
│   ├── Dockerfile
│   ├── nginx.conf               # Reverse proxy to API Gateway
│   ├── package.json
│   ├── public/index.html
│   └── src/
│       ├── index.js
│       ├── App.js               # Router, auth state, navigation
│       └── components/
│           ├── Login.js         # Google OAuth2 sign-in
│           ├── EventList.js     # Browse/search events
│           ├── EventForm.js     # Create event form
│           ├── EventDetail.js   # View event, RSVP, delete
│           ├── Chat.js          # Real-time WebSocket chat
│           └── Dashboard.js     # Live stats (auto-refresh every 5s)
│
├── monitoring/
│   ├── prometheus.yml           # Scrape config for 5 services
│   └── grafana-datasources.yml  # Auto-connect Grafana to Prometheus
│
└── tests/
    ├── unit/
    │   ├── test_event_service.py      # 10 unit tests (Python)
    │   ├── test_notification_service.py # 3 unit tests (Python)
    │   └── test_api_gateway.test.js   # 4 unit tests (Jest)
    ├── integration/
    │   └── test_e2e.py               # 9 E2E + contract tests
    └── load/
        └── load_test.js              # k6 load test (up to 100 concurrent)
```

---

## Service Details

### API Gateway (Node.js, port 3000)
- **Entry point** for all client requests
- Validates JWT tokens and injects `x-user-id` header for downstream services
- Rate limits: 100 requests/minute per IP
- Proxies: `/api/auth/*` → User Service, `/api/events/*` → Event Service, `/api/chat/*` → Chat Service, `/api/notifications/*` → Notification Service
- Exposes `/metrics` for Prometheus and `/health` for health checks

### User Service (Node.js, port 3001)
- Google OAuth2 via Passport.js
- On successful login: creates user in PostgreSQL, generates JWT (HS256, 15min expiry)
- Stores refresh tokens in Redis (7-day expiry)
- Endpoints: `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/refresh`, `/api/users/me`, `/api/users/:id`

### Event Service (Python/Flask, port 5001)
- Full CRUD for events + RSVP management
- Stores events and RSVPs in MongoDB
- Caches event listings in Redis (5min TTL), invalidates on writes
- Publishes messages to RabbitMQ on event create/update/delete and RSVP create/cancel
- Circuit breaker (pybreaker) wraps all Redis and RabbitMQ calls
- Endpoints: `/api/events`, `/api/events/:id`, `/api/events/:id/rsvp`, `/api/events/:id/attendees`, `/api/events/stats`

### Chat Service (Node.js/Socket.io, port 3002)
- Real-time WebSocket messaging using Socket.io
- JWT authentication on WebSocket handshake
- Users join rooms by event ID
- Messages stored in MongoDB for history
- Publishes `chat.message` to RabbitMQ for notification triggers
- REST endpoint: `/api/chat/:eventId/messages` (chat history)

### Notification Service (Python/Flask, port 5002)
- Consumes messages from RabbitMQ queue `notification-queue`
- Listens for: `event.created`, `event.updated`, `event.deleted`, `rsvp.created`, `rsvp.cancelled`, `chat.message`
- Stores notifications in Redis (per user, up to 100)
- SMTP email capability configured (Gmail)
- Endpoint: `/api/notifications/:userId`

---

## Database Design

### PostgreSQL (User Service)
```
users table:
  id          UUID (PK, auto-generated)
  email       VARCHAR (unique)
  name        VARCHAR
  avatar_url  VARCHAR
  bio         TEXT
  google_id   VARCHAR (unique)
  created_at  TIMESTAMP
  updated_at  TIMESTAMP
```

### MongoDB (Event Service)
```
events collection:
  _id              ObjectId
  title            String
  description      String
  date             String (ISO)
  location         String
  category         String (conference|workshop|social|sports|music|other)
  max_capacity     Integer
  current_attendees Integer
  creator_id       String (user UUID)
  created_at       DateTime
  updated_at       DateTime

rsvps collection:
  _id        ObjectId
  event_id   String
  user_id    String
  rsvp_date  DateTime
```

### MongoDB (Chat Service)
```
messages collection:
  _id        ObjectId
  event_id   String (indexed)
  user_id    String
  user_name  String
  content    String
  timestamp  DateTime
```

---

## Authentication Flow

```
1. User clicks "Sign in with Google" on frontend
2. Browser redirects to → http://localhost:3000/api/auth/google
3. API Gateway proxies to → User Service
4. User Service redirects to → Google OAuth2 consent screen
5. User approves → Google redirects back to callback URL
6. User Service receives auth code → exchanges for Google profile
7. User Service creates/finds user in PostgreSQL
8. User Service generates JWT (signed with HS256)
9. User Service redirects to → http://localhost:3080/login?token=JWT
10. React app stores JWT in localStorage
11. All subsequent API calls include: Authorization: Bearer <JWT>
12. API Gateway verifies JWT, injects x-user-id header to downstream
```

---

## Message Flow (RabbitMQ)

```
Exchange: eventify.events (topic)

Routing keys:
  event.created    → when a new event is created
  event.updated    → when an event is edited
  event.deleted    → when an event is removed
  rsvp.created     → when someone RSVPs
  rsvp.cancelled   → when someone cancels RSVP
  chat.message     → when a chat message is sent

Queue: notification-queue
  Binds to: event.*, rsvp.*, chat.*
  Consumer: Notification Service (1 consumer)
  Delivery: at-least-once (durable queue, manual ack)
```

---

## Caching Strategy (Redis)

| Key Pattern | Service | TTL | Purpose |
|---|---|---|---|
| `events:list:{page}:{limit}:{cat}:{search}` | Event Service | 5 min | Cache event listings |
| `events:detail:{id}` | Event Service | 5 min | Cache single event |
| `refresh:{userId}` | User Service | 7 days | Refresh token storage |
| `notifications:{userId}` | Notification Service | None | Last 100 notifications |

Cache invalidation: On any write (create/update/delete), matching cache keys are deleted.

---

## Monitoring & Logging

### Prometheus (port 9090)
- Scrapes `/metrics` from all 5 services every 15 seconds
- Each service exposes default Node.js/Python metrics + custom counters

### Grafana (port 3030, admin/admin)
- Auto-configured with Prometheus as data source
- Create dashboards for: request rates, error rates, response times

### OpenSearch (port 9200) + Dashboards (port 5601)
- Centralized log storage
- Services can push logs via HTTP or Fluentd

---

## How to Run

### Prerequisites
- Docker Desktop installed and running
- Google OAuth2 credentials in `.env` file

### Start
```bash
# Option 1: Double-click
start.bat

# Option 2: Command line
docker-compose up --build -d
```

### Stop
```bash
docker-compose down
```

### Stop and delete all data
```bash
docker-compose down -v
```

---

## How to Test

### E2E Tests (Python)
```bash
pip install pytest requests
python -m pytest tests/integration/test_e2e.py -v
```

### Load Test (k6)
```bash
# Install k6: https://k6.io/docs/getting-started/installation/
k6 run tests/load/load_test.js
```

---

## API Endpoints Reference

### Authentication
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/google` | No | Start Google login |
| GET | `/api/auth/google/callback` | No | OAuth2 callback |
| POST | `/api/auth/refresh` | No | Refresh JWT |

### Users
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/users/me` | Yes | My profile |
| PUT | `/api/users/me` | Yes | Update my profile |
| GET | `/api/users/:id` | No | Public profile |

### Events
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/events` | No | List events |
| POST | `/api/events` | Yes | Create event |
| GET | `/api/events/:id` | No | Get event |
| PUT | `/api/events/:id` | Yes (creator) | Update event |
| DELETE | `/api/events/:id` | Yes (creator) | Delete event |
| POST | `/api/events/:id/rsvp` | Yes | RSVP |
| DELETE | `/api/events/:id/rsvp` | Yes | Cancel RSVP |
| GET | `/api/events/:id/attendees` | No | List attendees |
| GET | `/api/events/stats` | No | Dashboard stats |

### Chat
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/chat/:eventId/messages` | No | Chat history |
| WebSocket | `ws://localhost:3002` | JWT | Real-time chat |

### Notifications
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications/:userId` | No | User notifications |

---

## Frontend Pages

| Route | Component | Description |
|---|---|---|
| `/` | EventList | Browse and search events |
| `/login` | Login | Google OAuth2 sign-in |
| `/events/new` | EventForm | Create a new event |
| `/events/:id` | EventDetail | View event, RSVP, delete |
| `/events/:id/chat` | Chat | Real-time event chat room |
| `/dashboard` | Dashboard | Live stats (auto-refresh 5s) |

---

## Docker Compose Services

| Container | Image | Port | Purpose |
|---|---|---|---|
| api-gateway | Custom (Node.js) | 3000 | Request routing |
| user-service | Custom (Node.js) | 3001 | Auth + users |
| event-service | Custom (Python) | 5001 | Events + RSVPs |
| chat-service | Custom (Node.js) | 3002 | WebSocket chat |
| notification-service | Custom (Python) | 5002 | Notifications |
| frontend | Custom (React+Nginx) | 3080 | Web UI |
| postgres | postgres:16-alpine | 5432 | User database |
| mongodb | mongo:7 | 27017 | Event/chat database |
| redis | redis:7-alpine | 6379 | Cache + sessions |
| rabbitmq | rabbitmq:3-management | 5672/15672 | Message broker |
| opensearch | opensearch:2.11.0 | 9200 | Log storage |
| opensearch-dashboards | dashboards:2.11.0 | 5601 | Log UI |
| prometheus | prom/prometheus | 9090 | Metrics |
| grafana | grafana/grafana | 3030 | Dashboards |

---

## Phase 1 Documents

All in `docs/phase1/main.pdf` (18 pages):
1. Requirements Specification (FR, NFR, user stories, architectural drivers)
2. C4 Model Diagrams (Context, Container, Component — all TikZ)
3. 6 Architecture Decision Records
4. API Specifications (OpenAPI summaries + sync/async justification)
5. Resilience Strategies (circuit breaker, retry, MQ, health checks, rate limiting)
6. Technology Stack Summary

LaTeX source: `docs/phase1/main.tex` + `adr-*.tex`
OpenAPI specs: `docs/api-specs/*.yaml`
ADRs (Markdown): `docs/adrs/*.md`

---

## Phase 2 Deliverables

1. Full codebase (5 services + frontend + tests)
2. Docker Compose with 14 containers
3. All Dockerfiles (6 total)
4. Monitoring (Prometheus + Grafana configs)
5. Tests (unit + integration + contract + load)
6. start.bat launcher script

---

## Common Issues & Fixes

| Problem | Cause | Fix |
|---|---|---|
| User Service crashes on startup | PostgreSQL not ready yet | Built-in retry (15 attempts, 3s apart) |
| "Authentication required" on POST | JWT not being forwarded | Check `Authorization: Bearer <token>` header |
| Event creation fails | Body not forwarded by proxy | API Gateway must NOT use `express.json()` globally |
| Chat WebSocket won't connect | Wrong port in browser | Chat connects to port 3002, not 3000 |
| Google login shows error | Wrong callback URL | Must match: `http://localhost:3000/api/auth/google/callback` |
| OpenSearch high memory | Default JVM heap | Set `-Xms512m -Xmx512m` in docker-compose |
| RabbitMQ no consumers | Notification service not started | Check `docker logs eventify-platform-notification-service-1` |

---

## What Each Team Member Should Know

When presenting or answering questions, every member should be able to explain:

1. **Why microservices?** — Independent scaling, deployment, fault isolation (ADR-001)
2. **Why two databases?** — PostgreSQL for ACID user data, MongoDB for flexible event schemas (ADR-002)
3. **Why RabbitMQ over Kafka?** — Simpler routing for our notification use case, durable queues sufficient (ADR-004)
4. **Why Redis?** — Caching (sub-ms reads), session storage, rate limiting counters (ADR-005)
5. **Sync vs Async?** — Sync for user-facing (immediate response), async for side-effects (notifications)
6. **Circuit breaker?** — Prevents cascading failures; if Redis/RabbitMQ goes down, event creation still works
7. **How auth works?** — Google OAuth2 → JWT issued → stateless verification at API Gateway
8. **How chat works?** — Socket.io WebSocket per event room, messages stored in MongoDB, notified via RabbitMQ
