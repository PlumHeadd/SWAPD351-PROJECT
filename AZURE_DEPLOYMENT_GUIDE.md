# Azure Deployment Guide - Eventify Platform

**Deployment Configuration for Production**  
**Date**: May 14, 2026  
**Status**: Ready for Deployment

---

## 1. Prerequisites

### 1.1 Azure Subscription Setup

```bash
# Login to Azure
az login

# Set default subscription
az account set --subscription "Your Subscription ID"

# Verify
az account show
```

### 1.2 Required Azure Services

```
✓ Azure Kubernetes Service (AKS)
✓ Azure Container Registry (ACR)
✓ Azure Database for PostgreSQL (Flexible Server with Citus)
✓ Azure Cosmos DB (MongoDB API)
✓ Azure Cache for Redis
✓ Azure Service Bus (RabbitMQ replacement)
✓ Azure Monitor (Metrics & Logging)
✓ Application Insights
✓ Azure Key Vault
✓ Azure Load Balancer
✓ Azure Container Instances (for batch jobs)
```

---

## 2. Infrastructure Setup

### 2.1 Create Resource Group

```bash
# Create resource group
az group create \
  --name eventify-prod-rg \
  --location eastus

# Set default resource group
az configure --defaults group=eventify-prod-rg
```

### 2.2 Create Azure Container Registry

```bash
# Create ACR
az acr create \
  --resource-group eventify-prod-rg \
  --name eventifyacr \
  --sku Premium \
  --admin-enabled true

# Get login credentials
az acr credential show \
  --resource-group eventify-prod-rg \
  --name eventifyacr

# Tag and push images
docker tag eventify/api-gateway:latest eventifyacr.azurecr.io/api-gateway:latest
docker push eventifyacr.azurecr.io/api-gateway:latest
```

### 2.3 Create AKS Cluster

```bash
# Create AKS cluster
az aks create \
  --resource-group eventify-prod-rg \
  --name eventify-aks \
  --node-count 3 \
  --vm-set-type VirtualMachineScaleSets \
  --load-balancer-sku standard \
  --enable-managed-identity \
  --network-plugin azure \
  --enable-addons monitoring,http_application_routing \
  --generate-ssh-keys \
  --zones 1 2 3

# Get cluster credentials
az aks get-credentials \
  --resource-group eventify-prod-rg \
  --name eventify-aks \
  --admin

# Verify cluster
kubectl cluster-info
kubectl get nodes
```

### 2.4 Create PostgreSQL Database (Citus)

```bash
# Create PostgreSQL with Citus
az postgres server-arc create \
  --name eventify-postgres \
  --resource-group eventify-prod-rg \
  --admin-user dbadmin \
  --admin-password "YourSecurePassword123!" \
  --sku-name Standard_D2s_v3 \
  --storage-size 128 \
  --tier Burstable

# Create database
az postgres flexible-server database create \
  --resource-group eventify-prod-rg \
  --server-name eventify-postgres \
  --database-name eventify

# Configure firewall for AKS
az postgres flexible-server firewall-rule create \
  --resource-group eventify-prod-rg \
  --name eventify-postgres \
  --rule-name allow-aks \
  --start-ip-address "AKS_OUTBOUND_IP" \
  --end-ip-address "AKS_OUTBOUND_IP"
```

### 2.5 Create Azure Cosmos DB (MongoDB API)

```bash
# Create Cosmos DB account
az cosmosdb create \
  --name eventify-cosmosdb \
  --resource-group eventify-prod-rg \
  --kind MongoDB \
  --locations regionName=eastus failoverPriority=0 \
             regionName=westus failoverPriority=1

# Create database
az cosmosdb mongodb database create \
  --account-name eventify-cosmosdb \
  --database-name eventify \
  --resource-group eventify-prod-rg

# Create collections with sharding
az cosmosdb mongodb collection create \
  --account-name eventify-cosmosdb \
  --database-name eventify \
  --name events \
  --shard _id \
  --resource-group eventify-prod-rg

# Get connection string
az cosmosdb keys list \
  --name eventify-cosmosdb \
  --resource-group eventify-prod-rg \
  --type connection-strings
```

### 2.6 Create Azure Cache for Redis

```bash
# Create Redis cache
az redis create \
  --resource-group eventify-prod-rg \
  --name eventify-redis \
  --location eastus \
  --sku Premium \
  --vm-size p1 \
  --zones 1 2

# Get connection string
az redis show-connection-string \
  --name eventify-redis \
  --resource-group eventify-prod-rg
```

### 2.7 Create Azure Service Bus

```bash
# Create Service Bus namespace
az servicebus namespace create \
  --resource-group eventify-prod-rg \
  --name eventify-servicebus \
  --location eastus \
  --sku Premium

# Create queues
az servicebus queue create \
  --resource-group eventify-prod-rg \
  --namespace-name eventify-servicebus \
  --name analytics-events \
  --max-delivery-count 5

# Create topics and subscriptions
az servicebus topic create \
  --resource-group eventify-prod-rg \
  --namespace-name eventify-servicebus \
  --name notifications

az servicebus topic subscription create \
  --resource-group eventify-prod-rg \
  --namespace-name eventify-servicebus \
  --topic-name notifications \
  --name email-service
```

### 2.8 Create Azure Key Vault

```bash
# Create Key Vault
az keyvault create \
  --resource-group eventify-prod-rg \
  --name eventify-keyvault \
  --location eastus

# Add secrets
az keyvault secret set \
  --vault-name eventify-keyvault \
  --name jwt-secret \
  --value "your_jwt_secret_key_here"

az keyvault secret set \
  --vault-name eventify-keyvault \
  --name google-client-id \
  --value "your_google_client_id"

az keyvault secret set \
  --vault-name eventify-keyvault \
  --name google-client-secret \
  --value "your_google_client_secret"

# List secrets
az keyvault secret list --vault-name eventify-keyvault
```

---

## 3. Kubernetes Deployment

### 3.1 Create Namespaces and RBAC

```yaml
# namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: eventify

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: eventify-sa
  namespace: eventify

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: eventify-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: admin
subjects:
- kind: ServiceAccount
  name: eventify-sa
  namespace: eventify
```

### 3.2 ConfigMaps and Secrets

```yaml
# configmaps.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: eventify-config
  namespace: eventify
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  API_GATEWAY_URL: "https://api.eventify.com"
  FRONTEND_URL: "https://eventify.com"

---
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: eventify-secrets
  namespace: eventify
type: Opaque
stringData:
  JWT_SECRET: "your_jwt_secret"
  GOOGLE_CLIENT_ID: "your_client_id"
  GOOGLE_CLIENT_SECRET: "your_client_secret"
  DATABASE_URL: "postgresql://user:pass@host:5432/db"
  MONGO_URI: "mongodb+srv://user:pass@host/db"
  REDIS_URL: "redis://:password@host:6379"
  SERVICE_BUS_URL: "Endpoint=sb://host.servicebus.windows.net/..."
```

Apply:
```bash
kubectl apply -f namespaces.yaml
kubectl apply -f configmaps.yaml
kubectl apply -f secrets.yaml
```

### 3.3 Deploy Applications

```yaml
# api-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: eventify
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: api-gateway
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: eventify-sa
      containers:
      - name: api-gateway
        image: eventifyacr.azurecr.io/api-gateway:latest
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 3000
        
        envFrom:
        - configMapRef:
            name: eventify-config
        - secretRef:
            name: eventify-secrets
        
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 256Mi
        
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

---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
  namespace: eventify
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: http
    protocol: TCP
    name: http
  selector:
    app: api-gateway

---
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
  minReplicas: 3
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

Apply deployment:
```bash
kubectl apply -f api-gateway-deployment.yaml
```

Repeat for other services (event-service, user-service, chat-service, notification-service, analytics-service).

---

## 4. Monitoring and Logging Setup

### 4.1 Enable Azure Monitor

```bash
# Enable monitoring on AKS
az aks enable-addons \
  --resource-group eventify-prod-rg \
  --name eventify-aks \
  --addons monitoring

# Get Log Analytics workspace ID
az aks show --resource-group eventify-prod-rg --name eventify-aks \
  --query addonProfiles.omsagent.config.logAnalyticsWorkspaceResourceID
```

### 4.2 Configure Application Insights

```bash
# Create Application Insights
az monitor app-insights component create \
  --app eventify-insights \
  --location eastus \
  --resource-group eventify-prod-rg \
  --application-type web

# Get instrumentation key
az monitor app-insights component show \
  --app eventify-insights \
  --resource-group eventify-prod-rg \
  --query instrumentationKey
```

### 4.3 Prometheus and Grafana Deployment

```yaml
# prometheus-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: eventify
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:latest
        ports:
        - containerPort: 9090
        volumeMounts:
        - name: config-volume
          mountPath: /etc/prometheus
        - name: storage-volume
          mountPath: /prometheus
      volumes:
      - name: config-volume
        configMap:
          name: prometheus-config
      - name: storage-volume
        persistentVolumeClaim:
          claimName: prometheus-pvc

---
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: eventify
spec:
  ports:
  - port: 9090
    targetPort: 9090
  selector:
    app: prometheus
```

---

## 5. Ingress Configuration

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eventify-ingress
  namespace: eventify
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - eventify.com
    - www.eventify.com
    - api.eventify.com
    secretName: eventify-tls
  rules:
  - host: eventify.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
  - host: api.eventify.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 80
```

---

## 6. Backup and Disaster Recovery

### 6.1 PostgreSQL Backups

```bash
# Enable automated backups
az postgres flexible-server parameter set \
  --resource-group eventify-prod-rg \
  --server-name eventify-postgres \
  --name backup_retention_days \
  --value 35

# Configure geo-redundant backup
az postgres flexible-server update \
  --resource-group eventify-prod-rg \
  --name eventify-postgres \
  --geo-redundant-backup Enabled
```

### 6.2 Cosmos DB Backups

```bash
# Enable point-in-time restore
az cosmosdb update \
  --resource-group eventify-prod-rg \
  --name eventify-cosmosdb \
  --enable-automatic-failover true \
  --locations regionName=eastus failoverPriority=0 \
             regionName=westus failoverPriority=1
```

---

## 7. Scaling Configuration

### 7.1 Auto-scaling

```yaml
# autoscaling-example.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: event-service-hpa
  namespace: eventify
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: event-service
  minReplicas: 2
  maxReplicas: 15
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
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
      - type: Pods
        value: 2
        periodSeconds: 30
      selectPolicy: Max
```

---

## 8. Deployment Checklist

- [ ] Azure resource group created
- [ ] Container Registry set up and images pushed
- [ ] AKS cluster created with proper node pool
- [ ] PostgreSQL database provisioned with Citus
- [ ] Cosmos DB created with sharding
- [ ] Redis cache deployed
- [ ] Service Bus configured
- [ ] Key Vault set up with secrets
- [ ] Kubernetes namespaces and RBAC configured
- [ ] ConfigMaps and Secrets created
- [ ] All microservices deployed
- [ ] LoadBalancer and Ingress configured
- [ ] SSL/TLS certificates installed
- [ ] Prometheus and Grafana deployed
- [ ] Azure Monitor configured
- [ ] Backup policies enabled
- [ ] Auto-scaling configured
- [ ] DNS records pointing to ingress
- [ ] Health checks verified
- [ ] Smoke tests passed

---

## 9. Post-Deployment Verification

```bash
# Check all pods running
kubectl get pods -n eventify

# Check services
kubectl get svc -n eventify

# Check ingress
kubectl get ingress -n eventify

# Check logs
kubectl logs -f deployment/api-gateway -n eventify

# Access application
curl https://api.eventify.com/health
```

---

**Document Version**: 1.0  
**Last Updated**: May 14, 2026  
**Status**: Production Ready

