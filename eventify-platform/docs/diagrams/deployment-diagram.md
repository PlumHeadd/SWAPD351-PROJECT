# Deployment Diagram - Eventify Platform

## Docker Compose Deployment

This diagram shows how the Eventify Platform is deployed using Docker Compose.

```mermaid
graph TB
    subgraph "Host Machine / Cloud VM"
        subgraph "Docker Compose Network: eventify-net"
            subgraph "Web Tier"
                FRONTEND[Frontend Container<br/>React:18<br/>Port: 3080<br/>Nginx]
                GATEWAY[API Gateway<br/>Node.js:20<br/>Port: 3000<br/>Express]
            end

            subgraph "Application Tier - Node.js Services"
                USER[User Service<br/>Node.js:20<br/>Port: 3001<br/>Passport/JWT]
                CHAT[Chat Service<br/>Node.js:20<br/>Port: 3002<br/>Socket.io]
            end

            subgraph "Application Tier - Python Services"
                EVENT[Event Service<br/>Python:3.11<br/>Port: 5001<br/>Flask]
                NOTIF[Notification Service<br/>Python:3.11<br/>Port: 5002<br/>Flask]
            end

            subgraph "Data Tier"
                POSTGRES[(PostgreSQL<br/>16-alpine<br/>Port: 5432<br/>Volume: postgres_data)]
                MONGO[(MongoDB<br/>7.0<br/>Port: 27017<br/>Volume: mongo_data)]
                REDIS[(Redis<br/>7-alpine<br/>Port: 6379<br/>Volume: redis_data)]
            end

            subgraph "Message Queue"
                RABBIT[RabbitMQ<br/>3-management<br/>Ports: 5672, 15672<br/>Volume: rabbitmq_data]
            end

            subgraph "Observability Stack"
                PROMETHEUS[Prometheus<br/>Latest<br/>Port: 9090<br/>Config: prometheus.yml]
                GRAFANA[Grafana<br/>Latest<br/>Port: 3030<br/>Volume: grafana_data]
                OPENSEARCH[OpenSearch<br/>2.11.0<br/>Port: 9200<br/>Volume: opensearch_data]
                OSDASH[OpenSearch Dashboards<br/>2.11.0<br/>Port: 5601]
            end
        end

        subgraph "Persistent Volumes"
            VOL1[postgres_data]
            VOL2[mongo_data]
            VOL3[redis_data]
            VOL4[rabbitmq_data]
            VOL5[grafana_data]
            VOL6[opensearch_data]
        end
    end

    subgraph "External Services"
        GOOGLE[Google OAuth2<br/>accounts.google.com]
        SMTP[SMTP Server<br/>smtp.gmail.com:587]
    end

    subgraph "Clients"
        BROWSER[Web Browser<br/>User Device]
    end

    BROWSER -->|HTTPS :3080| FRONTEND
    BROWSER -->|HTTPS :3000| GATEWAY
    BROWSER -->|WebSocket :3002| CHAT

    FRONTEND -.->|API Calls| GATEWAY

    GATEWAY -->|HTTP| USER
    GATEWAY -->|HTTP| EVENT
    GATEWAY -->|HTTP| CHAT
    GATEWAY -->|HTTP| NOTIF

    USER -->|SQL| POSTGRES
    USER -->|Session| REDIS
    USER -->|OAuth2| GOOGLE

    EVENT -->|NoSQL| MONGO
    EVENT -->|Cache| REDIS
    EVENT -->|Publish| RABBIT

    CHAT -->|NoSQL| MONGO
    CHAT -->|Publish| RABBIT

    NOTIF -->|Subscribe| RABBIT
    NOTIF -->|HTTP| USER
    NOTIF -->|SMTP| SMTP

    GATEWAY -->|Rate Limit| REDIS

    GATEWAY -.->|/metrics| PROMETHEUS
    USER -.->|/metrics| PROMETHEUS
    EVENT -.->|/metrics| PROMETHEUS
    CHAT -.->|/metrics| PROMETHEUS
    NOTIF -.->|/metrics| PROMETHEUS

    PROMETHEUS -->|Query| GRAFANA

    GATEWAY -.->|Logs| OPENSEARCH
    USER -.->|Logs| OPENSEARCH
    EVENT -.->|Logs| OPENSEARCH
    CHAT -.->|Logs| OPENSEARCH
    NOTIF -.->|Logs| OPENSEARCH

    OPENSEARCH -->|Visualize| OSDASH

    POSTGRES -.->|Persist| VOL1
    MONGO -.->|Persist| VOL2
    REDIS -.->|Persist| VOL3
    RABBIT -.->|Persist| VOL4
    GRAFANA -.->|Persist| VOL5
    OPENSEARCH -.->|Persist| VOL6

    classDef webTier fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef appTier fill:#7ED321,stroke:#5FA319,color:#fff
    classDef dataTier fill:#F5A623,stroke:#C17D11,color:#fff
    classDef obsTier fill:#BD10E0,stroke:#8B0AA8,color:#fff
    classDef external fill:#D0021B,stroke:#9A0114,color:#fff

    class FRONTEND,GATEWAY webTier
    class USER,CHAT,EVENT,NOTIF appTier
    class POSTGRES,MONGO,REDIS,RABBIT dataTier
    class PROMETHEUS,GRAFANA,OPENSEARCH,OSDASH obsTier
    class GOOGLE,SMTP external
```

## Deployment Architecture

### Orchestration: Docker Compose

**File**: `docker-compose.yml`

**Total Containers**: 14
- 1 Frontend
- 5 Microservices
- 3 Databases/Cache
- 1 Message Broker
- 4 Observability components

**Network**: Bridge network `eventify-net` for inter-container communication

**Volumes**: 6 persistent volumes for data persistence

### Container Configuration

#### Frontend Container
```yaml
Image: Built from ./frontend/Dockerfile
Base: node:20-alpine (build) → nginx:alpine (serve)
Port Mapping: 3080:80
Environment: Built-time React environment variables
Dependencies: api-gateway
Health Check: None (nginx default)
```

#### API Gateway Container
```yaml
Image: Built from ./services/api-gateway/Dockerfile
Base: node:20-alpine
Port Mapping: 3000:3000
Environment:
  - PORT=3000
  - JWT_SECRET=eventify_jwt_secret_key_2026
  - REDIS_URL=redis://redis:6379
  - *_SERVICE_URL for routing
Dependencies: redis, user-service, event-service
Health Check: None (add in production)
```

#### User Service Container
```yaml
Image: Built from ./services/user-service/Dockerfile
Base: node:20-alpine
Port Mapping: 3001:3001
Environment:
  - PORT=3001
  - DATABASE_URL=postgresql://eventify:eventify123@postgres:5432/eventify_users
  - REDIS_URL=redis://redis:6379
  - JWT_SECRET=eventify_jwt_secret_key_2026
  - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-placeholder}
  - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-placeholder}
Dependencies: postgres, redis
Health Check: None (add in production)
```

#### Event Service Container
```yaml
Image: Built from ./services/event-service/Dockerfile
Base: python:3.11-slim
Port Mapping: 5001:5001
Environment:
  - PORT=5001
  - MONGO_URI=mongodb://mongodb:27017/eventify_events
  - REDIS_URL=redis://redis:6379
  - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
  - JWT_SECRET=eventify_jwt_secret_key_2026
Dependencies: mongodb, redis, rabbitmq
Health Check: None (add in production)
```

#### Chat Service Container
```yaml
Image: Built from ./services/chat-service/Dockerfile
Base: node:20-alpine
Port Mapping: 3002:3002
Environment:
  - PORT=3002
  - MONGO_URI=mongodb://mongodb:27017/eventify_chat
  - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
  - JWT_SECRET=eventify_jwt_secret_key_2026
Dependencies: mongodb, rabbitmq
Health Check: None (add in production)
```

#### Notification Service Container
```yaml
Image: Built from ./services/notification-service/Dockerfile
Base: python:3.11-slim
Port Mapping: 5002:5002
Environment:
  - PORT=5002
  - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
  - REDIS_URL=redis://redis:6379
  - USER_SERVICE_URL=http://user-service:3001
  - SMTP_* for email configuration
Dependencies: rabbitmq, redis, user-service
Health Check: None (add in production)
```

### Data Stores

#### PostgreSQL
```yaml
Image: postgres:16-alpine
Port: 5432
Volume: postgres_data:/var/lib/postgresql/data
Environment:
  - POSTGRES_USER=eventify
  - POSTGRES_PASSWORD=eventify123
  - POSTGRES_DB=eventify_users
Purpose: User profiles, OAuth tokens
```

#### MongoDB
```yaml
Image: mongo:7
Port: 27017
Volume: mongo_data:/data/db
Environment: Default (no auth for dev)
Purpose: Events, RSVPs, chat messages
```

#### Redis
```yaml
Image: redis:7-alpine
Port: 6379
Volume: redis_data:/data
Environment: Default
Purpose: Cache, sessions, rate limiting
```

### Message Broker

#### RabbitMQ
```yaml
Image: rabbitmq:3-management-alpine
Ports: 5672 (AMQP), 15672 (Management UI)
Volume: rabbitmq_data:/var/lib/rabbitmq
Environment:
  - RABBITMQ_DEFAULT_USER=guest
  - RABBITMQ_DEFAULT_PASS=guest
Purpose: Async event-driven communication
```

### Observability Stack

#### Prometheus
```yaml
Image: prom/prometheus:latest
Port: 9090
Volume: ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
Configuration:
  - Scrape interval: 15s
  - Scrape all 5 microservices /metrics
Purpose: Metrics collection and storage
```

#### Grafana
```yaml
Image: grafana/grafana:latest
Port: 3030 (mapped from internal 3000)
Volume: grafana_data:/var/lib/grafana
Environment:
  - GF_SECURITY_ADMIN_PASSWORD=admin
Volumes:
  - grafana-datasources.yml (Prometheus connection)
  - grafana-dashboards.yml (dashboard provisioning)
  - eventify-dashboard.json (Eventify dashboard)
Purpose: Metrics visualization and alerting
```

#### OpenSearch
```yaml
Image: opensearchproject/opensearch:2.11.0
Port: 9200
Volume: opensearch_data:/usr/share/opensearch/data
Environment:
  - discovery.type=single-node
  - plugins.security.disabled=true
  - OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
Purpose: Centralized log storage
```

#### OpenSearch Dashboards
```yaml
Image: opensearchproject/opensearch-dashboards:2.11.0
Port: 5601
Environment:
  - OPENSEARCH_HOSTS=["http://opensearch:9200"]
  - DISABLE_SECURITY_DASHBOARDS_PLUGIN=true
Dependencies: opensearch
Purpose: Log visualization and search UI
```

## Deployment Scenarios

### Development Deployment (Current)

**Command**: `docker-compose up --build`

**Characteristics**:
- All services on single host
- Shared network bridge
- Development credentials
- No TLS/HTTPS
- Direct port exposure
- No horizontal scaling

**Suitable for**:
- Local development
- Testing
- Demonstrations
- Small-scale deployments

### Production Deployment (Recommended)

#### Option 1: Docker Compose with Reverse Proxy

```
[Internet]
    ↓
[Load Balancer / Reverse Proxy]
  - Nginx/Traefik
  - TLS termination
  - Rate limiting
    ↓
[Docker Compose Stack]
  - Same as development
  - Environment-specific configs
  - Production credentials in secrets
  - Internal network only
```

**Additions needed**:
- Nginx/Traefik container for load balancing
- Let's Encrypt TLS certificates
- Docker secrets for credentials
- Health checks for all services
- Restart policies (unless-stopped)
- Resource limits (CPU, memory)
- Log rotation

#### Option 2: Kubernetes Deployment

**Architecture**:
```
[Ingress Controller]
  ↓
[Service Mesh (optional)]
  ↓
[Frontend Deployment]
  - 3 replicas
  - HPA based on CPU
  ↓
[API Gateway Deployment]
  - 3 replicas
  - HPA based on request rate
  ↓
[Microservices Deployments]
  - 2-3 replicas each
  - HPA based on metrics
  ↓
[StatefulSets for Databases]
  - PostgreSQL (3 replicas, read replicas)
  - MongoDB (3 replicas, sharded)
  - Redis (3 replicas, sentinel)
  - RabbitMQ (3 replicas, cluster)
```

**Kubernetes Resources Needed**:
- Deployments (6: frontend + 5 services)
- StatefulSets (4: databases + cache + broker)
- Services (10: one per component)
- Ingress (1: TLS termination, routing)
- ConfigMaps (environment variables)
- Secrets (credentials)
- PersistentVolumeClaims (database storage)
- HorizontalPodAutoscalers (auto-scaling)
- NetworkPolicies (security)

**Benefits**:
- Automatic scaling
- Self-healing
- Rolling updates
- Service discovery
- Load balancing
- Declarative configuration

#### Option 3: Cloud Provider Managed Services

**Azure Architecture**:
```
[Azure Front Door]
  ↓ HTTPS
[Azure Container Instances / AKS]
  - Frontend: 3 instances
  - API Gateway: 3 instances
  - Microservices: 2-3 instances each
  ↓
[Azure Database for PostgreSQL]
  - Managed, replicated
  ↓
[Azure Cosmos DB (MongoDB API)]
  - Global distribution
  ↓
[Azure Cache for Redis]
  - Managed, replicated
  ↓
[Azure Service Bus]
  - Managed message broker (alternative to RabbitMQ)
  ↓
[Azure Monitor]
  - Logs + Metrics + Alerts
```

**Benefits**:
- Fully managed databases
- Automatic backups
- Built-in monitoring
- Global distribution
- High availability
- Compliance certifications

**Trade-offs**:
- Higher cost
- Vendor lock-in
- Less control
- Requires cloud expertise

## Scaling Strategy

### Horizontal Scaling (Recommended)

**Stateless Services** (can scale freely):
- Frontend (add more containers)
- API Gateway (add behind load balancer)
- User Service
- Event Service
- Chat Service (with sticky sessions for WebSocket)
- Notification Service

**How to Scale with Docker Compose**:
```bash
docker-compose up --scale api-gateway=3 --scale event-service=3
```

**Requires**:
- Remove port mappings (use load balancer)
- Add nginx load balancer container
- Sticky sessions for Chat Service

**Stateful Services** (require special handling):
- PostgreSQL: Read replicas, Citus sharding
- MongoDB: Replica set, sharding
- Redis: Sentinel, cluster mode
- RabbitMQ: Clustering

### Vertical Scaling

**Resource Limits** (add to docker-compose.yml):
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '1.0'
      memory: 1G
```

**When to Scale Vertically**:
- Database performance bottlenecks
- Memory-intensive operations
- Complex aggregation queries

### Database Sharding Strategy

**PostgreSQL (Users)**:
- Shard by: `user_id` (hash-based)
- Tool: Citus extension
- Shards: 4-8 shards for 100k-1M users

**MongoDB (Events)**:
- Shard by: `_id` (hashed)
- Collection: events
- Shards: 3 shards for 100k-1M events

## Failover and High Availability

### Current Setup (Development)
- **Single Point of Failure**: Every service is single instance
- **Downtime**: Any container failure causes service unavailability
- **Recovery**: Docker restart policy (can add)

### Production HA Setup

**Service Level**:
- 3+ instances per service
- Health checks with automatic restart
- Load balancer distributes traffic
- Circuit breakers prevent cascading failures

**Database Level**:
- PostgreSQL: Primary + 2 read replicas
- MongoDB: 3-node replica set (1 primary, 2 secondaries)
- Redis: Sentinel with 3 nodes (1 master, 2 replicas)
- RabbitMQ: 3-node cluster with mirrored queues

**Infrastructure Level**:
- Multi-zone deployment (Azure Availability Zones)
- Cross-region replication (disaster recovery)
- Automated backups (hourly snapshots)
- Health monitoring with auto-failover

## Monitoring and Alerts

### Current Monitoring
- Prometheus scrapes /metrics every 15s
- Grafana visualizes metrics
- OpenSearch stores logs

### Production Monitoring (Recommended)

**Metrics**:
- Application metrics (response time, error rate, throughput)
- Host metrics (CPU, memory, disk, network)
- Database metrics (connections, queries, replication lag)
- Business metrics (events created, RSVPs, active users)

**Alerts** (needs implementation):
- High error rate (>5%)
- High latency (p95 > 1s)
- Service down (health check fails)
- Database connection pool exhausted
- Disk space <10%
- Certificate expiring <30 days

**Log Aggregation**:
- All services → Fluentd/Logstash → OpenSearch
- Structured JSON logs
- Correlation IDs for distributed tracing
- Retention: 30 days

## Security Considerations

### Network Security
- Internal network isolation (eventify-net)
- No direct database exposure to internet
- API Gateway as single entry point

### Application Security
- OAuth2 authentication
- JWT token validation
- Rate limiting
- Input validation
- CORS configuration
- Security headers (Helmet.js)

### Secrets Management
- .env files (development)
- Docker secrets (Docker Swarm)
- Kubernetes secrets (K8s)
- Azure Key Vault (Azure)

### Recommendations for Production
- Use Docker secrets instead of environment variables
- Enable PostgreSQL SSL
- Enable MongoDB authentication
- Enable Redis password
- Enable RabbitMQ authentication
- TLS for all external communication
- Network policies to restrict inter-service communication
- Regular security scanning (Trivy, Snyk)

## Deployment Commands

### Development
```bash
# Start all services
docker-compose up --build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f [service-name]

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Production
```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml up -d

# Rolling update
docker-compose up -d --no-deps --build [service-name]

# Scale services
docker-compose up -d --scale api-gateway=3
```

### Health Checks
```bash
# Check all containers
docker-compose ps

# Check specific service
curl http://localhost:3000/health

# Check metrics
curl http://localhost:3000/metrics
```

## Cost Estimation (Azure Example)

### Development (Single VM)
- **VM**: Standard B2s (2 vCPU, 4GB RAM) - ~$30/month
- **Storage**: 100GB SSD - ~$5/month
- **Network**: Minimal traffic - ~$5/month
- **Total**: ~$40/month

### Production (Kubernetes)
- **AKS Cluster**: 3 nodes (Standard D4s) - ~$350/month
- **Azure Database for PostgreSQL**: General Purpose 2 vCores - ~$100/month
- **Azure Cosmos DB**: 400 RU/s - ~$25/month
- **Azure Cache for Redis**: Basic 1GB - ~$20/month
- **Load Balancer**: ~$20/month
- **Storage**: 500GB - ~$25/month
- **Monitor**: ~$50/month
- **Total**: ~$590/month

### Production (Managed Services)
- **Container Instances**: 5 services * 2 instances - ~$200/month
- **Managed Databases**: PostgreSQL + Cosmos + Redis - ~$250/month
- **Service Bus**: Standard - ~$10/month
- **Load Balancer**: ~$20/month
- **Storage**: ~$25/month
- **Azure Monitor**: ~$100/month
- **Total**: ~$605/month
