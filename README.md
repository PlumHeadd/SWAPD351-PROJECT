# Eventify Platform

A scalable event management web application built with microservices architecture.

**Course**: SWAPD 351 — Software Architecture and Design (Spring 2026)

**Team**: Habiba Magdy, Basmala Salah, Arwa Mohamed, Lana Mohamed

## Architecture

- **API Gateway** (Node.js/Express) — routing, JWT validation, rate limiting
- **User Service** (Node.js/Express) — Google OAuth2, profile management
- **Event Service** (Python/Flask) — CRUD events, RSVPs, Redis caching
- **Chat Service** (Node.js/Socket.io) — real-time messaging per event
- **Notification Service** (Python/Flask) — RabbitMQ consumer, email/push

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Databases | PostgreSQL (users), MongoDB (events/chat) |
| Cache | Redis |
| Message Broker | RabbitMQ |
| Logging | OpenSearch |
| Monitoring | Prometheus + Grafana |
| Containers | Docker + Docker Compose |
| Frontend | React |

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your Google OAuth2 credentials

# 2. Start all services
docker-compose up --build

# 3. Access
# Frontend:     http://localhost:3080
# API Gateway:  http://localhost:3000
# RabbitMQ UI:  http://localhost:15672
# Grafana:      http://localhost:3030
# OpenSearch:   http://localhost:9200
```

## Running Tests

```bash
# Unit tests (Python)
cd services/event-service && pip install -r requirements.txt && pytest ../tests/unit/

# Unit tests (Node.js)
cd services/api-gateway && npm test

# Integration tests (requires services running)
cd tests/integration && pytest test_e2e.py

# Load tests (requires k6)
k6 run tests/load/load_test.js
```

## Project Structure

```
eventify-platform/
├── docker-compose.yml
├── docs/
│   ├── phase1/          # LaTeX design document
│   ├── adrs/            # Architecture Decision Records
│   ├── api-specs/       # OpenAPI/Swagger YAML
│   └── diagrams/        # C4 diagram sources
├── services/
│   ├── api-gateway/     # Node.js
│   ├── user-service/    # Node.js
│   ├── event-service/   # Python/Flask
│   ├── chat-service/    # Node.js/Socket.io
│   └── notification-service/ # Python/Flask
├── frontend/            # React
├── monitoring/          # Prometheus + Grafana configs
└── tests/
    ├── unit/
    ├── integration/
    └── load/
```
