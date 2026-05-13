# ADR-007: Integration Patterns (Synchronous vs Asynchronous Communication)

**Status:** Accepted  
**Date:** 2026-04-15  
**Updated:** 2026-05-04

## Context

The Eventify Platform consists of five microservices that need to communicate with each other. We must decide when to use synchronous (REST/HTTP) communication versus asynchronous (message broker) communication. This decision impacts system coupling, resilience, performance, and complexity.

## Decision

We adopt a **hybrid integration approach**:

### Synchronous Communication (REST/HTTP)
Use for:
- Request-response patterns requiring immediate feedback
- User-facing operations where latency matters
- Operations requiring guaranteed ordering within a single transaction
- Direct service-to-service queries

### Asynchronous Communication (RabbitMQ)
Use for:
- Event notifications that don't require immediate response
- Operations that can be processed in the background
- Fan-out patterns (one event, multiple consumers)
- Operations that benefit from temporal decoupling

## Rationale

### Synchronous Communication Use Cases

#### 1. Frontend → API Gateway → Microservices
**Pattern**: REST/HTTP  
**Why**: 
- Users expect immediate feedback
- Synchronous errors can be displayed to users
- Simpler mental model for frontend developers
- Standard HTTP status codes for error handling

**Examples**:
- GET /api/events (list events)
- POST /api/events (create event, return event ID immediately)
- POST /api/events/{id}/rsvp (RSVP, return success/failure immediately)

#### 2. Notification Service → User Service
**Pattern**: REST/HTTP  
**Why**:
- Notification service needs user details to send emails
- Simple lookup operation
- Fallback to cached user data if service unavailable

**Example**:
```
Notification Service receives event.created message
  ↓
GET http://user-service:3001/users/{creator_id}
  ↓
Compose and send email with user details
```

#### 3. API Gateway → All Services (Health Checks)
**Pattern**: REST/HTTP  
**Why**:
- Need immediate health status
- Simplifies monitoring and load balancing
- Standard endpoint: GET /health

### Asynchronous Communication Use Cases

#### 1. Event Creation → Notifications
**Pattern**: RabbitMQ Topic Exchange  
**Why**:
- Notification sending doesn't block event creation
- Multiple consumers can react to event (future: SMS, push notifications)
- If notification fails, event is still created
- Retry logic can be implemented independently

**Flow**:
```
Event Service creates event in MongoDB
  ↓
Publishes to RabbitMQ: events.created
  ↓ (asynchronous)
Notification Service consumes message
  ↓
Sends email notification
```

**Benefit**: Event creation API responds in 50ms instead of 300ms (waiting for email)

#### 2. RSVP → Notifications
**Pattern**: RabbitMQ Topic Exchange  
**Why**:
- RSVP confirmation is more important than notification
- Organizer should be notified asynchronously
- Future: Batch notifications (every 10 RSVPs)

**Flow**:
```
Event Service records RSVP
  ↓
Returns success to user immediately
  ↓ (parallel)
Publishes events.rsvp_added to RabbitMQ
  ↓
Notification Service notifies event organizer
```

#### 3. Chat Messages → Event Feed (Future)
**Pattern**: RabbitMQ  
**Why**:
- Chat Service doesn't need to know about consumers
- Multiple services can react to chat events
- Real-time updates can be implemented separately

## Trade-offs

### Synchronous Communication

**Advantages**:
- Simple to understand and implement
- Immediate feedback and error handling
- Easier to debug (stack traces)
- Request-response correlation is natural

**Disadvantages**:
- Tight coupling between services
- Cascading failures (if User Service down, login fails)
- Higher latency (waiting for downstream services)
- Requires circuit breakers for resilience

**Mitigation**:
- Circuit breakers on all sync calls (opossum, pybreaker)
- Timeouts to prevent hanging
- Retry logic with exponential backoff
- Fallback strategies where possible

### Asynchronous Communication

**Advantages**:
- Loose coupling (services don't need to know consumers)
- Better resilience (publisher doesn't fail if consumer down)
- Scalability (add consumers without changing publisher)
- Temporal decoupling (producer and consumer don't need to be online simultaneously)

**Disadvantages**:
- Increased complexity (need message broker)
- No immediate error feedback to user
- Debugging is harder (distributed tracing needed)
- Eventual consistency (notifications may be delayed)
- Message ordering challenges
- Duplicate message handling needed

**Mitigation**:
- RabbitMQ provides durability and delivery guarantees
- Dead letter queues for failed messages
- Correlation IDs for distributed tracing
- Idempotent message handlers

## Integration Patterns Summary

| Communication Type | Use Case | Technology | Examples |
|--------------------|----------|------------|----------|
| **Synchronous** | User-facing operations | REST/HTTP | Event CRUD, RSVP, User profile |
| **Synchronous** | Service queries | REST/HTTP | User lookup, Auth validation |
| **Asynchronous** | Notifications | RabbitMQ Topic | Email, SMS, Push |
| **Asynchronous** | Event-driven workflows | RabbitMQ Topic | Analytics, Audit logs |
| **Real-time** | Chat messaging | WebSocket | Socket.io |

## RabbitMQ Configuration

### Exchange
- **Name**: `eventify.events`
- **Type**: Topic (allows routing key patterns)
- **Durable**: Yes (survives broker restart)

### Routing Keys
- `events.created` - New event published
- `events.updated` - Event details changed
- `events.deleted` - Event removed
- `events.rsvp_added` - User RSVP'd
- `events.rsvp_cancelled` - User cancelled RSVP
- `chat.message_sent` - New chat message (future)

### Queues
- **Notification Queue**: Binds to `events.*`
- **Analytics Queue** (future): Binds to `events.*`, `chat.*`

### Message Format
```json
{
  "event_type": "events.created",
  "timestamp": "2026-05-04T15:30:00Z",
  "correlation_id": "uuid-v4",
  "data": {
    "event_id": "663f7a9b123456789abcdef0",
    "creator_id": "user-123",
    "title": "Spring Tech Conference 2026",
    "date": "2026-06-15T09:00:00Z"
  }
}
```

## Circuit Breaker Configuration

### Python Services (pybreaker)
```python
breaker = pybreaker.CircuitBreaker(
    fail_max=5,          # Open after 5 failures
    reset_timeout=30     # Try again after 30 seconds
)
```

### Node.js Services (opossum)
```javascript
const breaker = new CircuitBreaker(action, {
  timeout: 3000,         // 3 second timeout
  errorThresholdPercentage: 50,  // Open at 50% errors
  resetTimeout: 30000    // Try again after 30 seconds
});
```

## Error Handling Strategy

### Synchronous Errors
- Return appropriate HTTP status codes (400, 401, 404, 500)
- Include error message in response body
- Log error with correlation ID
- Client can retry or show error to user

### Asynchronous Errors
- Message sent to dead letter queue after max retries
- Error logged with full message context
- Alert triggered for manual investigation
- User notification may be delayed but event is still created

## Future Considerations

### Event Sourcing (Optional)
- Store all events in event store
- Rebuild state by replaying events
- Enables time-travel debugging
- Better audit trail

**Not Implemented Because**:
- Increased complexity
- Storage overhead
- Current audit log is sufficient
- Can be added later if needed

### CQRS (Command Query Responsibility Segregation) (Optional)
- Separate read and write models
- Optimize read model for queries
- Write model for commands

**Not Implemented Because**:
- Current scale doesn't require it
- Adds architectural complexity
- Single model works well for current needs

### Saga Pattern (Optional)
- Distributed transactions across services
- Compensating transactions for rollbacks

**Not Implemented Because**:
- Most operations are single-service
- RSVP is atomic (single MongoDB write)
- Event creation + notification failure is acceptable (notification can be retried)

## Monitoring

### Synchronous Metrics
- Request latency (p50, p95, p99)
- Error rate by endpoint
- Timeout rate
- Circuit breaker state

### Asynchronous Metrics
- Message publish rate
- Message consume rate
- Queue depth (lag)
- Message processing time
- Dead letter queue size

## Consequences

### Positive
- Clear guidelines for when to use each pattern
- Resilient to failures (circuit breakers + async messaging)
- Scalable (async consumers can scale independently)
- Good user experience (fast synchronous responses)

### Negative
- Need to manage message broker infrastructure
- Eventual consistency for notifications
- Debugging distributed systems is harder
- Team needs to understand both paradigms

### Neutral
- Increased operational complexity managed through Docker Compose
- RabbitMQ management UI helps with debugging
- Prometheus metrics help with monitoring

## Alternatives Considered

### Alternative 1: All Synchronous Communication
**Rejected Because**:
- Tight coupling between services
- Notifications would slow down event creation
- Single point of failure (if notification service down, event creation fails)
- Harder to scale (all services must scale together)

### Alternative 2: All Asynchronous Communication
**Rejected Because**:
- User-facing operations need immediate feedback
- More complex for simple CRUD operations
- No way to return immediate errors to users
- Frontend would need polling or WebSockets for everything

### Alternative 3: GraphQL Instead of REST
**Rejected Because**:
- Team unfamiliar with GraphQL
- REST is well-understood and has great tooling
- Sync vs async decision is independent of REST vs GraphQL
- Can be added later as a Gateway layer if needed

### Alternative 4: gRPC Instead of REST
**Rejected Because**:
- Harder to debug (binary protocol)
- Browser support requires gRPC-Web
- REST is more universal and well-documented
- HTTP/JSON easier for frontend developers

## Review and Updates

This ADR should be reviewed when:
- Adding new microservices
- Implementing new integration patterns
- Performance issues related to sync/async trade-offs
- Scaling beyond current capacity

**Last Reviewed**: 2026-05-04  
**Next Review**: 2026-08-01 (quarterly)
