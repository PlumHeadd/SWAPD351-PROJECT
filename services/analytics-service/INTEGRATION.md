# Analytics Service Integration Guide

Quick reference for integrating the Analytics Service with other microservices.

## Service Details

| Property | Value |
|----------|-------|
| **Service Name** | Analytics Service |
| **Language** | Go 1.23+ |
| **Port** | 5003 |
| **Health Check** | GET /health |
| **Base URL** | http://analytics-service:5003 |
| **Docker Image** | eventify/analytics-service:latest |

## Integration Endpoints

### Track Event
```
POST /api/analytics/track
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "event_created|rsvp_created|user_signup|event_viewed|message_sent",
  "user_id": "uuid",
  "event_id": "uuid",
  "action": "create|rsvp|signup|view|message",
  "metadata": {
    "key": "value"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "type": "event_created",
  "user_id": "uuid",
  "timestamp": "2026-05-14T10:30:00Z"
}
```

---

## Integration Examples

### Python (Event Service)

```python
import requests
import json

# Track an event
def track_event(event_type, user_id, event_id, action, metadata=None):
    url = 'http://analytics-service:5003/api/analytics/track'
    
    payload = {
        'type': event_type,
        'user_id': user_id,
        'event_id': event_id,
        'action': action,
        'metadata': metadata or {}
    }
    
    response = requests.post(url, json=payload)
    return response.json()

# Usage in Event Service
def create_event(event_data):
    # ... create event in database ...
    
    # Track analytics
    track_event(
        event_type='event_created',
        user_id=event_data['user_id'],
        event_id=event_id,
        action='create',
        metadata={'category': event_data.get('category')}
    )
```

### Node.js (User Service / Chat Service)

```javascript
// Using fetch API
async function trackEvent(eventData) {
  const response = await fetch('http://analytics-service:5003/api/analytics/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
  });
  
  return response.json();
}

// Using axios
const axios = require('axios');

async function trackEvent(eventData) {
  const response = await axios.post(
    'http://analytics-service:5003/api/analytics/track',
    eventData
  );
  
  return response.data;
}

// Usage in User Service
app.post('/auth/signup', async (req, res) => {
  // ... create user ...
  
  // Track analytics
  await trackEvent({
    type: 'user_signup',
    user_id: userId,
    action: 'signup',
    metadata: { source: 'web' }
  });
  
  res.status(201).json({ userId });
});

// Usage in Chat Service
socket.on('message', async (data) => {
  // ... save message ...
  
  // Track analytics
  await trackEvent({
    type: 'message_sent',
    user_id: userId,
    event_id: eventId,
    action: 'message',
    metadata: { message_length: data.text.length }
  });
});
```

---

## RabbitMQ Integration

If processing events asynchronously, consume from these queues:

```
analytics.events   - Event creation events
analytics.rsvps    - RSVP events
analytics.chat     - Chat message events
```

### Python Consumer Example

```python
import pika
import json

def callback(ch, method, properties, body):
    event = json.loads(body)
    print(f"Received event: {event['type']}")
    # Process event here
    ch.basic_ack(delivery_tag=method.delivery_tag)

connection = pika.BlockingConnection(
    pika.ConnectionParameters('rabbitmq')
)
channel = connection.channel()

channel.queue_declare(queue='analytics.events', durable=True)
channel.basic_consume(
    queue='analytics.events',
    on_message_callback=callback
)

print('Waiting for events...')
channel.start_consuming()
```

---

## Docker Compose Integration

The service is already integrated in docker-compose.yml:

```yaml
analytics-service:
  build: ./services/analytics-service
  ports:
    - "5003:5003"
  environment:
    - PORT=5003
    - REDIS_URL=redis://redis:6379
    - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
  depends_on:
    - redis
    - rabbitmq
  networks:
    - eventify-net
```

**Start with:**
```bash
docker-compose up --build
```

---

## Service Discovery

### Local Development
```
http://localhost:5003
```

### Docker Compose
```
http://analytics-service:5003
```

### Kubernetes
```
http://analytics-service.eventify.svc.cluster.local:5003
```

---

## Error Handling

The service returns standard HTTP status codes:

```
200 OK          - Successful GET request
201 Created     - Event successfully tracked
400 Bad Request - Invalid JSON or missing fields
500 Internal    - Server error
```

**Handle errors in your integration:**

```javascript
async function trackEvent(data) {
  try {
    const response = await fetch(
      'http://analytics-service:5003/api/analytics/track',
      { method: 'POST', body: JSON.stringify(data) }
    );
    
    if (!response.ok) {
      console.error('Analytics tracking failed:', response.status);
      // Fail gracefully - don't block main operation
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('Analytics service unreachable:', error);
    // Fail gracefully - retry or queue for later
    return null;
  }
}
```

---

## Testing Integration

### Manual Testing

```bash
# Test from any service container
curl -X POST http://analytics-service:5003/api/analytics/track \
  -H "Content-Type: application/json" \
  -d '{
    "type": "event_created",
    "user_id": "test-user-123",
    "event_id": "test-event-456",
    "action": "create",
    "metadata": {"source": "test"}
  }'

# Expected response:
# {"id":"...","type":"event_created","user_id":"test-user-123","timestamp":"..."}
```

### Unit Test Example (Go)

```go
func TestEventTracking(t *testing.T) {
  event := Event{
    Type: "user_signup",
    UserID: "user-123",
    Action: "signup",
  }
  
  // Call tracking endpoint
  response, err := trackEvent(event)
  
  if err != nil {
    t.Fatalf("Failed to track event: %v", err)
  }
  
  if response.ID == "" {
    t.Error("Response ID should not be empty")
  }
}
```

### Integration Test Example (Python)

```python
import requests

def test_analytics_integration():
    response = requests.post(
        'http://analytics-service:5003/api/analytics/track',
        json={
            'type': 'event_created',
            'user_id': 'test-user',
            'event_id': 'test-event',
            'action': 'create'
        }
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data['id'] is not None
    assert data['type'] == 'event_created'
```

---

## Common Event Types

### From Event Service
```json
{
  "type": "event_created",
  "user_id": "user-id",
  "event_id": "event-id",
  "action": "create",
  "metadata": {"category": "tech", "capacity": 100}
}
```

### From User Service
```json
{
  "type": "user_signup",
  "user_id": "user-id",
  "action": "signup",
  "metadata": {"source": "web", "provider": "google"}
}
```

### From Chat Service
```json
{
  "type": "message_sent",
  "user_id": "user-id",
  "event_id": "event-id",
  "action": "message",
  "metadata": {"message_length": 150}
}
```

### From API Gateway
```json
{
  "type": "event_viewed",
  "user_id": "user-id",
  "event_id": "event-id",
  "action": "view",
  "metadata": {"duration_ms": 5000}
}
```

---

## Monitoring Integration

### Prometheus Metrics

Access Prometheus metrics for monitoring:

```bash
curl http://analytics-service:5003/metrics
```

**Key metrics to monitor:**
- `analytics_events_tracked_total` — Total events by type
- `analytics_request_duration_seconds` — Request latency

### Grafana Dashboard

1. Add Prometheus data source: `http://prometheus:9090`
2. Create dashboard with queries:
   ```
   rate(analytics_events_tracked_total[5m])
   histogram_quantile(0.95, analytics_request_duration_seconds)
   ```

---

## Rate Limiting

Currently no rate limiting. For production, consider:

```javascript
const rateLimit = require('express-rate-limit');

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000 // limit each IP to 1000 requests per minute
});

app.post('/api/analytics/track', analyticsLimiter, trackEventHandler);
```

---

## Security Considerations

1. **No authentication currently** — Add JWT validation if needed
2. **CORS enabled** — Allows cross-origin requests
3. **Input validation** — Service validates JSON structure
4. **Connection timeouts** — Services have 30-second timeout

**Production hardening:**
- Add API key authentication
- Implement rate limiting
- Use HTTPS
- Network policies in Kubernetes

---

## Troubleshooting

### Service Won't Respond
```bash
# Check if service is running
curl http://analytics-service:5003/health

# Check Docker logs
docker-compose logs analytics-service

# Check Redis connection
docker-compose logs redis
```

### Events Not Tracked
```bash
# Check RabbitMQ is running
docker-compose logs rabbitmq

# Verify event format
curl -X POST http://analytics-service:5003/api/analytics/track \
  -H "Content-Type: application/json" \
  -d '{"type":"test","user_id":"u1","event_id":"e1","action":"test"}'
```

### High Latency
- Check Redis performance: `redis-cli --latency`
- Check network connectivity between services
- Check RabbitMQ queue depth
- Monitor CPU/memory usage

---

## Performance Tips

1. **Batch events** — Group multiple events in one request
2. **Async tracking** — Don't wait for response
3. **Local caching** — Cache event data locally before sending
4. **Connection pooling** — Reuse HTTP connections
5. **Error handling** — Don't block main operation on tracking failure

---

## Additional Resources

- [Analytics Service README](./services/analytics-service/README.md)
- [Service API Specs](./docs/05-API_SPECIFICATIONS.md)
- [Architecture Decisions](./docs/03-ARCHITECTURE_DECISION_RECORDS.md)
- [DEPLOYMENT.md](./services/analytics-service/DEPLOYMENT.md)

---

## Quick Reference

```bash
# Health check
curl http://analytics-service:5003/health

# Track event
curl -X POST http://analytics-service:5003/api/analytics/track \
  -H "Content-Type: application/json" \
  -d '{"type":"event_created","user_id":"u1","event_id":"e1","action":"create"}'

# Get summary
curl http://analytics-service:5003/api/analytics/summary

# Get metrics
curl http://analytics-service:5003/metrics
```

---

**Last Updated**: May 14, 2026  
**Service Version**: 1.0.0  
**Go Version**: 1.23+

For more details, see the [Analytics Service README](./services/analytics-service/README.md).
