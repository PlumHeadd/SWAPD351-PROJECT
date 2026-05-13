# C4 Container Diagram - Eventify Platform

## Container Architecture

This diagram shows the high-level technology choices and how containers communicate.

```mermaid
C4Container
    title Container Diagram for Eventify Platform

    Person(user, "User", "Event attendee or organizer")

    Container_Boundary(web, "Web Layer") {
        Container(frontend, "Frontend Web App", "React", "Provides event management UI, real-time chat interface")
        Container(gateway, "API Gateway", "Node.js/Express", "Routes requests, validates JWT tokens, applies rate limiting")
    }

    Container_Boundary(services, "Microservices") {
        Container(userSvc, "User Service", "Node.js/Express", "Handles OAuth2 authentication, user profile management")
        Container(eventSvc, "Event Service", "Python/Flask", "Manages events CRUD, RSVP system, event statistics")
        Container(chatSvc, "Chat Service", "Node.js/Socket.io", "Real-time messaging per event, message persistence")
        Container(notifSvc, "Notification Service", "Python/Flask", "Consumes events from queue, sends email notifications")
    }

    Container_Boundary(data, "Data Stores") {
        ContainerDb(postgres, "User Database", "PostgreSQL", "Stores user profiles, OAuth tokens")
        ContainerDb(mongo, "Event/Chat Database", "MongoDB", "Stores events, RSVPs, chat messages")
        ContainerDb(redis, "Cache & Sessions", "Redis", "Caching layer, session storage, rate limiting")
    }

    Container_Boundary(infra, "Infrastructure") {
        Container(rabbitmq, "Message Broker", "RabbitMQ", "Asynchronous event-driven communication")
        Container(prometheus, "Metrics Collection", "Prometheus", "Collects application and system metrics")
        Container(opensearch, "Log Storage", "OpenSearch", "Centralized logging and search")
        Container(grafana, "Monitoring Dashboard", "Grafana", "Visualizes metrics, configures alerts")
    }

    System_Ext(google, "Google OAuth2", "Authentication provider")

    Rel(user, frontend, "Uses", "HTTPS")
    Rel(frontend, gateway, "Makes API calls", "HTTPS/JSON")
    Rel(frontend, chatSvc, "Real-time messaging", "WebSocket")

    Rel(gateway, userSvc, "Routes auth requests", "HTTP/JSON")
    Rel(gateway, eventSvc, "Routes event requests", "HTTP/JSON")
    Rel(gateway, chatSvc, "Routes chat requests", "HTTP/JSON")
    Rel(gateway, notifSvc, "Routes notification requests", "HTTP/JSON")

    Rel(userSvc, postgres, "Reads/writes user data", "SQL")
    Rel(userSvc, redis, "Stores sessions", "Redis Protocol")
    Rel(userSvc, google, "Authenticates", "OAuth2/HTTPS")

    Rel(eventSvc, mongo, "Reads/writes events", "MongoDB Protocol")
    Rel(eventSvc, redis, "Caches event data", "Redis Protocol")
    Rel(eventSvc, rabbitmq, "Publishes events", "AMQP")

    Rel(chatSvc, mongo, "Persists messages", "MongoDB Protocol")
    Rel(chatSvc, rabbitmq, "Publishes chat events", "AMQP")

    Rel(notifSvc, rabbitmq, "Consumes events", "AMQP")
    Rel(notifSvc, userSvc, "Fetches user details", "HTTP/JSON")

    Rel(gateway, redis, "Rate limiting", "Redis Protocol")
    Rel(gateway, prometheus, "Exposes metrics", "/metrics endpoint")
    Rel(userSvc, prometheus, "Exposes metrics", "/metrics endpoint")
    Rel(eventSvc, prometheus, "Exposes metrics", "/metrics endpoint")
    Rel(chatSvc, prometheus, "Exposes metrics", "/metrics endpoint")
    Rel(notifSvc, prometheus, "Exposes metrics", "/metrics endpoint")

    Rel(prometheus, grafana, "Provides metrics data", "PromQL")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

## Container Responsibilities

### Web Layer

**Frontend (React)**
- Single Page Application
- Event browsing and filtering
- Event creation forms
- RSVP management
- Real-time chat interface
- User profile management

**API Gateway (Node.js/Express)**
- Single entry point for all client requests
- JWT token validation
- Request routing to microservices
- Rate limiting (10k requests/min)
- Security headers (Helmet.js)
- CORS management
- Request/response logging

### Microservices

**User Service (Node.js/Express)**
- Google OAuth2 integration (Passport.js)
- JWT token generation and refresh
- User profile CRUD
- Session management
- User authentication and authorization

**Event Service (Python/Flask)**
- Event CRUD operations
- RSVP management
- Event statistics calculation
- Event filtering and pagination
- Redis caching for performance
- Event creation publishes to RabbitMQ

**Chat Service (Node.js/Socket.io)**
- WebSocket server for real-time messaging
- Per-event chat rooms
- Message persistence to MongoDB
- Online presence tracking
- Chat history retrieval

**Notification Service (Python/Flask)**
- RabbitMQ consumer
- Email notification sending
- Notification history tracking
- Configurable notification preferences

### Data Stores

**PostgreSQL (User Database)**
- User profiles
- OAuth tokens
- Refresh tokens
- User roles and permissions
- Designed for relational user data

**MongoDB (Event/Chat Database)**
- Events collection (sharded by event_id)
- RSVPs collection
- Chat messages collection
- Supports flexible schema for events
- Optimized for high read/write throughput

**Redis (Cache & Sessions)**
- Event data caching (TTL: 5 minutes)
- Session storage
- Rate limiting counters
- Temporary data storage
- Circuit breaker state

### Infrastructure

**RabbitMQ (Message Broker)**
- Topic exchange: `eventify.events`
- Routing keys: `events.created`, `events.updated`, `events.rsvp_added`
- Durable queues
- Dead letter queues for failed messages
- Enables async event-driven architecture

**Prometheus (Metrics Collection)**
- Scrapes /metrics endpoints every 15s
- Stores time-series metrics data
- Provides PromQL query interface
- Retention: 15 days

**OpenSearch (Log Storage)**
- Centralized log aggregation
- Full-text search capabilities
- Log retention and indexing
- OpenSearch Dashboards for visualization

**Grafana (Monitoring Dashboard)**
- Pre-configured Eventify dashboard
- Real-time metrics visualization
- Alert rule configuration
- Integration with Prometheus

## Technology Choices

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Frontend | React | Modern, component-based, large ecosystem |
| API Gateway | Node.js/Express | Fast, async I/O, easy proxy configuration |
| User Service | Node.js/Express | OAuth2 libraries (Passport.js) |
| Event Service | Python/Flask | Strong data science libraries, team expertise |
| Chat Service | Node.js/Socket.io | Native WebSocket support |
| Notification Service | Python/Flask | Email libraries, async task handling |
| User DB | PostgreSQL | ACID compliance for user data |
| Event/Chat DB | MongoDB | Flexible schema, horizontal scaling |
| Cache | Redis | Sub-millisecond latency, atomic operations |
| Message Broker | RabbitMQ | Reliable delivery, flexible routing |
| Monitoring | Prometheus/Grafana | Industry standard, rich ecosystem |
| Logging | OpenSearch | Open source, powerful search |

## Communication Patterns

### Synchronous (REST/HTTP)
- Frontend ↔ API Gateway
- API Gateway ↔ Microservices
- Microservices ↔ Databases
- Notification Service → User Service (user lookup)

### Asynchronous (Message Broker)
- Event Service → RabbitMQ (event created, RSVP added)
- RabbitMQ → Notification Service (consume events)

### Real-time (WebSocket)
- Frontend ↔ Chat Service (bidirectional messaging)

## Ports

| Container | Port | Purpose |
|-----------|------|---------|
| Frontend | 3080 | Web UI |
| API Gateway | 3000 | REST API |
| User Service | 3001 | Internal API |
| Chat Service | 3002 | WebSocket + REST |
| Event Service | 5001 | Internal API |
| Notification Service | 5002 | Internal API |
| PostgreSQL | 5432 | Database |
| MongoDB | 27017 | Database |
| Redis | 6379 | Cache |
| RabbitMQ | 5672, 15672 | AMQP, Management UI |
| Prometheus | 9090 | Metrics UI |
| Grafana | 3030 | Dashboard UI |
| OpenSearch | 9200 | REST API |
| OpenSearch Dashboards | 5601 | Log UI |
