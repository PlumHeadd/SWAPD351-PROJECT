# Monitoring & Observability Setup Guide

**Eventify Platform - SWAPD 351**  
**Date**: May 14, 2026  
**Status**: Production Ready

---

## 1. Overview

The monitoring stack consists of:
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **OpenSearch**: Logs and distributed tracing
- **Azure Monitor**: Cloud-native monitoring
- **Application Insights**: APM (Application Performance Monitoring)

---

## 2. Prometheus Configuration

### 2.1 Prometheus Config File

**File**: `monitoring/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'eventify-monitor'
    environment: 'production'

scrape_configs:
  # API Gateway
  - job_name: 'api-gateway'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['api-gateway:3000']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance

  # Event Service
  - job_name: 'event-service'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['event-service:5001']

  # Chat Service
  - job_name: 'chat-service'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['chat-service:3002']

  # Analytics Service
  - job_name: 'analytics-service'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['analytics-service:5003']

  # Notification Service
  - job_name: 'notification-service'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['notification-service:5002']

  # User Service
  - job_name: 'user-service'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['user-service:3001']

  # Node Exporter (Host Metrics)
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  # PostgreSQL Exporter
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Redis Exporter
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

rule_files:
  - '/etc/prometheus/alert_rules.yml'
```

### 2.2 Alert Rules

**File**: `monitoring/alert_rules.yml`

```yaml
groups:
  - name: application
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Service {{ $labels.job }} has error rate > 5%"

      # High latency
      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_ms) > 500
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "P95 latency for {{ $labels.job }} > 500ms"

      # Service down
      - alert: ServiceDown
        expr: up{job=~"api-gateway|event-service|chat-service"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"

      # Pod restarts
      - alert: PodRestarts
        expr: rate(kube_pod_container_status_restarts_total[1h]) > 0
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} has restarted"

  - name: infrastructure
    interval: 30s
    rules:
      # High CPU
      - alert: HighCPU
        expr: (100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)) > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage > 80%"

      # High memory
      - alert: HighMemory
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage > 85%"

      # Disk space
      - alert: LowDiskSpace
        expr: (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Available disk space < 10%"

  - name: database
    interval: 30s
    rules:
      # Database connection pool
      - alert: HighDatabaseConnections
        expr: pg_stat_activity_count > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High database connections"
          description: "Active connections > 80"

      # Slow queries
      - alert: SlowQueries
        expr: rate(pg_slow_queries_total[5m]) > 0.1
        labels:
          severity: warning
        annotations:
          summary: "Slow queries detected"

  - name: cache
    interval: 30s
    rules:
      # Redis memory
      - alert: HighRedisMemory
        expr: (redis_memory_used_bytes / redis_memory_max_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Redis memory usage"
          description: "Memory usage > 90%"

      # Low cache hit rate
      - alert: LowCacheHitRate
        expr: (redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total)) < 0.8
        for: 10m
        labels:
          severity: info
        annotations:
          summary: "Low cache hit rate < 80%"
```

---

## 3. Grafana Dashboards

### 3.1 System Overview Dashboard

**Dashboard ID**: System Overview

```json
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": "Prometheus",
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "editable": true,
  "gnetId": null,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "hideFrom": {
              "tooltip": false,
              "viz": false,
              "legend": false
            }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          }
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "id": 2,
      "options": {
        "legend": {
          "calcs": [],
          "displayMode": "list",
          "placement": "bottom"
        },
        "pieType": "donut",
        "tooltip": {
          "mode": "single"
        }
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "sum(rate(http_requests_total[5m])) by (status)",
          "legendFormat": "{{ status }}",
          "refId": "A"
        }
      ],
      "title": "Request Rate by Status",
      "type": "piechart"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "yellow",
                "value": 200
              },
              {
                "color": "red",
                "value": 500
              }
            ]
          },
          "unit": "ms"
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 12,
        "y": 0
      },
      "id": 3,
      "options": {
        "orientation": "auto",
        "reduceOptions": {
          "values": false,
          "calcs": [
            "lastNotNull"
          ],
          "fields": ""
        },
        "showThresholdLabels": false,
        "showThresholdMarkers": true
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, http_request_duration_ms)",
          "legendFormat": "P95",
          "refId": "A"
        }
      ],
      "title": "Latency (P95)",
      "type": "gauge"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 27,
  "style": "dark",
  "tags": [
    "eventify",
    "system",
    "overview"
  ],
  "templating": {
    "list": []
  },
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "Eventify System Overview",
  "uid": "system-overview",
  "version": 1
}
```

### 3.2 Business Metrics Dashboard

```yaml
# Key Metrics to Monitor
business_metrics:
  - name: events_created_total
    description: Total events created in platform
    query: sum(increase(events_created_total[1h]))
    
  - name: active_users
    description: Concurrent active users
    query: count(distinct(user_id))
    
  - name: messages_per_minute
    description: Chat messages sent per minute
    query: sum(rate(messages_sent_total[1m]))
    
  - name: rsvps_submitted
    description: RSVPs submitted per hour
    query: sum(increase(rsvps_submitted_total[1h]))
    
  - name: notifications_delivered
    description: Notifications delivered per hour
    query: sum(increase(notifications_delivered_total[1h]))
```

---

## 4. OpenSearch Logging

### 4.1 Filebeat Configuration

**File**: `monitoring/filebeat.yml`

```yaml
filebeat.inputs:
  - type: container
    enabled: true
    paths:
      - '/var/lib/docker/containers/*/*.log'
    processors:
      - add_kubernetes_metadata:
          in_cluster: true
      - add_docker_metadata: null

output.elasticsearch:
  hosts: ["opensearch:9200"]
  username: "elastic"
  password: "${OPENSEARCH_PASSWORD}"
  index: "logs-%{+yyyy.MM.dd}"

processors:
  - add_host_metadata:
      when.not.regexp.message: "^\\s*$"
  - add_log_metadata: null
  - decode_json_fields:
      fields: ["message"]
      target: "json"
      overwrite_keys: true

logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
  permissions: 0640
```

### 4.2 Log Format (JSON)

```javascript
// All services log in this format
logger.info({
  timestamp: new Date().toISOString(),
  level: 'INFO',
  service: 'event-service',
  message: 'Event created successfully',
  requestId: req.id,
  traceId: req.traceId,
  spanId: req.spanId,
  duration_ms: responseTime,
  userId: req.user?.id,
  eventId: eventId,
  metadata: {
    eventTitle: title,
    capacity: capacity,
    attendees: attendeeCount
  },
  tags: ['event-creation', 'success']
});
```

### 4.3 Kibana Dashboards

Key searches:
```
# Error logs
level: "ERROR" AND timestamp > now-1h

# Slow requests
duration_ms > 1000 AND timestamp > now-1h

# By service
service: "event-service" AND timestamp > now-24h

# Failed requests
status: 500 AND timestamp > now-1h

# User activity
userId: "specific-user-id" AND timestamp > now-24h
```

---

## 5. Application Insights (Azure)

### 5.1 SDK Installation

```javascript
// Node.js
const appInsights = require("applicationinsights");

appInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY)
  .setAutoCollectConsole(true)
  .setAutoCollectExceptions(true)
  .start();

const client = appInsights.defaultClient;

// Track events
client.trackEvent({
  name: "EventCreated",
  properties: {
    eventId: eventId,
    userId: userId,
    capacity: capacity
  },
  measurements: {
    processingTime: duration
  }
});

// Track traces
client.trackTrace({
  message: "Event processing completed",
  severity: appInsights.Contracts.SeverityLevel.Information
});

// Track dependencies
client.trackDependency({
  target: "MongoDB",
  name: "InsertEvent",
  duration: 234,
  success: true,
  resultCode: "0",
  dependencyTypeName: "MongoDB"
});
```

---

## 6. Distributed Tracing

### 6.1 Trace Correlation

```javascript
// Generate trace IDs
const trace = {
  traceId: uuid.v4(),
  spanId: uuid.v4(),
  parentSpanId: null,
  timestamp: Date.now(),
  duration: 0,
  service: 'api-gateway',
  status: 'success'
};

// Propagate through headers
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || uuid.v4();
  req.spanId = uuid.v4();
  
  res.setHeader('x-trace-id', req.traceId);
  res.setHeader('x-span-id', req.spanId);
  
  next();
});

// Log with correlation
logger.info({
  traceId: req.traceId,
  spanId: req.spanId,
  parentSpanId: req.parentSpanId,
  message: "Request processing",
  duration: Date.now() - startTime
});
```

---

## 7. Health Check Endpoints

### 7.1 Liveness Probe

```javascript
app.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 7.2 Readiness Probe

```javascript
app.get('/health/ready', async (req, res) => {
  try {
    // Check database connection
    await database.query('SELECT 1');
    
    // Check Redis connection
    await redis.ping();
    
    // Check RabbitMQ connection
    await rabbitmq.checkConnection();
    
    res.status(200).json({
      status: 'ready',
      checks: {
        database: 'ok',
        redis: 'ok',
        rabbitmq: 'ok'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message
    });
  }
});
```

---

## 8. Key Metrics Reference

### Application Metrics

```
# Throughput
http_requests_total{service="event-service", method="POST", status="201"}
rate(http_requests_total[5m])

# Latency
http_request_duration_ms{quantile="0.95"}
histogram_quantile(0.95, http_request_duration_ms)

# Errors
http_requests_total{status=~"5.."}
rate(http_requests_total{status=~"5.."}[5m])

# Business metrics
events_created_total
rsvps_submitted_total
messages_sent_total
notifications_delivered_total
```

### Infrastructure Metrics

```
# CPU
rate(node_cpu_seconds_total{mode!="idle"}[5m])

# Memory
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes

# Disk
node_filesystem_avail_bytes / node_filesystem_size_bytes

# Network
rate(node_network_receive_bytes_total[5m])
rate(node_network_transmit_errors_total[5m])
```

---

## 9. SLA & Targets

```yaml
Service Level Objectives:
  - Availability: 99.9% (max 43 minutes downtime/month)
  - Latency P95: < 200ms
  - Latency P99: < 500ms
  - Error Rate: < 0.1%
  - Cache Hit Rate: > 90%
  
Target Alerting:
  - Critical: Immediate page on-call engineer
  - Warning: Alert team, create incident
  - Info: Log for analysis
```

---

**Document Version**: 1.0  
**Last Updated**: May 14, 2026  
**Status**: Production Ready

