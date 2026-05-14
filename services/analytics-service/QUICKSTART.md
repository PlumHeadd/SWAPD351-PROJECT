# Analytics Service - Quick Start Guide

## 📦 What Was Implemented

A **production-ready Go microservice** for real-time analytics tracking in the Eventify platform.

### Service Summary
- **Language**: Go 1.23+
- **Port**: 5003
- **Purpose**: Event tracking, user activity monitoring, real-time insights
- **Key Features**: Redis caching, RabbitMQ integration, Prometheus metrics

## 📂 Files Created

### Core Application Files

```
services/analytics-service/
├── main.go                 (500 lines) - Service logic, API endpoints
├── config.go              (40 lines)  - Configuration management
├── main_test.go           (200 lines) - Unit tests
├── go.mod                 - Go module definition
├── go.sum                 - Dependency checksums
├── Dockerfile             - Multi-stage container build
├── Makefile               - Development commands
├── .gitignore             - Git ignore rules
└── .env.example           - Environment variables template
```

### Documentation Files

```
├── README.md              - Comprehensive service documentation
├── DEPLOYMENT.md          - Deployment guide (local, Docker, K8s, Azure)
├── IMPLEMENTATION.md      - Technical implementation details
└── QUICKSTART.md          - This file
```

### Updated Files

```
docker-compose.yml        - Added analytics-service definition
README.md (root)          - Updated architecture and services list
```

## 🚀 Quick Start

### Option 1: Docker Compose (Easiest)

```bash
# Start the entire stack including Analytics Service
cd c:\Users\20112\Downloads\SWAPD351-PROJECT
docker-compose up --build

# In another terminal, verify it's running
curl http://localhost:5003/health
```

### Option 2: Local Go Development

```bash
cd services/analytics-service

# Download dependencies
go mod download

# Run the service
go run main.go

# In another terminal, test it
curl http://localhost:5003/health
```

### Option 3: Make Commands

```bash
cd services/analytics-service

# Build the service
make build

# Run the service
make run

# Run tests
make test

# View all commands
make help
```

## 🔌 API Endpoints

### Health Check
```bash
curl http://localhost:5003/health
```

### Track an Event
```bash
curl -X POST http://localhost:5003/api/analytics/track \
  -H "Content-Type: application/json" \
  -d '{
    "type": "event_created",
    "user_id": "user-123",
    "event_id": "event-456",
    "action": "create",
    "metadata": {"category": "tech"}
  }'
```

### Get Platform Analytics
```bash
curl http://localhost:5003/api/analytics/summary
```

### Get Dashboard Data
```bash
curl http://localhost:5003/api/analytics/dashboard
```

### Get Event Metrics
```bash
curl http://localhost:5003/metrics
```

## 🏗️ Architecture

### How It Works

```
┌─────────────────────────────┐
│  Other Microservices        │
│  (Event, User, Chat, etc.)  │
└────────────┬────────────────┘
             │
             │ POST /api/analytics/track
             ▼
    ┌────────────────────────┐
    │ Analytics Service (Go) │
    │  ├─ Validate event    │
    │  ├─ Store in Redis    │
    │  ├─ Publish to RabbitMQ
    │  └─ Return 201        │
    └──────┬──────┬──────────┘
           │      │
    ┌──────▼──┐  │
    │  Redis  │  │
    │ Sorting │  │
    │  Sets   │  │
    └─────────┘  │
                 │
         ┌───────▼──────┐
         │  RabbitMQ    │
         │  Async Jobs  │
         └──────────────┘
```

## 🔧 Configuration

### Environment Variables (`.env.example`)

```env
PORT=5003
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
JWT_SECRET=eventify_jwt_secret_key_2026
LOG_LEVEL=info
```

## 🧪 Testing

### Run Unit Tests
```bash
cd services/analytics-service
go test -v ./...
```

### Manual Testing
```bash
# Health check
curl http://localhost:5003/health

# Track an event
curl -X POST http://localhost:5003/api/analytics/track \
  -H "Content-Type: application/json" \
  -d '{"type":"event_created","user_id":"u1","event_id":"e1","action":"create"}'

# Get summary
curl http://localhost:5003/api/analytics/summary

# View Prometheus metrics
curl http://localhost:5003/metrics
```

## 📊 Monitoring

### Prometheus Metrics Exposed

- `analytics_events_tracked_total{event_type="..."}` — Total events tracked
- `analytics_request_duration_seconds{endpoint="..."}` — Request latency

### Grafana Dashboard

Access Grafana at http://localhost:3030 and add a Prometheus data source pointing to `http://prometheus:9090`

## 📚 Dependencies

### Direct Go Dependencies
- `github.com/go-redis/redis/v8` — Redis client
- `github.com/gorilla/mux` — HTTP router
- `github.com/streadway/amqp` — RabbitMQ client
- `github.com/prometheus/client_golang` — Metrics

### External Services
- Redis (for caching and sorted sets)
- RabbitMQ (for async messaging)
- Prometheus (for metrics collection)

## 🎯 Supported Event Types

The service tracks these event types:

- `event_created` — New event created
- `rsvp_created` — User RSVP'd to event
- `user_signup` — New user registered
- `event_viewed` — User viewed event details
- `message_sent` — Chat message sent

## 🐳 Docker & Deployment

### Build Docker Image
```bash
cd services/analytics-service
docker build -t analytics-service:latest .
```

### Run as Docker Container
```bash
docker run -p 5003:5003 \
  -e REDIS_URL=redis://redis:6379 \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  analytics-service:latest
```

### Kubernetes (Production)

See [DEPLOYMENT.md](./services/analytics-service/DEPLOYMENT.md) for:
- Kubernetes manifests
- Helm charts
- Azure Container Instances
- Scaling strategies
- Zero-downtime deployments

## 🔍 Troubleshooting

### Service Won't Start
```bash
# Check if Redis is running
docker-compose logs redis

# Check if RabbitMQ is running
docker-compose logs rabbitmq

# View service logs
docker-compose logs analytics-service
```

### Connection Errors
```bash
# Test Redis connection
docker-compose exec redis redis-cli ping

# Test RabbitMQ
docker-compose exec rabbitmq rabbitmq-diagnostics ping
```

## 📖 Documentation

- **[README.md](./services/analytics-service/README.md)** — Complete service documentation
- **[DEPLOYMENT.md](./services/analytics-service/DEPLOYMENT.md)** — Deployment guide (all platforms)
- **[IMPLEMENTATION.md](./services/analytics-service/IMPLEMENTATION.md)** — Technical details
- **[main_test.go](./services/analytics-service/main_test.go)** — Code examples via tests

## 🔗 Integration with Other Services

### Event Service
```python
# Python/Flask - Send analytics event
import requests
requests.post('http://analytics-service:5003/api/analytics/track', json={
    'type': 'event_created',
    'user_id': user_id,
    'event_id': event_id,
    'action': 'create'
})
```

### User Service
```javascript
// Node.js/Express - Send analytics event
await fetch('http://analytics-service:5003/api/analytics/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'user_signup',
    user_id: userId,
    action: 'signup'
  })
});
```

## 🎓 Learning Resources

### Go Learning
- [Tour of Go](https://tour.golang.org)
- [Effective Go](https://golang.org/doc/effective_go)
- [Go Design Patterns](https://refactoring.guru/design-patterns/go)

### Microservices
- [12 Factor App](https://12factor.net)
- [Building Microservices](https://samnewman.io/books/building_microservices/)

## 📋 Checklist

- [x] Go microservice implemented (main.go)
- [x] Configuration management (config.go)
- [x] Unit tests (main_test.go)
- [x] Docker containerization (Dockerfile)
- [x] Docker Compose integration (docker-compose.yml)
- [x] API endpoints with health checks
- [x] Redis integration for data caching
- [x] RabbitMQ integration for async events
- [x] Prometheus metrics exposure
- [x] Comprehensive documentation
- [x] Deployment guide (all platforms)
- [x] Make targets for development

## 📞 Next Steps

1. **Start the service**: `docker-compose up --build`
2. **Test the API**: `curl http://localhost:5003/health`
3. **Read the documentation**: [README.md](./services/analytics-service/README.md)
4. **Integrate with other services**: Track events from Event, User, Chat services
5. **Deploy to production**: See [DEPLOYMENT.md](./services/analytics-service/DEPLOYMENT.md)

## ✅ Production Ready Features

✅ Graceful shutdown  
✅ Health checks (liveness & readiness)  
✅ Prometheus metrics  
✅ CORS support  
✅ Error handling  
✅ Connection pooling  
✅ Configuration management  
✅ Docker multi-stage build  
✅ Comprehensive logging  
✅ Unit tests  
✅ Type-safe code  
✅ Scalable architecture  

## 🤝 Contributing

When adding new features:

1. Write tests first
2. Follow Go conventions
3. Use `gofmt` for formatting
4. Update documentation
5. Test with `make test`
6. Run `make all` before committing

## 📄 License

Part of Eventify Platform — SWAPD 351 (Spring 2026)

---

**Ready to go!** Start with Option 1 above. Happy coding! 🚀
