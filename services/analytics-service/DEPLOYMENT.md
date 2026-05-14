# Analytics Service Deployment Guide

## Overview

This guide covers deploying the Go Analytics Service in various environments.

## Prerequisites

### For Local Development
- Go 1.23+
- Docker & Docker Compose
- Redis
- RabbitMQ

### For Production
- Kubernetes 1.24+
- Docker Registry access
- Redis cluster (or Azure Cache for Redis)
- RabbitMQ cluster or managed service (e.g., Azure Service Bus)

## Local Development Deployment

### Method 1: Go Direct

```bash
cd services/analytics-service
go mod download
go run main.go
```

### Method 2: Docker Compose (Recommended)

```bash
# Start entire stack including Analytics Service
docker-compose up --build analytics-service

# Verify service is running
curl http://localhost:5003/health
```

### Method 3: Docker Manual

```bash
# Build image
docker build -t eventify/analytics-service:latest .

# Run container
docker run -p 5003:5003 \
  -e REDIS_URL=redis://redis:6379 \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  eventify/analytics-service:latest
```

## Production Deployment

### Docker Registry Push

```bash
# Build and tag
docker build -t eventify/analytics-service:1.0.0 .
docker tag eventify/analytics-service:1.0.0 eventify/analytics-service:latest

# Push to registry (example: Docker Hub)
docker push eventify/analytics-service:1.0.0
docker push eventify/analytics-service:latest
```

### Kubernetes Deployment

#### 1. Create ConfigMap and Secrets

```bash
# Create namespace
kubectl create namespace eventify

# Create ConfigMap for config
kubectl create configmap analytics-config \
  --from-literal=log_level=info \
  -n eventify

# Create Secret for sensitive data
kubectl create secret generic analytics-secrets \
  --from-literal=jwt_secret=your_secret_key \
  --from-literal=rabbitmq_url=amqp://user:pass@rabbitmq-service:5672 \
  -n eventify
```

#### 2. Deploy Service

```yaml
# analytics-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-service
  namespace: eventify
  labels:
    app: analytics-service
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: analytics-service
  template:
    metadata:
      labels:
        app: analytics-service
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "5003"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: analytics-service
      containers:
      - name: analytics-service
        image: eventify/analytics-service:1.0.0
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 5003
          protocol: TCP
        env:
        - name: PORT
          value: "5003"
        - name: REDIS_URL
          value: "redis://redis-cluster:6379"
        - name: RABBITMQ_URL
          valueFrom:
            secretKeyRef:
              name: analytics-secrets
              key: rabbitmq_url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: analytics-secrets
              key: jwt_secret
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: analytics-config
              key: log_level
        
        # Health checks
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        
        # Resource limits
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        
        # Security context
        securityContext:
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1000
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL

      # Pod-level security context
      securityContext:
        fsGroup: 1000

      # Affinity rules
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - analytics-service
              topologyKey: kubernetes.io/hostname

---
# Kubernetes Service
apiVersion: v1
kind: Service
metadata:
  name: analytics-service
  namespace: eventify
  labels:
    app: analytics-service
spec:
  type: ClusterIP
  ports:
  - port: 5003
    targetPort: http
    protocol: TCP
    name: http
  selector:
    app: analytics-service

---
# HorizontalPodAutoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: analytics-service-hpa
  namespace: eventify
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: analytics-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80

---
# ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: analytics-service
  namespace: eventify
```

Apply deployment:
```bash
kubectl apply -f analytics-deployment.yaml
```

### Azure Container Instances (ACI)

```bash
# Build and push to ACR
az acr build --registry eventifyacr \
  --image analytics-service:1.0.0 .

# Deploy to ACI
az container create \
  --resource-group eventify-rg \
  --name analytics-service \
  --image eventifyacr.azurecr.io/analytics-service:1.0.0 \
  --port 5003 \
  --environment-variables \
    PORT=5003 \
    REDIS_URL=redis://redis-service:6379 \
    RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  --registry-login-server eventifyacr.azurecr.io \
  --registry-username <username> \
  --registry-password <password>
```

## Monitoring & Logging

### Prometheus Scraping

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'analytics-service'
    static_configs:
      - targets: ['localhost:5003']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Log Aggregation

Forward logs to OpenSearch or ELK stack:

```bash
# Docker logging driver
docker run \
  --log-driver splunk \
  --log-opt splunk-token=<token> \
  --log-opt splunk-url=<url> \
  eventify/analytics-service:latest
```

## Scaling Strategies

### Horizontal Scaling
- Deploy multiple replicas with load balancer
- Use Kubernetes HPA based on CPU/Memory
- Shard data in Redis (if needed)

### Vertical Scaling
- Increase container resource limits
- Use larger machine types in Kubernetes

### Data Partitioning
- Partition analytics events by time range
- Use separate Redis instances per shard
- Implement consistent hashing for distribution

## Zero-Downtime Deployment

### Rolling Update (Kubernetes)

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

### Blue-Green Deployment

1. Deploy new version to green environment
2. Run smoke tests
3. Switch traffic to green
4. Keep blue as rollback

### Canary Deployment

1. Deploy new version to 10% of replicas
2. Monitor metrics
3. Gradually increase traffic
4. Complete rollout or rollback

## Rollback Procedures

### Kubernetes Rollback

```bash
# View rollout history
kubectl rollout history deployment/analytics-service -n eventify

# Rollback to previous version
kubectl rollout undo deployment/analytics-service -n eventify

# Rollback to specific revision
kubectl rollout undo deployment/analytics-service --to-revision=2 -n eventify
```

## Performance Tuning

### Connection Pooling
- Redis: Configure max connections
- RabbitMQ: Tune channel pool size

### Caching Strategy
- Use TTL on Redis keys (default: 24 hours)
- Implement cache warming on startup

### Database Indexing
- Index frequently queried fields
- Use sorted sets for time-series data

## Security Hardening

1. **Image Scanning**
   ```bash
   trivy image eventify/analytics-service:latest
   ```

2. **Network Policies**
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: analytics-service-netpol
   spec:
     podSelector:
       matchLabels:
         app: analytics-service
     policyTypes:
     - Ingress
     - Egress
     ingress:
     - from:
       - podSelector:
           matchLabels:
             app: api-gateway
     egress:
     - to:
       - podSelector:
           matchLabels:
             app: redis
   ```

3. **TLS/HTTPS**
   - Use service mesh (Istio) for mTLS
   - Terminate TLS at ingress

## Troubleshooting

### Service Won't Start
```bash
# Check logs
kubectl logs deployment/analytics-service -n eventify

# Check events
kubectl describe deployment analytics-service -n eventify
```

### High Memory Usage
```bash
# Check memory metrics
kubectl top pods -n eventify
```

### Connection Errors
```bash
# Verify connectivity to Redis/RabbitMQ
kubectl exec -it <pod-name> -n eventify -- \
  curl redis-service:6379
```

## Disaster Recovery

### Backup Strategy
- Regular Redis snapshots
- RabbitMQ queue persistence
- Configuration version control

### Recovery Procedures
1. Restore Redis data
2. Re-establish RabbitMQ connections
3. Restart service pods
4. Verify data integrity

## Cost Optimization

- Use spot instances for non-critical deployments
- Implement request caching
- Regular resource right-sizing
- Monitor and optimize database queries

---

For more information, see [README.md](./README.md) and project documentation.
