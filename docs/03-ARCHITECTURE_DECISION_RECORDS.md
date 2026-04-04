# Eventify Platform — Architecture Decision Records (ADRs)

**Course:** SWAPD 351 — Software Architecture and Design (Spring 2026)  
**Date:** April 2026

---

## Overview

This document consolidates all Architecture Decision Records for Eventify Platform. Each ADR documents a significant architectural decision, its rationale, and consequences.

**Decision Framework:**
- **Context:** Problem or situation
- **Decision:** Choice made
- **Rationale:** Why this choice
- **Consequences:** Trade-offs and implications

---

## ADR-001: Adoption of Microservices Architecture

**Status:** Accepted  
**Date:** 2026-03-15  
**Owner:** Architecture Team

### Context

Eventify comprises distinct business domains:
- User management & authentication
- Event discovery & RSVP management
- Real-time chat messaging
- Asynchronous notifications

A monolithic architecture would force all domains to scale and deploy together, creating:
- Deployment bottlenecks (any change requires full system re-deployment)
- Uneven scalability (events peak during specific times; users grow steadily)
- Technology constraints (team has polyglot preferences)

### Decision

Decompose the system into **five independently deployable microservices**:

1. **API Gateway** — Routing, JWT validation, rate limiting
2. **User Service** — Authentication, profile management
3. **Event Service** — Event CRUD, RSVP management, caching
4. **Chat Service** — WebSocket server, real-time messaging
5. **Notification Service** — Async consumer, email/push

Each service:
- Has its own data store (polyglot persistence)
- Owns its deployment pipeline
- Communicates via REST (sync) and RabbitMQ (async)
- Exposes metrics and health checks

### Rationale

**Positive Consequences:**
- **Independent Scaling:** Event Service scales independently from User Service
- **Team Autonomy:** Teams own service end-to-end (build, test, deploy)
- **Technology Flexibility:** Python for data-heavy Event Service; Node.js for Chat (WebSocket)
- **Fault Isolation:** Failure in Chat Service doesn't down Event Service
- **Continuous Deployment:** Can ship Event Service improvements without blocking others

**Trade-offs:**
- **Operational Complexity:** Multiple services to monitor, log, and troubleshoot
- **Network Latency:** Inter-service REST adds ~20-50ms per hop
- **Distributed Debugging:** Harder to trace bugs across service boundaries
- **Data Consistency:** Synchronizing state across services (eventual consistency)

### Mitigation Strategies

| Challenge | Mitigation |
|---|---|
| Operational Complexity | Centralized logging (OpenSearch); monitoring (Prometheus); health checks |
| Network Latency | Local caching via Redis; batch operations where possible |
| Distributed Debugging | Request tracing (correlation IDs); distributed logs |
| Data Consistency | RabbitMQ durability; Saga pattern for multi-service transactions |

### Related Decisions

- ADR-002: Database Selection (persistent data partitioned)
- ADR-004: RabbitMQ Message Broker (async communication)
- ADR-005: Redis Caching (reduce latency)

---

## ADR-002: Database Selection — PostgreSQL and MongoDB

**Status:** Accepted  
**Date:** 2026-03-15  
**Owner:** Data Team

### Context

Eventify has two distinct data models:

1. **User Data** (User Service)
   - Structured: User ID, name, email, OAuth2 tokens
   - High consistency: Auth data must not diverge across instances
   - Relational: Users have one-to-many relationships (tokens)
   - ACID requirements: Atomicity critical for token creation

2. **Event Data** (Event Service)
   - Semi-structured: Events have optional custom fields
   - Flexible schema: Event types evolve frequently
   - Sharding needs: High write throughput for RSVP updates
   - Nested aggregation: Event + Attendees + Chat in single unit

3. **Chat Data** (Chat Service)
   - Time-series like: Messages ordered by timestamp
   - High write rate: 100s of messages/second during peak
   - Eventual consistency: Reading old messages is acceptable

### Decision

**Polyglot Persistence:**

**PostgreSQL** for User Service:
- ACID compliance for auth data
- Citus extension for horizontal sharding (by user hash)
- Strong consistency guarantees

**MongoDB** for Event & Chat Services:
- Document model matches domain objects (Event, Message)
- Flexible schema for event attributes
- Sharded by `event_id` for event-local write locality
- Supports both transactional and eventual consistency queries

### Rationale

**Why PostgreSQL for Users:**
- Tokens must never diverge (ACID transactions)
- Relational schema: Users ↔ Tokens ↔ Sessions
- Citus allows horizontal scaling without sacrificing ACID
- Backup/recovery tooling mature

**Why MongoDB for Events & Chat:**
- Documents naturally represent Events + Attendees + Chat
- Schema flexibility (custom event fields, nested chat)
- High write throughput via sharding (per event)
- Supports both relational queries (aggregate attendees) and document queries

### Consequences

**Positive:**
- Each database optimized for its workload
- Horizontal scaling per service (no monolithic DB bottleneck)
- Technology choices justified per domain

**Negative:**
- Two SQL-like technologies (PostgreSQL + MongoDB aggregation)
- No cross-database joins (data redundancy in some cases)
- Backup/recovery strategy more complex
- Team must maintain expertise in both systems

### Data Consistency Model

| Scenario | Consistency Level | Mechanism |
|---|---|---|
| User auth token creation | ACID (PostgreSQL) | Transactional INSERT |
| Event RSVP count | Eventual (MongoDB + Redis) | Update via Event Service; cache invalidated asynchronously |
| Chat message delivery | Eventual (MongoDB) | Appended to chat collection; clients poll or WebSocket listen |
| Notification delivery | Eventual (RabbitMQ) | Durable queue; retry logic |

### Related Decisions

- ADR-001: Microservices (separate DBs per service)
- ADR-005: Redis Caching (reduces write pressure on MongoDB)

---

## ADR-003: OAuth2 via Google with JWT Tokens

**Status:** Accepted  
**Date:** 2026-03-15  
**Owner:** Security Team

### Context

Project requirements:
- Users must authenticate securely
- Multi-device support (web, future mobile)
- No password management burden (security + UX)
- Stateless authentication for microservices

Microservices challenge:
- Each request requires auth verification
- Can't use server-side sessions (stateless)
- Need lightweight, self-contained tokens

### Decision

**Google OAuth2 + JWT Architecture:**

1. User initiates login → Browser redirected to Google's consent screen
2. User grants permission → Google sends authorization code to callback URL
3. User Service exchanges code for access token + ID token (backend HTTP call)
4. User Service creates JWT (RS256-signed) containing:
   - User ID (`sub` claim)
   - Email (`email` claim)
   - Issued time (`iat`)
   - Expiration time (`exp`) — 5 minutes
5. JWTs sent to client (access token) and refresh token (7 days)
6. API Gateway validates JWT on every request:
   - Checks RS256 signature
   - Verifies exp time
   - Injects x-user-id header to downstream services
7. Client uses refresh token to get new access token when expired

### Rationale

**Why Google OAuth2:**
- Removes password management (security + UX)
- Google's security hardened against account takeover
- Multi-factor support (Google manages 2FA)
- No local database of passwords to breach

**Why JWT for Inter-Service Auth:**
- Stateless: No session lookup per request (performance)
- Scalable: Can verify signature locally without external calls
- Portable: Works across services in same cluster
- Standard: RFC 7519; widely understood

**Why RS256 (RSA):**
- Public key verification: Services can validate without User Service
- Asymmetric: User Service signs (private key); others verify (public key)
- Not HS256: Avoids sharing secret with all services

### Consequences

**Positive:**
- No password storage (eliminates category of breaches)
- JWT verification fast (local RSA verification)
- Refresh pattern allows short-lived access tokens
- Familiar to team (OAuth2 standard)

**Negative:**
- Google dependency: If Google down, users can't login
- JWT revocation delay: No way to instantly revoke token if user logs out (must wait 5 min expiry)
- Refresh token management: Must store refresh token securely (HttpOnly cookie)
- Clock sync: Requires NTP sync between services (unlikely issue)

### Mitigation Strategies

| Risk | Mitigation |
|---|---|
| Google dependency | Gracefully degrade to login page; local fallback if needed |
| Token revocation | Short TTL (5 min); blacklist refresh tokens on logout |
| Refresh token replay | Use secure HttpOnly cookies; rotate on each refresh |
| Clock skew | Add 30-second clock toleranceLeeway to JWT verification |

### Security Hardening

```
User Service (Token issuer):
  • Store Google secret securely (.env)
  • Sign JWTs with private key (not shared)
  • Verify refresh tokens in Redis blacklist on logout
  
API Gateway (Token validator):
  • Use public key to verify signature
  • Check expiration time strictly
  • Reject tokens without iss="eventify"
  
Client (Token holder):
  • Store access token in memory (not localStorage)
  • Store refresh token in HttpOnly cookie
  • Clear tokens on logout
```

### Related Decisions

- ADR-005: Redis (stores refresh token blacklist on logout)
- ADR-001: Microservices (JWT enables stateless auth across services)

---

## ADR-004: RabbitMQ as Message Broker

**Status:** Accepted  
**Date:** 2026-03-15  
**Owner:** Integration Team

### Context

Eventify has async workflows:
- **RSVP Integration:** Create RSVP → (async) → Send notification
- **Event Updates:** Update event → (async) → Notify interested users
- **Chat Notifications:** New message → (async) → Notify attendees

Challenges:
- Notifications must not block user-facing API (RSVP creation should be fast)
- Messages must survive broker restart (durability)
- Multiple subscribers (future: email, SMS, push notifications)
- Retry logic needed (notification service may be temporarily down)

### Decision

Use **RabbitMQ** with:
- **Durable queues:** Messages persisted to disk; survive restart
- **Topic exchanges:** Publish/subscribe pattern; routing keys (e.g., "event.created", "rsvp.accepted")
- **Dead letter exchanges:** Capture messages that fail after N retries
- **Manual acknowledgments:** Consumer must ACK after processing (requeue on failure)

### Topology

```
Event Service publishes:
  Exchange: eventify.events (topic, durable)
    Messages: { event_id, action, timestamp, data }
    
Routing keys:
  • event.created
  • event.updated
  • rsvp.created
  • rsvp.deleted
  • message.sent

Notification Service consumes:
  Queue: notifications (durable)
  Bindings: event.#, rsvp.#
  
Dead Letter Exchange:
  On 5 retries → messages moved to notifications.dlx
```

### Rationale

**Why RabbitMQ (vs Kafka):**
- **Message durability:** Survives broker/network failures
- **Per-consumer processing:** Exactly-once semantics
- **Simpler topology:** Topics easier than partitions
- **Operational simplicity:** Web UI built-in; no ZooKeeper

**Why Durable Queues + Manual ACK:**
- Messages survive notification service restart
- Failed messages auto-retry (requeue on nACK)
- No silent message loss

### Consequences

**Positive:**
- Decoupled services: Event Service ships fast; notifications async
- Durable delivery: Message never lost (unless broker disk failure)
- Flexible routing: Route keys allow fine-grained subscriptions
- Monitoring: Built-in web UI + metrics

**Negative:**
- Infrastructure complexity: Another service to operate
- Message ordering: Per-queue ordering only (global order across events not guaranteed)
- Debugging harder: Async makes request tracing harder
- Network partitions: Requires partition tolerance design

### Resilience Patterns

| Pattern | Implementation |
|---|---|
| **Retry** | Auto-requeue on nACK; max 5 retries before DLX |
| **Batching** | Notification Service batches email-sends |
| **Timeout** | Consumer timeout 30s; RabbitMQ requeues if no ACK |
| **DeadLetter** | After 5 retries → notifications.dlx for manual inspection |
| **Circuit Breaker** | Notification Service checks DB availability before processing |

### Related Decisions

- ADR-001: Microservices (enable async inside services)
- ADR-005: Redis (tracks retry counts; distributes load)

---

## ADR-005: Redis for Caching and Session Management

**Status:** Accepted  
**Date:** 2026-03-15  
**Owner:** Performance Team

### Context

Eventify has performance-critical paths:
- **Event listings:** 20+ events per page; frequently repeated queries
- **Dashboard:** Trending events; user stats; updated every few seconds
- **Rate limiting:** 100 requests/minute per IP; checked on every request
- **Session storage:** JWT signing doesn't require state; but refresh tokens must be revocable

Challenges:
- MongoDB queries (even with indexes) take ~50-100ms
- Dashboard re-queries on every page load (expensive aggregation)
- Rate limiting requires atomic counters (can't use DB)

### Decision

Use **Redis** (standalone, single instance for Phase 1; Cluster for Phase 2):

**Use Cases:**

1. **Event Caching (Write-Through Pattern)**
   ```
   GET /events/:id → 
     Check Redis (key: event:{event_id})
     Hit? Return cached (5 min TTL)
     Miss? Query MongoDB → Write Redis → Return
   ```

2. **Trending Events (Computed Cache)**
   ```
   GET /events/trending →
     Check Redis (key: trending_events)
     Hit? Return cached (1 min TTL)
     Miss? Aggregation query MongoDB → Cache result → Return
   ```

3. **Rate Limiting (Atomic Counter)**
   ```
   Every request:
     INCR ratelimit:{ip_address}:{minute}
     If count > 100 → 429 Too Many Requests
     TTL 60s per key
   ```

4. **Session/Token Management**
   ```
   JWT refresh token:
     Store in Redis upon login (ttl: 7 days)
     On logout: Remove from Redis (instant revocation)
     On refresh: Check Redis exists; if not, reject
   ```

5. **Chat "Typing" Indicator**
   ```
   User starts typing in event chat:
     SET typing:{event_id}:{user_id} true EX 5
     Other clients subscribe to key; see real-time indication
   ```

### Rationale

**Why Redis (vs Memcached):**
- **Data structures:** Not just key-value; sets, sorted sets, hashes (for counter namespacing)
- **Persistence:** RDB snapshots + AOF logs (better than Memcached)
- **Pub/Sub:** For chat typing indicators
- **Scripting:** Lua scripting for atomic rate limit ops
- **Operations:** Better debugging, introspection tools

**Cache Invalidation Strategy:**

| Scenario | Invalidation | TTL |
|---|---|---|
| Event modified | Active invalidation (DELETE event:{id}) | — |
| Event queried frequently | Passive (TTL expiry) | 5 min |
| Trending cache | Passive (TTL expiry) | 1 min |
| Rate limit counter | Passive (TTL expiry) | 60 sec |
| Refresh token (logout) | Active invalidation (DEL refresh_token:{user_id}) | — |

### Consequences

**Positive:**
- API response time halved (from 100ms to <50ms)
- Dashboard load reduced 10x (trending precomputed)
- Rate limiting fast (atomic ops; no DB round-trip)
- Refresh token revocation instant (no TTL delay)

**Negative:**
- Single point of failure (Redis down = degraded service)
- Cache invalidation complexity (consistency bugs if stale)
- Memory growth (need monitoring; eviction policies)
- Higher infrastructure cost (another service)

### Resilience & Monitoring

```
If Redis down:
  Event Service can't cache → falls through to MongoDB (slower)
  Rate limiting can't count → Default to allow (or block; configurable)
  
Monitoring:
  • eviction_rate (alert if high; indicates OOM)
  • hit_rate (should be >80% for events)
  • memory_usage (alert at 80% capacity)
  • connection_count (detect connection leaks)
```

### Scaling Strategy

| Phase | Approach | Notes |
|---|---|---|
| Phase 1 | Standalone Redis on VM | Single instance; RDB backups hourly |
| Phase 2 | Redis Cluster (3 nodes) | Sharding; HA with sentinel |
| Phase 3 | Redis Enterprise | Multi-region; automatic failover |

### Related Decisions

- ADR-002: Database Selection (Redis as secondary cache layer)
- ADR-001: Microservices (Redis shared across services)

---

## ADR-006: Multi-Language Service Implementation (Polyglot)

**Status:** Accepted  
**Date:** 2026-03-15  
**Owner:** Architecture Team

### Context

Team has diverse language expertise:
- 2 engineers strong in Node.js (APIs, async, middleware)
- 2 engineers prefer Python (data processing, libraries)

Project requirements:
- Demonstrate polyglot architecture (SWAPD 351 learning goal)
- Deploy quickly with tooling team knows
- Minimize context-switching overhead

Constraints:
- Container orchestration (Docker) supports any language
- Different services can use different runtimes
- No cross-language deployments needed

### Decision

**Language Assignment:**

| Service | Language | Framework | Why |
|---|---|---|---|
| API Gateway | Node.js v18+ | Express.js | Lightweight; excellent middleware; team expertise |
| User Service | Node.js v18+ | Express.js + Passport.js | Passport has best-in-class OAuth2 support |
| Event Service | Python 3.11 | Flask | Fast CRUD; lightweight; team familiarity |
| Chat Service | Node.js v18+ | Socket.io | Native WebSocket; real-time abstractions |
| Notification Service | Python 3.11 | Flask + pika | Async consumers; AMQP libraries better in Python |

### Rationale

**Why Node.js for Gateway/User/Chat Services:**

1. **I/O-Bound Workloads:** HTTP proxying, OAuth2 flow, WebSockets are I/O-bound
2. **Async/Await:** Native async/await; non-blocking I/O by default
3. **Express.js Maturity:** Middleware ecosystem unmatched (CORS, helmet, morgan, compression)
4. **WebSocket Libraries:** Socket.io abstracts WebSocket/fallbacks better than Python frameworks
5. **Team Skills:** 2 engineers very comfortable with Node.js patterns

**Why Python for Event & Notification Services:**

1. **Data Processing:** Event filtering, aggregation; Python libraries (pandas) shine
2. **AMQP Consumers:** pika library mature; Python async (asyncio) sufficient for consumers
3. **Development Speed:** Flask scaffolding faster than Express for CRUD
4. **Team Preference:** 2 engineers prefer Python readability for business logic
5. **Library Ecosystem:** richer libraries for JSON validation, circuit breakers (pybreaker)

**Why Not Single Language?**

- **Monoculture Risk:** If Node.js had critical bug, entire system affected
- **Learning Goal:** SWAPD 351 explicitly values polyglot skills
- **Tool Match:** WebSocket better in Node.js; background jobs better in Python
- **Team Efficiency:** Let engineers code in preferred language (faster, fewer bugs)

### Consequences

**Positive:**
- Tool-language match (best framework per domain)
- Engineer autonomy (code in preferred language)
- Fault isolation (Node.js bug in Event Service only)
- Demonstrable skill diversity (SWAPD 351 requirement)

**Negative:**
- Two dependency ecosystems (npm + pip)
- Two build/test pipelines (potential inconsistencies)
- Docker image sizes larger (both V8 + Python runtimes)
- Onboarding cost (team must learn both ecosystems)
- Library version management across languages

### Mitigation Strategies

| Challenge | Mitigation |
|---|---|
| Dependency management | Lock versions; use Dependabot for auto-updates |
| Test pipeline consistency | Docker for hermetic builds; same test patterns |
| Language drift | Architectural ADRs prevent service sprawl |
| Deployment complexity | Docker Compose hides language details |

### Development Workflow

```
Local Development:
  # Node.js services
  npm install
  npm start

  # Python services
  pip install -r requirements.txt
  python app.py

Docker (unified):
  docker-compose up --build
  (language differences hidden behind containers)

CI/CD:
  Dockerfile per service specifies language + version
  GitHub Actions jobs per language
```

### Related Decisions

- ADR-001: Microservices (enable different languages per service)
- No blocking dependency on single language ecosystem

---

## Decision Summary Table

| ADR | Decision | Impact | Status |
|---|---|---|---|
| ADR-001 | Microservices architecture | Enables scaling, team autonomy | Accepted |
| ADR-002 | PostgreSQL + MongoDB | Optimized per workload | Accepted |
| ADR-003 | Google OAuth2 + JWT | Secure, stateless auth | Accepted |
| ADR-004 | RabbitMQ messaging | Decoupled async workflows | Accepted |
| ADR-005 | Redis caching | High performance; session mgmt | Accepted |
| ADR-006 | Polyglot (Node.js + Python) | Team skills + tool match | Accepted |

---

## Architecture Evolution

**Phase 1 (Current):** MVP with Docker Compose; manual deployment

**Phase 2 (Q3 2026):** Kubernetes migration; Redis Cluster for HA

**Phase 3 (Q4 2026):** Multi-region; API versioning; gRPC for internal services

---

**Document Status:** APPROVED  
**Last Updated:** April 4, 2026  
**Next Review:** September 2026
