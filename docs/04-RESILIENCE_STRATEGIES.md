# Eventify Platform — Resilience Strategies & Fault Tolerance

**Course:** SWAPD 351 — Software Architecture and Design (Spring 2026)  
**Date:** April 2026

This document describes the resilience patterns, fault tolerance mechanisms, and recovery strategies implemented in Eventify.

---

## 1. Overview of Resilience Patterns

Eventify implements multiple overlapping resilience strategies to ensure the system remains functional even when components fail.

### Resilience Goals

| Goal | Target | Mechanism |
|---|---|---|
| **Availability** | 99.9% uptime | Circuit breakers; health checks |
| **Fault Isolation** | Service failure doesn't cascade | Bulkheads; async messaging |
| **Graceful Degradation** | System functional even if non-critical services down | Timeout; fallback; caching |
| **Recovery** | Automatic recovery without manual intervention | Exponential backoff; retries |
| **Observability** | Detect failures in <5 min | Logs; metrics; alerting |

---

## 2. Resilience Patterns Implemented

### 2.1 Circuit Breaker Pattern

**Purpose:** Prevent cascading failures when downstream service is unhealthy

**Implementation (Event Service → MongoDB):**

```python
# Event Service (app.py)
from pybreaker import CircuitBreaker

breaker = CircuitBreaker(fail_max=5, reset_timeout=30)

def get_event(event_id):
    try:
        # If breaker open, raises CircuitBreakerListener exception immediately
        return breaker.call(events_col.find_one, {'_id': ObjectId(event_id)})
    except CircuitBreakerListener:
        # Circuit OPEN: MongoDB is down
        # Try Redis cache fallback
        cached = redis_client.get(f'event:{event_id}')
        if cached:
            return json.loads(cached)
        else:
            # Total failure: return 503 Service Unavailable
            raise ServiceUnavailable("Event Service temporarily down")
```

**Behavior:**

| State | Behavior | Transition |
|---|---|---|
| **CLOSED** | Requests flow normally | After 5 consecutive failures → OPEN |
| **OPEN** | Block requests immediately; return error | After 30s → HALF_OPEN |
| **HALF_OPEN** | Try one request to check health | Success → CLOSED; Failure → OPEN |

**Benefits:**
- Prevents hammering failing downstream service
- Fast failure detection (no TCP timeout waiting)
- Automatic recovery without manual intervention

**Code Location:** [services/event-service/app.py](../../services/event-service/app.py#L50)

---

### 2.2 Timeout & Retry Strategy

**Purpose:** Limit how long requests wait; auto-retry transient failures

**Implementation (API Gateway → User Service):**

```javascript
// API Gateway (src/index.js)
const proxyOptions = {
  target: process.env.USER_SERVICE_URL,
  changeOrigin: true,
  timeout: 5000,  // 5 second timeout per request
};

app.use('/api/auth', createProxyMiddleware({
  ...proxyOptions,
  onError: (err, req, res) => {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      // Transient failure; client should retry
      res.status(503).json({ error: 'Service temporarily unavailable' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}));
```

**Retry Logic (Client-Side in Browser):**

```javascript
// Frontend (React)
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(5000)  // 5s timeout
      });
      if (response.ok) return response;
      if (response.status >= 500) throw new Error('Server error');
      return response;  // 4xx errors don't retry
    } catch (err) {
      if (attempt === maxRetries) throw err;
      
      // Exponential backoff: 100ms, 200ms, 400ms
      const delayMs = Math.pow(2, attempt - 1) * 100;
      console.log(`Retry attempt ${attempt} after ${delayMs}ms`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
```

**Parameters:**
- **Timeout:** 5 seconds per request
- **Max Retries:** 3 (transient failures only)
- **Backoff:** Exponential (100ms, 200ms, 400ms)
- **Idempotency:** Only safe operations (GET) auto-retry

**Benefits:**
- Transient network glitches overcome automatically
- Avoids overwhelming failing service (backoff)
- Timeout prevents hanging requests (resource leak)

---

### 2.3 Health Checks & Liveness Probes

**Purpose:** Detect and route around unhealthy instances

**Implementation (All Services):**

```javascript
// API Gateway + all Node.js services
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      redis: redisClient.ping().then(() => 'ok'),
      user_service: checkUpstream('http://user-service:3001/health'),
    }
  };
  
  res.json(health);
});
```

```python
# Event Service (Flask)
@app.route('/health', methods=['GET'])
def health_check():
    health = {
        'status': 'healthy',
        'service': 'event-service',
        'timestamp': datetime.now().isoformat(),
        'database': check_mongo(),  # Ping MongoDB
        'cache': check_redis()      # Ping Redis
    }
    
    if health['database'] != 'ok' or health['cache'] != 'ok':
        health['status'] = 'degraded'
        return jsonify(health), 503
    
    return jsonify(health), 200
```

**Docker Compose Health Check:**

```yaml
event-service:
  build: ./services/event-service
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:5001/health"]
    interval: 10s
    timeout: 3s
    retries: 3
    start_period: 5s
```

**Benefits:**
- Orchestrator (Kubernetes) can auto-restart failing containers
- Proactive monitoring (don't wait for user complaints)
- Upstream can route around unhealthy instances

---

### 2.4 Rate Limiting & Throttling

**Purpose:** Prevent one client from overloading service

**Implementation (API Gateway):**

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000,        // 1-minute window
  max: 100,                    // 100 requests per window
  standardHeaders: true,       // Send RateLimit-* headers
  legacyHeaders: false,        // Disable X-RateLimit-* headers
  store: new RedisStore({      // Use Redis for distributed counting
    client: redisClient,
    prefix: 'rl:',
  }),
  skip: (req) => req.path === '/health',  // Don't rate limit health checks
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

app.use(limiter);
```

**Behavior:**

```
Window 1 (0:00-0:59): Client makes 100 requests ✓
Request 101 at 0:59:30 → 429 Too Many Requests
Error message includes Retry-After header

Window 2 (1:00-1:59): Counter resets
Client can make 100 more requests
```

**Benefits:**
- Per-IP rate limiting (Redis stores counters)
- Prevents DDoS-like behavior from single clients
- Distributed across instances (Redis shared)

**Code Location:** [services/api-gateway/src/index.js](../../services/api-gateway/src/index.js#L30)

---

### 2.5 Bulkhead Pattern (Service Isolation)

**Purpose:** Isolate resources per client/request type; prevent one failure from consuming all resources

**Implementation (Request Pool Management):**

```python
# Event Service
# Use thread pool for different operation types
from concurrent.futures import ThreadPoolExecutor

read_pool = ThreadPoolExecutor(max_workers=10)      # GET /events
write_pool = ThreadPoolExecutor(max_workers=5)      # POST /events
rabbitmq_pool = ThreadPoolExecutor(max_workers=2)   # Send notifications

def get_events():
    return read_pool.submit(query_events_from_db)

def create_event():
    return write_pool.submit(insert_event)

def publish_notification():
    return rabbitmq_pool.submit(send_to_rabbitmq)
```

**Benefit:**
- Heavy reads (GET /events) don't starve writes (POST /events)
- RabbitMQ publishing doesn't block user-facing requests
- Thread pool prevents unbounded thread creation

---

### 2.6 Graceful Degradation

**Purpose:** System remains functional when non-critical service down

**Example: Notifications Service Unavailable**

```javascript
// Event Service: RSVP creation
async function createRsvp(eventId, userId) {
  // Step 1: Core operation (must succeed)
  await rsvps_col.insertOne({
    event_id: eventId,
    user_id: userId,
    created_at: new Date()
  });
  
  // Step 2: Side effect (nice-to-have; don't block)
  try {
    await publishToRabbitMQ('rsvp.created', {
      event_id: eventId,
      user_id: userId
    });
    // Success: notification will be sent async
  } catch (err) {
    // RabbitMQ down: Log error, continue
    console.error('Failed to publish RSVP notification:', err);
    // Notification Service will find message when it recovers
    // (RabbitMQ persists durable queues to disk)
  }
  
  // Return success to user regardless of notification status
  return { status: 'rsvp_created', rsvp_id: ... };
}
```

**Behavior:**

```
Normal scenario:
  RSVP created → Published to RabbitMQ → Notification Service sends email
  User sees: ✓ You've RSVP'd to the event
  
Notification Service down:
  RSVP created → Published to RabbitMQ (queued)
  User sees: ✓ You've RSVP'd to the event (same!)
  When Notification Service recovers: Processes queued messages
```

**Benefits:**
- User request succeeds even if async service is down
- Messages not lost (durable RabbitMQ queue)
- Zero manual intervention needed for recovery

---

### 2.7 Caching & Cache Invalidation

**Purpose:** Reduce load on databases; improve performance

**Read-Through Cache Pattern (Event Service):**

```python
def get_event(event_id):
    # Try cache first
    cache_key = f'event:{event_id}'
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Cache miss: query MongoDB
    event = events_col.find_one({'_id': ObjectId(event_id)})
    if event:
        # Populate cache (5-minute TTL)
        redis_client.setex(cache_key, 300, json.dumps(serialize_event(event)))
    
    return event
```

**Cache Invalidation (Write-Through Pattern):**

```python
def update_event(event_id, updates):
    # Step 1: Update database
    result = events_col.update_one(
        {'_id': ObjectId(event_id)},
        {'$set': updates}
    )
    
    # Step 2: Invalidate cache (must be atomic or tolerate stale reads)
    cache_key = f'event:{event_id}'
    redis_client.delete(cache_key)  # Lazy reload next GET
    
    # Step 3: Optionally warm cache (for popular events)
    event = events_col.find_one({'_id': ObjectId(event_id)})
    redis_client.setex(cache_key, 300, json.dumps(serialize_event(event)))
    
    return event
```

**Cache Coherency:**

| Scenario | Approach | Trade-off |
|---|---|---|
| Update + sync invalidate | Delete cache immediately | Consistent but slow |
| Update + async invalidate | Delete cache in background | Fast but brief stale reads |
| TTL expiry only | Never invalidate; let TTL expire | Simple but potentially stale (5 min) |

**For Eventify:** Use TTL + active invalidation:
- Trending event updates → active invalidate (user sees fresh data quickly)
- Event detail updates → TTL expiry (eventual consistency acceptable)

---

### 2.8 Async Messaging & Durable Queues

**Purpose:** Decouple producers from consumers; ensure message delivery

**RabbitMQ Setup (Docker Compose):**

```yaml
rabbitmq:
  image: rabbitmq:3.12-management
  ports:
    - "5672:5672"      # AMQP port
    - "15672:15672"    # Management UI
  environment:
    RABBITMQ_DEFAULT_USER: guest
    RABBITMQ_DEFAULT_PASS: guest
  volumes:
    - rabbitmq-data:/var/lib/rabbitmq
```

**Durable Exchange & Queue:**

```python
def get_rabbitmq_channel():
    try:
        connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        channel = connection.channel()
        
        # Declare durable exchange (survives broker restart)
        channel.exchange_declare(
            exchange='eventify.events',
            exchange_type='topic',
            durable=True  # Persisted to disk
        )
        
        # Declare durable queue (durable=True)
        channel.queue_declare(
            queue='notifications',
            durable=True,  # Persisted to disk
            arguments={
                'x-max-priority': 10,  # Priority queue
                'x-dead-letter-exchange': 'eventify.dlx'  # Dead letter handling
            }
        )
        
        # Bind queue to exchange with routing key pattern
        channel.queue_bind(
            exchange='eventify.events',
            queue='notifications',
            routing_key='event.*'  # Consume event.* messages
        )
        
        return channel
    except Exception as e:
        logger.error(f'Failed to connect to RabbitMQ: {e}')
        return None
```

**Publisher (Event Service):**

```python
def publish_message(routing_key, data):
    try:
        channel = get_rabbitmq_channel()
        if not channel:
            logger.error('RabbitMQ not available')
            return False
        
        # Publish with delivery_mode=2 (persistent)
        channel.basic_publish(
            exchange='eventify.events',
            routing_key=routing_key,
            body=json.dumps(data),
            properties=pika.BasicProperties(
                delivery_mode=pika.spec.PERSISTENT_DELIVERY_MODE,
                content_type='application/json'
            )
        )
        logger.info(f'Published {routing_key} to RabbitMQ')
        return True
    except Exception as e:
        logger.error(f'Failed to publish message: {e}')
        return False
```

**Consumer (Notification Service):**

```python
def consume_messages():
    try:
        connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        channel = connection.channel()
        
        # QoS: Prefetch only 1 message (slow consumer protection)
        channel.basic_qos(prefetch_count=1)
        
        def callback(ch, method, properties, body):
            try:
                message = json.loads(body)
                logger.info(f'Processing message: {message}')
                
                # Process message (send email, etc.)
                send_notification(message)
                
                # Acknowledge after successful processing
                ch.basic_ack(delivery_tag=method.delivery_tag)
                logger.info(f'ACK message: {method.delivery_tag}')
            except Exception as e:
                logger.error(f'Failed to process message: {e}')
                # NACK without requeue → move to dead letter exchange
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        
        channel.basic_consume(
            queue='notifications',
            on_message_callback=callback,
            auto_ack=False  # Manual acknowledgment
        )
        
        logger.info('Start consuming messages...')
        channel.start_consuming()
    except Exception as e:
        logger.error(f'Consumer error: {e}')
```

**Message Flow with Failures:**

```
Event Service publishes RSVP:
  message = { event_id: 123, user_id: 456 }
  → RabbitMQ durable queue

Notification Service (normal):
  Consume → Send email → ACK
  
Notification Service crashes (mid-email):
  Consume → Send email (fails) → NACK (requeue=False)
  → Message moved to dead letter exchange (DLX)
  → Manual review queue
  
Notification Service recovers:
  Next startup → Consumes unprocessed messages from queue
  All persisting messages automatically reprocessed
```

**Benefits:**
- Durable queue survives broker/network restarts
- No manual message recovery needed
- Dead letter handling for persistent failures
- Prefetch control prevents slow consumer from starving others

---

## 3. Monitoring & Failure Detection

### 3.1 Prometheus Metrics

**Metrics exposed by all services:**

```
# Event Service (Flask)
event_service_requests_total{method, endpoint, status}
event_service_request_duration_seconds{method, endpoint}
mongodb_query_errors_total{operation}
rabbitmq_messages_published_total{routing_key, status}
cache_hits_total{key_pattern}
cache_misses_total{key_pattern}
circuit_breaker_state{service}  # 0=CLOSED, 1=OPEN, 2=HALF_OPEN
```

**Prometheus scrape config (`monitoring/prometheus.yml`):**

```yaml
scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
  
  - job_name: 'event-service'
    static_configs:
      - targets: ['event-service:5001']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

---

### 3.2 Alerting Rules

**Alert thresholds (`monitoring/alerts.yml`):**

```yaml
groups:
  - name: eventify_alerts
    rules:
      # Alert if service down
      - alert: ServiceDown
        expr: up{job=~".*-service"} == 0
        for: 2m
        annotations:
          summary: "{{ $labels.job }} is down"
      
      # Alert if circuit breaker open
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state{service="mongodb"} == 1
        for: 1m
        annotations:
          summary: "Circuit breaker to MongoDB is open"
      
      # Alert if high error rate
      - alert: HighErrorRate
        expr: |
          rate(event_service_requests_total{status=~"5.."}[5m]) > 0.05
        annotations:
          summary: "Error rate > 5% for event-service"
      
      # Alert if cache hit rate low
      - alert: LowCacheHitRate
        expr: |
          rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) < 0.6
        annotations:
          summary: "Cache hit rate < 60%"
```

**Alert routing (Alertmanager):**

```
ServiceDown → Page on-call engineer (Slack, PagerDuty)
CircuitBreakerOpen → Notify team (email)
HighErrorRate → Notify team (email)
LowCacheHitRate → Create Jira ticket (background task)
```

---

### 3.3 Distributed Tracing (Correlation IDs)

**Correlation ID injection (API Gateway):**

```javascript
const { v4: uuidv4 } = require('uuid');

app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  
  // Inject into response headers
  res.set('X-Correlation-ID', correlationId);
  
  // Inject into downstream requests
  req.headers['x-correlation-id'] = correlationId;
  
  next();
});
```

**Logging with correlation ID (Event Service):**

```python
import logging
from flask import request

logger = logging.getLogger(__name__)

def log_with_context(level, message, **kwargs):
    correlation_id = request.headers.get('x-correlation-id', 'unknown')
    user_id = request.headers.get('x-user-id', 'anonymous')
    logger.log(level, f'[{correlation_id}] [{user_id}] {message}', **kwargs)

@app.route('/events', methods=['GET'])
def list_events():
    log_with_context(logging.INFO, 'Listing events')
    # ...
```

**Trace flow example:**

```
Browser → API Gateway [correlation-id: abc123]
          (logs: [abc123] Got /events request)
          
          → Event Service [x-correlation-id: abc123]
            (logs: [abc123] Querying events)
            
            → MongoDB
            (logs: [abc123] MongoDB query took 50ms)
          
          (logs: [abc123] Returning 20 events)
          
OpenSearch can search:
  correlation_id:abc123
  
Gets full request trace across services
```

---

## 4. Failure Scenarios & Recovery

### 4.1 MongoDB Unavailable

**Detection:**
- Health check fails
- Circuit breaker opens
- Alert triggered (ServiceDown)

**User Impact:**
- RSVP creation fails → 503 Service Unavailable
- Event listing returns cached results (if available)
- Chat messages queued to Redis (deferred write)

**Recovery:**
1. Infrastructure team restarts MongoDB container
2. Health check passes → Circuit breaker closes
3. Service automatically resumes accepting requests
4. No manual intervention needed

---

### 4.2 RabbitMQ Broker Restart

**Detection:**
- Notification Service loses connection
- Publishing attempts fail (but are logged)

**Message Durability:**
- RabbitMQ persists durable queues to disk
- Event Service publishes successfully before restart
- After restart: Queued messages still present

**Recovery:**
1. RabbitMQ container restarts
2. Notification Service reconnects
3. Consumes all queued messages
4. Users see notifications (may be delayed by restart time)

---

### 4.3 Redis Cluster Failure

**Scenario A: Cache miss → acceptable**
- Event Service queries MongoDB instead
- Performance degrades (100ms vs 5ms)
- Users don't notice (still < 200ms SLA)

**Scenario B: Session loss → acceptable**
- User's JWT refresh token lost from Redis
- User can re-login with Google OAuth2
- No data loss (token blacklist is best-effort)

**Recovery:**
1. Restart Redis container
2. Services detect availability; resume caching
3. Performance returns to normal

---

### 4.4 Chat Service Crash

**Detection:**
- WebSocket connections drop
- Browser attempts reconnect
- Health check fails

**User Impact:**
- Chat users see "Disconnected" message
- Can still view event; RSVP, etc. (other services unaffected)
- Chat messages in MongoDB not lost

**Recovery:**
1. Container auto-restarts (Docker policy)
2. Users see "Reconnected" message
3. Receive missed messages (option to load history)
4. No manual intervention

---

## 5. Resilience Checklist

| Aspect | Implementation | Status |
|---|---|---|
| **Health Checks** | All services expose `/health` endpoint | ✓ |
| **Circuit Breakers** | MongoDB access protected | ✓ |
| **Timeouts** | 5s per request; 30s per operation | ✓ |
| **Retries** | Exponential backoff (100ms, 200ms, 400ms) | ✓ |
| **Rate Limiting** | 100 req/min per IP (Redis-backed) | ✓ |
| **Bulkheads** | Thread pools isolate read/write/async ops | ✓ |
| **Graceful Degradation** | Notifications async; don't block users | ✓ |
| **Caching** | Redis (5-min TTL) for frequent queries | ✓ |
| **Durable Messaging** | RabbitMQ persists queues to disk | ✓ |
| **Monitoring** | Prometheus metrics; Grafana dashboards | ✓ |
| **Alerting** | Alert rules for downtime, errors | ✓ |
| **Logging** | Structured JSON; OpenSearch centralized | ✓ |
| **Tracing** | Correlation IDs in all logs | ✓ |

---

## 6. Disaster Recovery Plan

### 6.1 Backup Strategy

| Component | Backup Method | Frequency | RTR |
|---|---|---|---|
| PostgreSQL | pg_dump to S3 | Daily (1 AM UTC) | 1 hour |
| MongoDB | mongodump to S3 | Daily (2 AM UTC) | 2 hours |
| Redis | RDB snapshots | Every 5 min (to disk) | < 5 min |
| Application code | GitHub + Docker Registry | Continuous | < 15 min |

### 6.2 Recovery Procedures

**PostgreSQL Recovery (10-min RTO):**
```bash
aws s3 cp s3://eventify-backup/postgres-latest.dump - | pg_restore -U postgres
```

**MongoDB Recovery (30-min RTO):**
```bash
aws s3 sync s3://eventify-backup/mongo-latest mongorestore
mongorestore --uri="mongodb://localhost:27017" mongorestore/
```

**Full System Recovery (1-hour RTO):**
1. Restore PostgreSQL from latest backup
2. Restore MongoDB from latest backup
3. Restart all services (Docker Compose)
4. Validate health checks
5. Notify users; document incident

---

**Document Status:** APPROVED  
**Last Updated:** April 4, 2026  
**Next Review:** September 2026
