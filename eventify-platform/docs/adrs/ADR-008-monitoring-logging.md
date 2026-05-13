# ADR-008: Monitoring, Logging, and Observability Stack

**Status:** Accepted  
**Date:** 2026-04-20  
**Updated:** 2026-05-04

## Context

The Eventify Platform is a distributed system with 5 microservices, 3 databases, and multiple infrastructure components. We need comprehensive observability to:
- Detect and diagnose issues quickly
- Monitor system health and performance
- Debug distributed transactions
- Plan capacity and scaling
- Meet SLA requirements

We must choose technologies for:
- Metrics collection and visualization
- Centralized logging
- Alerting
- (Optional) Distributed tracing

## Decision

We adopt a **Prometheus + Grafana + OpenSearch** observability stack:

### Metrics: Prometheus + Grafana
- **Prometheus**: Time-series database for metrics collection
- **Grafana**: Visualization and dashboarding
- **prometheus_client** (Python): Metric instrumentation
- **prom-client** (Node.js): Metric instrumentation

### Logging: OpenSearch + OpenSearch Dashboards
- **OpenSearch**: Centralized log storage and search
- **OpenSearch Dashboards**: Log visualization and querying
- **Structured JSON logging**: All services use JSON format

### Alerting: Grafana Alerts
- **Grafana Alert Rules**: Define alert conditions
- **Alert Channels**: Email, Slack, PagerDuty (configurable)

### Tracing: Future Consideration
- **OpenTelemetry**: Industry standard (not yet implemented)
- **Jaeger**: Distributed tracing backend (optional)

## Rationale

### Why Prometheus?

**Advantages**:
- Industry-standard for metrics
- Pull-based model (services expose /metrics, Prometheus scrapes)
- Powerful query language (PromQL)
- Excellent Kubernetes integration (future-proof)
- Low resource overhead
- Open-source and free
- Large ecosystem of exporters

**Perfect for**:
- Time-series data (metrics over time)
- Application metrics (request rate, latency, errors)
- Infrastructure metrics (CPU, memory, disk)
- Alert rule evaluation

**Limitations**:
- Not designed for logs or events
- Limited long-term storage (15 days default)
- Not for high-cardinality data (e.g., user IDs)

### Why Grafana?

**Advantages**:
- Beautiful, customizable dashboards
- Multi-datasource support (Prometheus, OpenSearch, etc.)
- Built-in alerting
- Role-based access control
- Dashboard templating and variables
- Open-source and free
- Large community and plugin ecosystem

**Perfect for**:
- Real-time metrics visualization
- Operational dashboards
- Alert management
- Capacity planning

### Why OpenSearch (over ELK Stack)?

**Advantages over Elasticsearch**:
- Fully open-source (no licensing issues)
- Apache 2.0 license (permissive)
- Active development by AWS
- Compatible with Elasticsearch APIs
- Lighter weight than full ELK stack

**Advantages over Loki**:
- Full-text search capabilities
- Structured query language (SQL)
- Better for complex log analysis
- OpenSearch Dashboards is mature

**Perfect for**:
- Centralized log aggregation
- Full-text log search
- Log-based debugging
- Audit trails

**Limitations**:
- Higher resource usage than Loki
- Requires more configuration
- Overkill for simple log tailing

### Why Structured JSON Logging?

**Format**:
```json
{
  "timestamp": "2026-05-04T15:30:00.123Z",
  "level": "INFO",
  "service": "event-service",
  "correlation_id": "uuid-v4",
  "user_id": "user-123",
  "method": "POST",
  "endpoint": "/api/events",
  "status": 201,
  "duration_ms": 45,
  "message": "Event created successfully",
  "event_id": "663f7a9b123456789abcdef0"
}
```

**Advantages**:
- Easy to parse and index
- Supports structured queries
- Consistent across services
- Better than regex parsing

## Architecture

### Metrics Collection Flow
```
Microservices expose /metrics endpoint
  ↓ (HTTP GET every 15s)
Prometheus scrapes metrics
  ↓ (stores in time-series DB)
Grafana queries Prometheus (PromQL)
  ↓
Dashboard visualizes metrics
  ↓ (alert rule evaluation)
Alert triggered if threshold exceeded
  ↓
Notification sent (email, Slack)
```

### Logging Flow (Current - File-based)
```
Microservices write logs to stdout/stderr
  ↓
Docker captures logs
  ↓ (docker logs command)
Manual log inspection
```

### Logging Flow (Target - Centralized)
```
Microservices write structured JSON logs
  ↓ (via Fluentd/Logstash)
Log shipper sends to OpenSearch
  ↓ (indexed)
OpenSearch stores and indexes logs
  ↓
OpenSearch Dashboards for visualization
```

## Metrics Strategy

### Application-Level Metrics

#### Request Metrics (All Services)
- `http_requests_total` (Counter): Total requests by method, endpoint, status
- `http_request_duration_seconds` (Histogram): Request latency distribution
- `http_requests_in_progress` (Gauge): Current active requests

#### Business Metrics
- `events_created_total` (Counter): Total events created
- `rsvps_created_total` (Counter): Total RSVPs
- `chat_messages_sent_total` (Counter): Total chat messages
- `notifications_sent_total` (Counter): Total notifications

#### Database Metrics
- `db_queries_total` (Counter): Total database queries
- `db_query_duration_seconds` (Histogram): Query latency
- `db_connections_active` (Gauge): Active connections
- `db_connection_errors_total` (Counter): Connection errors

#### Cache Metrics
- `cache_hits_total` (Counter): Cache hits
- `cache_misses_total` (Counter): Cache misses
- `cache_operations_duration_seconds` (Histogram): Cache operation latency

#### Circuit Breaker Metrics
- `circuit_breaker_state` (Gauge): 0=closed, 1=open, 2=half-open
- `circuit_breaker_failures_total` (Counter): Total failures

### Host-Level Metrics (To Be Implemented)

#### CPU Metrics
- `node_cpu_seconds_total`: CPU time by mode
- `node_load1`, `node_load5`, `node_load15`: System load

#### Memory Metrics
- `node_memory_MemTotal_bytes`: Total memory
- `node_memory_MemAvailable_bytes`: Available memory
- `node_memory_Buffers_bytes`: Buffer cache

#### Disk Metrics
- `node_filesystem_size_bytes`: Filesystem size
- `node_filesystem_avail_bytes`: Available space
- `node_disk_io_time_seconds_total`: Disk I/O time

#### Network Metrics
- `node_network_receive_bytes_total`: Bytes received
- `node_network_transmit_bytes_total`: Bytes transmitted

**Implementation**: Add Prometheus `node_exporter` to docker-compose.yml

### Container Metrics (Docker)

**Using cAdvisor**:
- Container CPU usage
- Container memory usage
- Container network I/O
- Container filesystem usage

**Implementation**: Add `google/cadvisor` to docker-compose.yml

## Dashboards

### Eventify Main Dashboard

**Panels**:
1. **System Overview**
   - Total requests per second
   - Error rate (%)
   - Average response time
   - Active users

2. **Service Health**
   - Service status (up/down)
   - Request rate per service
   - Error rate per service
   - p95 latency per service

3. **Business Metrics**
   - Events created (time series)
   - RSVPs per hour
   - Chat messages per hour
   - Top trending events

4. **Infrastructure**
   - CPU usage per container
   - Memory usage per container
   - Disk usage
   - Network throughput

5. **Database Performance**
   - Query latency (p50, p95, p99)
   - Active connections
   - Slow queries (>100ms)

6. **Cache Performance**
   - Cache hit ratio
   - Cache size
   - Cache evictions

**Dashboard File**: `monitoring/eventify-dashboard.json`

### Individual Service Dashboards

**Per Service**:
- Request rate by endpoint
- Error rate by endpoint
- Latency by endpoint (heatmap)
- Dependency call latency

## Alerting Strategy

### Critical Alerts (Page On-call)

1. **Service Down**
   - Condition: `up == 0` for any service
   - Duration: 1 minute
   - Action: Page on-call engineer

2. **High Error Rate**
   - Condition: `error_rate > 5%`
   - Duration: 5 minutes
   - Action: Page on-call engineer

3. **Database Connection Pool Exhausted**
   - Condition: `db_connections_active >= db_connections_max`
   - Duration: 2 minutes
   - Action: Page on-call engineer

4. **Disk Space Critical**
   - Condition: `disk_available < 10%`
   - Duration: 5 minutes
   - Action: Page on-call engineer

### Warning Alerts (Notify Channel)

1. **High Latency**
   - Condition: `p95_latency > 1000ms`
   - Duration: 10 minutes
   - Action: Send to Slack

2. **Cache Miss Rate High**
   - Condition: `cache_miss_rate > 50%`
   - Duration: 15 minutes
   - Action: Send to Slack

3. **Circuit Breaker Open**
   - Condition: `circuit_breaker_state == 1`
   - Duration: 5 minutes
   - Action: Send to Slack

4. **RabbitMQ Queue Backlog**
   - Condition: `queue_depth > 1000`
   - Duration: 10 minutes
   - Action: Send to Slack

### Alert Configuration (Grafana)

**Notification Channels**:
- Email: alerts@eventify.com
- Slack: #eventify-alerts channel
- PagerDuty: For critical alerts

**Alert Rules File**: `monitoring/alert-rules.yml` (To Be Created)

## Logging Strategy

### Log Levels

- **DEBUG**: Detailed information for debugging (disabled in production)
- **INFO**: General informational messages (default)
- **WARNING**: Something unexpected but not critical
- **ERROR**: Error occurred but service continues
- **CRITICAL**: Severe error, service may stop

### What to Log

**Request Logs** (INFO):
- HTTP method, path, status code
- Request duration
- User ID (if authenticated)
- Correlation ID

**Error Logs** (ERROR):
- Error message
- Stack trace
- Request context
- User context

**Business Event Logs** (INFO):
- Event created
- RSVP added
- Payment processed (future)

**Security Logs** (WARNING):
- Failed login attempts
- Invalid JWT tokens
- Rate limit exceeded

**Performance Logs** (WARNING):
- Slow database queries (>100ms)
- High memory usage (>80%)
- Cache misses

### What NOT to Log

- Passwords or secrets
- Full credit card numbers
- Personally identifiable information (PII) without hashing
- Sensitive user data

### Log Retention

- **Production**: 30 days
- **Staging**: 7 days
- **Development**: 1 day

## Distributed Tracing (Future)

### Why Not Implemented Yet?

- Adds complexity (instrumentation, infrastructure)
- Current system scale doesn't require it
- Debugging is manageable with correlation IDs
- Can be added incrementally

### When to Implement?

- System becomes difficult to debug
- Multiple hops make latency attribution hard
- Team grows and needs better observability

### Recommended Approach

**OpenTelemetry**:
- Vendor-neutral standard
- Supports traces, metrics, logs
- Works with Jaeger, Zipkin, etc.

**Implementation**:
```javascript
// Node.js example
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

registerInstrumentations({
  instrumentations: [new HttpInstrumentation()],
});
```

## Configuration Files

### Prometheus Configuration
**File**: `monitoring/prometheus.yml`
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway:3000']
  - job_name: 'user-service'
    static_configs:
      - targets: ['user-service:3001']
  - job_name: 'event-service'
    static_configs:
      - targets: ['event-service:5001']
  - job_name: 'chat-service'
    static_configs:
      - targets: ['chat-service:3002']
  - job_name: 'notification-service'
    static_configs:
      - targets: ['notification-service:5002']
```

### Grafana Datasources
**File**: `monitoring/grafana-datasources.yml`
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

### Grafana Dashboard Provisioning
**File**: `monitoring/grafana-dashboards.yml`
```yaml
apiVersion: 1
providers:
  - name: 'Eventify Dashboards'
    folder: ''
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

## Implementation Status

### ✅ Implemented
- Prometheus running and configured
- Grafana running with datasource
- Eventify dashboard created
- Metrics exposed from Event Service (/metrics)
- Metrics exposed from API Gateway (/metrics)
- OpenSearch running
- OpenSearch Dashboards running

### ⚠️ Partial
- Not all services expose metrics (User, Chat, Notification need implementation)
- Logs not shipped to OpenSearch (still using docker logs)
- No host-level metrics (node_exporter missing)
- No container metrics (cAdvisor missing)

### ❌ Not Implemented
- Alert rules not configured
- Notification channels not configured
- Log shipping pipeline (Fluentd/Logstash)
- Distributed tracing
- Log-based alerts

## Trade-offs

### Prometheus Pull Model

**Advantages**:
- Services don't need to know about Prometheus
- Prometheus controls scrape rate
- Easy to add new services (just add scrape config)
- Handles slow/failing targets gracefully

**Disadvantages**:
- Requires /metrics endpoint on all services
- Doesn't work well for short-lived jobs (use Pushgateway)
- NAT/firewall issues in some deployments

### OpenSearch vs Loki

**Chose OpenSearch**:
- Richer query capabilities
- Better for complex log analysis
- Team familiar with Elasticsearch-like query language

**Rejected Loki**:
- Simpler but less powerful
- Label-based querying only
- Would be sufficient for current needs but less flexible

### Self-Hosted vs Cloud

**Chose Self-Hosted** (Docker Compose):
- Full control
- No data leaves infrastructure
- No additional cost
- Educational value for team

**Could Use Cloud**:
- Azure Monitor (integrated with Azure)
- Datadog (excellent UX, expensive)
- New Relic (APM focused)
- Grafana Cloud (managed Grafana)

## Alternatives Considered

### Alternative 1: ELK Stack (Elasticsearch + Logstash + Kibana)
**Rejected Because**:
- Elasticsearch licensing changed (not fully open-source)
- OpenSearch is open-source fork with active development
- Functionally equivalent

### Alternative 2: Azure Monitor
**Rejected Because**:
- Vendor lock-in
- Cost increases with usage
- Not portable to other clouds
- Harder to test locally

### Alternative 3: Datadog
**Rejected Because**:
- Very expensive ($15-30/host/month)
- Vendor lock-in
- Overkill for current scale
- Educational value lower (black box)

### Alternative 4: Self-built Metrics (StatsD + Graphite)
**Rejected Because**:
- Reinventing the wheel
- Prometheus is industry standard
- Less community support
- More maintenance burden

## Monitoring Best Practices

### Four Golden Signals (Google SRE)

1. **Latency**: Time to serve a request
   - Metric: `http_request_duration_seconds`
   - Alert: `p95 > 1s`

2. **Traffic**: How much demand on the system
   - Metric: `http_requests_total`
   - Alert: `requests_per_second > 1000`

3. **Errors**: Rate of failed requests
   - Metric: `http_requests_total{status=~"5.."}` 
   - Alert: `error_rate > 5%`

4. **Saturation**: How full the service is
   - Metric: `db_connections_active / db_connections_max`
   - Alert: `saturation > 80%`

### RED Method (For Services)

- **Rate**: Requests per second
- **Errors**: Number of failed requests
- **Duration**: Time per request

### USE Method (For Resources)

- **Utilization**: How busy is the resource?
- **Saturation**: How much work is queued?
- **Errors**: Error count

## Consequences

### Positive
- Comprehensive observability across system
- Industry-standard tools (easy to hire for)
- Open-source (no licensing costs)
- Portable (can run anywhere)
- Educational (team learns industry best practices)

### Negative
- Infrastructure overhead (Prometheus, Grafana, OpenSearch)
- Requires maintenance and updates
- Team needs to learn PromQL and OpenSearch query language
- Log shipping not yet implemented (manual docker logs)

### Neutral
- Resource usage acceptable for current scale (~2GB RAM total)
- Can migrate to cloud-managed later if needed
- Tracing can be added incrementally

## Future Improvements

1. **Implement log shipping** (Fluentd → OpenSearch)
2. **Add node_exporter** for host metrics
3. **Configure alert rules** in Grafana
4. **Set up alert notifications** (email, Slack)
5. **Add distributed tracing** (OpenTelemetry + Jaeger)
6. **Implement SLO/SLI tracking** (99.9% uptime)
7. **Add business metrics dashboard** (events per day, revenue)
8. **Implement anomaly detection** (ML-based)

## Review Schedule

- **Daily**: Check dashboards for anomalies
- **Weekly**: Review alert frequency and tune thresholds
- **Monthly**: Review retention policies and costs
- **Quarterly**: Evaluate new monitoring technologies

**Last Reviewed**: 2026-05-04  
**Next Review**: 2026-08-01
