# Cloud Deployment Guide

This guide covers deploying the Eventify platform to major cloud providers: AWS, Azure, and GCP.

## Overview

The Eventify platform is cloud-agnostic and can be deployed to any cloud provider. Each provider offers managed services that align with our architecture:

| Component | AWS | Azure | GCP |
|-----------|-----|-------|-----|
| Container Registry | ECR | ACR | GCR |
| Kubernetes | EKS | AKS | GKE |
| Postgres Database | RDS | PostgreSQL Flexible Server | Cloud SQL |
| NoSQL Database | DynamoDB | Cosmos DB | Firestore |
| Cache | ElastiCache | Redis Cache | Memorystore |
| Message Queue | SQS/SNS | Service Bus | Cloud Pub/Sub |
| Logging | CloudWatch | Monitor/Log Analytics | Cloud Logging |
| Monitoring | CloudWatch | Monitor | Cloud Monitoring |

## Prerequisites

- Docker (build images)
- Cloud CLI tools (aws-cli, az, gcloud)
- kubectl (Kubernetes management)
- Helm (optional, for package management)
- terraform or cloud-specific IaC tools

## Deployment Steps

### 1. Build and Push Images

```bash
# Build all service images
docker-compose build

# Tag images with cloud registry
# AWS ECR example:
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker tag eventify-api-gateway:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/eventify-api-gateway:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/eventify-api-gateway:latest

# Repeat for all 6 services
```

### 2. Set Up Managed Databases

#### PostgreSQL
```bash
# AWS
aws rds create-db-instance \
  --db-instance-identifier eventify-postgres \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username eventify \
  --master-user-password your-secure-password \
  --allocated-storage 20

# Azure
az postgres flexible-server create \
  --resource-group eventify-rg \
  --name eventify-postgres \
  --admin-user eventify \
  --admin-password your-secure-password \
  --sku-name Standard_B1ms \
  --tier Burstable

# GCP
gcloud sql instances create eventify-postgres \
  --database-version POSTGRES_14 \
  --tier db-f1-micro \
  --region us-central1
```

#### MongoDB / NoSQL
```bash
# AWS DynamoDB
aws dynamodb create-table \
  --table-name eventify-events \
  --attribute-definitions AttributeName=event_id,AttributeType=S \
  --key-schema AttributeName=event_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Azure Cosmos DB
az cosmosdb create \
  --resource-group eventify-rg \
  --name eventify-cosmosdb \
  --kind MongoDB \
  --default-consistency-level Session

# GCP Firestore
gcloud firestore databases create \
  --region us-central1 \
  --type firestore-native
```

#### Redis Cache
```bash
# AWS ElastiCache
aws elasticache create-cache-cluster \
  --cache-cluster-id eventify-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1

# Azure Redis Cache
az redis create \
  --resource-group eventify-rg \
  --name eventify-redis \
  --location eastus \
  --sku Basic \
  --vm-size c0

# GCP Memorystore
gcloud redis instances create eventify-redis \
  --size=1 \
  --region=us-central1 \
  --redis-version=7.0
```

#### Message Queue
```bash
# AWS SQS/SNS
aws sqs create-queue --queue-name eventify-events
aws sns create-topic --name eventify-events

# Azure Service Bus
az servicebus namespace create \
  --resource-group eventify-rg \
  --name eventify-sb \
  --sku Standard

# GCP Cloud Pub/Sub
gcloud pubsub topics create eventify-events
gcloud pubsub subscriptions create eventify-events-sub \
  --topic eventify-events
```

### 3. Create Kubernetes Cluster

```bash
# AWS EKS
aws eks create-cluster \
  --name eventify-cluster \
  --version 1.27 \
  --role-arn arn:aws:iam::ACCOUNT_ID:role/eks-service-role \
  --resources-vpc-config subnetIds=subnet-xxxxx,subnet-yyyyy

# Azure AKS
az aks create \
  --resource-group eventify-rg \
  --name eventify-cluster \
  --node-count 3 \
  --vm-set-type VirtualMachineScaleSets \
  --load-balancer-sku standard

# GCP GKE
gcloud container clusters create eventify-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-2
```

### 4. Configure Kubectl

```bash
# AWS
aws eks update-kubeconfig --region us-east-1 --name eventify-cluster

# Azure
az aks get-credentials --resource-group eventify-rg --name eventify-cluster

# GCP
gcloud container clusters get-credentials eventify-cluster --zone us-central1-a
```

### 5. Set Up Secrets and ConfigMaps

```bash
# Create namespace
kubectl create namespace eventify

# Create secrets from .env
kubectl create secret generic eventify-secrets \
  --from-env-file=.env \
  -n eventify

# Create ConfigMaps
kubectl create configmap eventify-config \
  --from-file=monitoring/prometheus.yml \
  -n eventify
```

### 6. Deploy Services

```bash
# Apply all manifests
kubectl apply -f k8s/ -n eventify

# Check deployment status
kubectl rollout status deployment/api-gateway -n eventify
kubectl get pods -n eventify

# Monitor logs
kubectl logs -f deployment/api-gateway -n eventify
```

### 7. Set Up Monitoring & Logging

```bash
# Install Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring

# Install ELK Stack / OpenSearch
helm install opensearch opensearch-project/opensearch -n logging

# Install Grafana
helm install grafana grafana/grafana -n monitoring
```

### 8. Configure Ingress & Load Balancer

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eventify-ingress
  namespace: eventify
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - yourdomain.com
    secretName: eventify-tls
  rules:
  - host: yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 3000
```

### 9. Set Up Auto-Scaling

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: eventify
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
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
```

## Provider-Specific Guides

### AWS Deployment Details

- **Region:** us-east-1 (primary), us-west-2 (DR)
- **VPC:** Private subnets for databases, public for ALB
- **IAM:** Service roles for EKS pods, restrictive policies
- **Cost:** ~$500-1000/month for multi-node production

See: [AWS_DEPLOYMENT_DETAILS.md](AWS_DEPLOYMENT_DETAILS.md)

### Azure Deployment Details

- **Region:** East US (primary), West US (DR)
- **Virtual Network:** Subnet configuration for AKS
- **Managed Identity:** RBAC for pod authentication
- **Cost:** ~$400-900/month for AKS + managed services

See: [AZURE_DEPLOYMENT_GUIDE.md](AZURE_DEPLOYMENT_GUIDE.md)

### GCP Deployment Details

- **Region:** us-central1 (primary), us-east1 (DR)
- **VPC:** Custom network for cluster
- **Service Accounts:** RBAC and workload identity
- **Cost:** ~$450-950/month for GKE + managed services

See: [GCP_DEPLOYMENT_DETAILS.md](GCP_DEPLOYMENT_DETAILS.md)

## Multi-Cloud Deployment

For high availability across regions/clouds:

```bash
# Deploy to AWS
kubectl config use-context aws-eventify-cluster
kubectl apply -f k8s/ -n eventify

# Deploy to Azure
kubectl config use-context azure-eventify-cluster
kubectl apply -f k8s/ -n eventify

# Deploy to GCP
kubectl config use-context gcp-eventify-cluster
kubectl apply -f k8s/ -n eventify

# Configure global load balancer (Route 53, Azure Traffic Manager, or Cloud Load Balancing)
```

## Disaster Recovery

### Backup Strategy

```bash
# Database backups
# AWS: RDS automated backups + manual snapshots
# Azure: Daily backups to geo-redundant storage
# GCP: Automated backups + point-in-time recovery

# Kubernetes state backups
helm install velero vmware-tanzu/velero \
  --namespace velero \
  --create-namespace \
  --values velero-values.yaml
```

### Failover Process

1. **Detect failure** (health checks, monitoring alerts)
2. **Failover to DR cluster** (update DNS, Route 53, Azure Traffic Manager)
3. **Restore from backups** (latest database snapshot)
4. **Verify services** (smoke tests)
5. **Update clients** (transparent with DNS failover)

## Monitoring & Alerts

### Key Metrics to Monitor

- Pod CPU/memory usage
- API response times (P50, P95, P99)
- Error rates by service
- Database query latency
- Cache hit ratios
- Message queue depth
- Disk I/O and network bandwidth

### Alert Thresholds

```yaml
# Example alert rules
- alert: HighPodCPU
  expr: container_cpu_usage_seconds_total > 0.8
  for: 5m

- alert: ServiceDown
  expr: up{job=~"eventify-.*"} == 0
  for: 1m

- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
```

## Cost Optimization

- **Spot instances** for non-critical workloads
- **Reserved instances** for baseline capacity
- **Auto-scaling** to handle variable load
- **Multi-tier storage** (hot/cold data)
- **CDN** for static assets
- **Caching** to reduce database queries

## Security Checklist

- ✅ HTTPS/TLS for all traffic
- ✅ Network policies restrict pod communication
- ✅ Pod security policies enforce hardening
- ✅ RBAC limits service account permissions
- ✅ Secrets encryption (envelope encryption)
- ✅ Regular security scanning (container images)
- ✅ Audit logging enabled
- ✅ DDoS protection (WAF)

## Troubleshooting

### Common Issues

**Pods not starting**
```bash
kubectl describe pod <pod-name> -n eventify
kubectl logs <pod-name> -n eventify
```

**Database connection errors**
```bash
# Check connection string
# Verify firewall rules allow pod IP
# Verify credentials in secrets
```

**High latency**
```bash
# Check resource utilization
kubectl top nodes
kubectl top pods -n eventify

# Check network policies
kubectl get networkpolicies -n eventify
```

## Support & Resources

- AWS Documentation: https://docs.aws.amazon.com/eks/
- Azure Documentation: https://learn.microsoft.com/azure/aks/
- GCP Documentation: https://cloud.google.com/kubernetes-engine/docs
- Kubernetes: https://kubernetes.io/docs/
