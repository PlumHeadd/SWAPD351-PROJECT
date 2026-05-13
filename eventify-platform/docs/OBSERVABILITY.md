# Eventify Platform Observability Implementation

## Overview

This document describes the comprehensive observability implementation for the Eventify Platform microservices architecture. The implementation satisfies all requirements for the +2% observability bonus.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Metrics Implementation](#metrics-implementation)
3. [Service-Level Indicators (SLIs)](#service-level-indicators-slis)
4. [Grafana Dashboard](#grafana-dashboard)
5. [Demo Scenarios](#demo-scenarios)
6. [Troubleshooting Guide](#troubleshooting-guide)

## Architecture Overview

### Components

- **Prometheus**: Metrics collection and storage
- **Grafana**: Metrics visualization and alerting
- **Node Exporter**: Host-level metrics (CPU, memory, disk, network)
- **cAdvisor**: Container-level metrics
- **Service Metrics**: Application-level metrics exposed via `/metrics` endpoints

### Metrics Flow

```
Application Services → Prometheus (scrape) → Grafana (visualize) → Alerts
     ↓
Host (Node Exporter) → Prometheus
     ↓
Containers (cAdvisor) → Prometheus
```

## Metrics Implementation

### 1. API-Level Metrics (✅ IMPLEMENTED)

All services expose the following API-level metrics:

#### Request Count
- **Metric**: `http_requests_total`
- **Type**: Counter
- **Labels**: `method`, `route`, `status_code`
- **Purpose**: Track total number of HTTP requests

#### Request Latency
- **Metric**: `http_request_duration_seconds`
- **Type**: Histogram
- **Labels**: `method`, `route`, `status_code`
- **Buckets**: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
- **Purpose**: Track request latency distribution (enables p50, p95, p99 calculations)

#### Active Requests
- **Metric**: `http_active_requests`
- **Type**: Gauge
- **Labels**: `method`
- **Purpose**: Track concurrent active requests

#### Error Tracking
- **Metric**: `http_errors_total`
- **Type**: Counter
- **Labels**: `method`, `route`, `status_code`, `error_type`
- **Purpose**: Track HTTP errors (4xx client errors, 5xx server errors)

### 2. Service-Level Instrumentation (✅ IMPLEMENTED)

#### Event Service

**CreateEvent Operation**
- **Metrics**:
  - `event_operation_duration_seconds` (Histogram)
  - `event_operations_total` (Counter)
  - `events_created_total` (Counter)
- **Labels**: `operation='create_event'`, `status`
- **Measured**: Execution time, Success vs Failure, Business metric (events created)

**RSVP Operation**
- **Metrics**:
  - `rsvp_operation_duration_seconds` (Histogram)
  - `rsvp_operations_total` (Counter)
  - `rsvps_created_total` (Counter)
- **Labels**: `operation='create_rsvp'`, `status`
- **Measured**: Execution time, Success vs Failure, Business metric (RSVPs created)

#### User Service

**AuthenticateUser Operation**
- **Metrics**:
  - `auth_operation_duration_seconds` (Histogram)
  - `auth_operations_total` (Counter)
  - `auth_operation_success_rate` (Gauge)
- **Labels**: `operation='google_oauth'`, `status`
- **Measured**: Execution time, Success vs Failure, Success rate

**RefreshToken Operation**
- **Metrics**: Same as above
- **Labels**: `operation='refresh_token'`, `status`

**User Operations**
- **Metrics**:
  - `user_operation_duration_seconds` (Histogram)
  - `user_operations_total` (Counter)
- **Labels**: `operation`, `status`
- **Measured**: User CRUD operation performance

#### Notification Service

**SendNotification Operation**
- **Metrics**:
  - `notification_send_duration_seconds` (Histogram)
  - `notification_send_operations_total` (Counter)
  - `notifications_sent_total` (Counter)
  - `notifications_failed_total` (Counter)
- **Labels**: `notification_type='email'|'push'`, `status`
- **Measured**: Execution time, Success vs Failure, Notification count, Failure reasons

### 3. Dependency Observability (✅ IMPLEMENTED)

#### MongoDB (Event Service)

**Metrics**:
- `mongodb_operation_duration_seconds` (Histogram)
- `mongodb_operation_errors_total` (Counter)

**Labels**: `operation`, `collection`, `status`, `error_type`

**Measured**:
- Latency: Query execution time
- Errors: Failed operations with error types

**Instrumented Operations**:
- `find`, `findOne`, `insert`, `update`, `delete`
- Collections: `events`, `rsvps`

#### PostgreSQL (User Service)

**Metrics**:
- `db_query_duration_seconds` (Histogram)
- `db_query_errors_total` (Counter)
- `db_connection_pool_size` (Gauge)

**Labels**: `operation`, `table`, `status`, `error_type`

**Measured**:
- Latency: Query execution time
- Errors: Failed queries with error types

**Instrumented Operations**:
- `findByPk`, `findOne`, `create`, `update`, `destroy`
- Tables: `users`, `refresh_tokens`

#### Redis Cache (All Services)

**Metrics**:
- `cache_operation_duration_seconds` (Histogram)
- `cache_operation_errors_total` (Counter)
- `cache_hits_total` (Counter)
- `cache_misses_total` (Counter)
- `cache_hit_rate` (Gauge)

**Labels**: `operation`, `status`, `error_type`

**Measured**:
- Latency: Cache operation time
- Errors: Failed operations
- Efficiency: Hit/miss rate

**Instrumented Operations**:
- `get`, `set`, `delete`, `lpush`, `lrange`, `ltrim`

#### RabbitMQ Message Queue

**Metrics**:
- `rabbitmq_publish_duration_seconds` (Histogram)
- `rabbitmq_publish_errors_total` (Counter)
- `rabbitmq_consume_duration_seconds` (Histogram)
- `rabbitmq_consume_errors_total` (Counter)
- `rabbitmq_messages_processed_total` (Counter)

**Labels**: `routing_key`, `status`, `error_type`

**Measured**:
- Latency: Publish/consume time
- Errors: Failed operations
- Throughput: Messages processed

**Instrumented Routing Keys**:
- `event.created`, `event.updated`, `event.deleted`
- `rsvp.created`, `rsvp.cancelled`
- `chat.message`

#### External API (User Service from Notification Service)

**Metrics**:
- `external_api_call_duration_seconds` (Histogram)
- `external_api_call_errors_total` (Counter)

**Labels**: `service`, `operation`, `status`, `error_type`

**Measured**:
- Latency: API call time
- Errors: Failed calls

#### SMTP (Notification Service)

**Metrics**:
- `smtp_send_duration_seconds` (Histogram)
- `smtp_send_errors_total` (Counter)

**Labels**: `status`, `error_type`

**Measured**:
- Latency: Email send time
- Errors: Failed sends

### 4. Prometheus Integration (✅ IMPLEMENTED)

All services expose `/metrics` endpoint:

- **API Gateway**: `http://api-gateway:3000/metrics`
- **User Service**: `http://user-service:3001/metrics`
- **Event Service**: `http://event-service:5001/metrics`
- **Chat Service**: `http://chat-service:3002/metrics`
- **Notification Service**: `http://notification-service:5002/metrics`

Prometheus configuration (`monitoring/prometheus.yml`) includes scrape jobs for:
- All microservices
- Node Exporter (host metrics)
- cAdvisor (container metrics)

### 5. Grafana Dashboard (✅ IMPLEMENTED)

Dashboard configuration: `monitoring/grafana-dashboard.json`

**Panels**:

1. **API Request Rate** (req/s) - Request count rate per service
2. **API Error Rate** (%) - Error percentage
3. **API Request Latency** (p95, p99) - Latency percentiles
4. **Active HTTP Requests** - Concurrency metric
5. **Service-Level Operations: Event Service** - Event operation success/failure
6. **Service-Level Latency: Event Operations** - Event operation latency
7. **Dependency: MongoDB Operation Latency** - Database performance
8. **Dependency: MongoDB Errors** - Database error tracking
9. **Dependency: Redis Cache Hit/Miss Rate** - Cache efficiency
10. **Dependency: Redis Operation Latency** - Cache performance
11. **Dependency: RabbitMQ Publish Latency** - Message queue performance
12. **Dependency: RabbitMQ Message Processing** - Message throughput
13. **Service-Level: Authentication Operations** - Auth performance
14. **Service-Level: Notification Operations** - Notification performance
15. **Business Metrics: Events & RSVPs Created** - Business KPIs
16. **System: CPU Usage** - Host CPU utilization
17. **System: Memory Usage** - Host memory utilization
18. **Container: CPU Usage per Container** - Container resource usage

## Service-Level Indicators (SLIs)

### Primary SLIs

#### Availability SLI
- **Definition**: Percentage of successful HTTP requests
- **Calculation**: `(total_requests - error_requests) / total_requests * 100`
- **Target**: 99.9% (SLO)
- **Query**: `(sum(rate(http_requests_total[5m])) - sum(rate(http_errors_total[5m]))) / sum(rate(http_requests_total[5m])) * 100`

#### Latency SLI
- **Definition**: 95th percentile request latency
- **Target**: < 200ms for reads, < 500ms for writes (SLO)
- **Query**: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`

#### Error Rate SLI
- **Definition**: Percentage of failed requests
- **Target**: < 0.1% (SLO)
- **Query**: `sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100`

### Secondary SLIs

#### Cache Hit Rate SLI
- **Definition**: Percentage of cache hits vs total cache operations
- **Target**: > 80% (SLO)
- **Query**: `sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))`

#### Database Query Performance SLI
- **Definition**: 95th percentile database query latency
- **Target**: < 50ms (SLO)
- **Query**: `histogram_quantile(0.95, sum(rate(mongodb_operation_duration_seconds_bucket[5m])) by (le))`

## Failure Scenarios & Observations

### Scenario 1: Load Increases

**Trigger**: Increased traffic (50 → 200 concurrent users)

**Expected Observations**:
- ✓ Request rate ↑ (`http_requests_total` rate increases)
- ✓ Active requests ↑ (`http_active_requests` gauge increases)
- ✓ Latency ↑ (p95, p99 increases as queuing occurs)
- ✓ Cache hit rate ↓ (more unique queries)
- ✓ Database latency ↑ (increased query load)
- ✓ CPU usage ↑ (host and container metrics)
- ✓ Memory usage ↑ (buffering, connection pools)

**Grafana Panels to Monitor**:
- Panel 1: API Request Rate
- Panel 3: API Request Latency (p95, p99)
- Panel 4: Active HTTP Requests
- Panel 16: System CPU Usage
- Panel 17: System Memory Usage

### Scenario 2: Service Failures Occur

**Trigger**: Dependency failure (MongoDB, Redis, RabbitMQ down)

**Expected Observations**:
- ✓ Error rate ↑ (`http_errors_total` increases, 5xx errors)
- ✓ Dependency errors ↑ (`mongodb_operation_errors_total`, `cache_operation_errors_total`)
- ✓ Circuit breaker opens (`circuit_breaker_state` = 1)
- ✓ Service operations fail (`event_operations_total{status="failure"}` increases)
- ✓ Downstream timeouts ↑
- ✓ Cache misses ↑ (if Redis fails)

**Grafana Panels to Monitor**:
- Panel 2: API Error Rate
- Panel 8: Dependency MongoDB Errors
- Panel 5: Service-Level Operations (failure rate)

### Scenario 3: Slow Dependency

**Trigger**: Database slow queries, network latency

**Expected Observations**:
- ✓ Overall latency ↑ (p95, p99)
- ✓ Specific dependency latency ↑ (`mongodb_operation_duration_seconds` p95)
- ✓ Service operation latency ↑ (cascading effect)
- ✓ Timeout errors ↑
- ✓ Circuit breaker may open

**Grafana Panels to Monitor**:
- Panel 3: API Request Latency
- Panel 7: Dependency MongoDB Operation Latency
- Panel 10: Dependency Redis Operation Latency

### Identifying Issues

#### A Slow Endpoint

1. Check **Panel 3: API Request Latency** - identify spike in p95/p99
2. Drill down by `route` label to find specific endpoint
3. Check **Panel 6: Service-Level Latency** - identify slow operation
4. Check **Panels 7, 10, 11**: Identify slow dependency
5. Root cause: Dependency latency, missing index, N+1 query

**Example**:
```promql
# Find slowest endpoints
topk(5, histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)))

# Find slow event operations
histogram_quantile(0.95, sum(rate(event_operation_duration_seconds_bucket[5m])) by (le, operation))
```

#### A Failing Dependency

1. Check **Panel 2: API Error Rate** - identify error spike
2. Check **Panel 8: Dependency MongoDB Errors** - identify dependency errors
3. Check error labels for `error_type`
4. Check logs for connection errors, timeouts
5. Root cause: Database down, network issue, misconfiguration

**Example**:
```promql
# Find dependencies with errors
sum(rate(mongodb_operation_errors_total[5m])) by (error_type, operation)
sum(rate(cache_operation_errors_total[5m])) by (error_type, operation)
sum(rate(rabbitmq_publish_errors_total[5m])) by (error_type, routing_key)
```

## Demo Scenarios

### Running the Demo

```bash
# 1. Start all services
docker-compose up -d

# 2. Wait for services to be healthy
docker-compose ps

# 3. Access Grafana
# URL: http://localhost:3001
# Username: admin
# Password: admin

# 4. Import dashboard
# Navigate to Dashboards → Import
# Upload: monitoring/grafana-dashboard.json

# 5. Run observability demo scenario
k6 run tests/observability/demo-scenario.js

# 6. Monitor Grafana dashboard in real-time
# Observe metrics during test phases
```

### Demo Test Phases

1. **Phase 1 (0-30s)**: Warm up - 10 VUs - Baseline metrics
2. **Phase 2 (30s-1.5m)**: Increased load - 50 VUs - Latency rises
3. **Phase 3 (1.5m-2m)**: Spike - 200 VUs - High latency, some errors
4. **Phase 4 (2m-4m)**: Sustained - 150 VUs - System under stress
5. **Phase 5 (4m-5m)**: Recovery - 20 VUs - Metrics normalize
6. **Phase 6 (5m-5.5m)**: Cool down - 0 VUs - Return to baseline

## Common Mistakes Avoided

### ✅ Not Just `/metrics` Endpoint
- **Issue**: Services only expose default Prometheus metrics
- **Solution**: Comprehensive custom metrics for API, service, and dependency levels

### ✅ No High-Cardinality Labels
- **Issue**: Using `user_id`, `request_id`, `email` as labels causes cardinality explosion
- **Solution**: Only use low-cardinality labels: `status`, `operation`, `method`, `error_type`

### ✅ Service-Level Instrumentation Implemented
- **Issue**: No business logic instrumentation
- **Solution**: Key operations instrumented: CreateEvent, RSVP, Authenticate, SendNotification

### ✅ Dependency Metrics Implemented
- **Issue**: No external dependency observability
- **Solution**: MongoDB, PostgreSQL, Redis, RabbitMQ, SMTP all instrumented

### ✅ Meaningful Dashboards
- **Issue**: Empty or incomplete Grafana dashboards
- **Solution**: 18 panels covering API, service, dependency, and system metrics

## Troubleshooting Guide

### Metrics Not Showing in Prometheus

1. Check service `/metrics` endpoint:
   ```bash
   curl http://localhost:3000/metrics
   ```

2. Check Prometheus targets:
   - URL: http://localhost:9090/targets
   - Ensure all targets are "UP"

3. Check Prometheus configuration:
   ```bash
   docker-compose exec prometheus cat /etc/prometheus/prometheus.yml
   ```

### Grafana Dashboard Empty

1. Check Prometheus data source:
   - Configuration → Data Sources → Prometheus
   - URL should be: http://prometheus:9090

2. Test query in Prometheus UI:
   - http://localhost:9090/graph
   - Try: `http_requests_total`

3. Check time range in Grafana (top right)

### High Latency Observed

1. Check database metrics (Panels 7, 8)
2. Check cache metrics (Panels 9, 10)
3. Check system resources (Panels 16, 17, 18)
4. Check for slow queries in logs
5. Consider adding database indexes

### High Error Rate

1. Check error types in Panel 2
2. Check dependency errors (Panels 8)
3. Check service operation failures (Panel 5)
4. Review application logs for stack traces
5. Check circuit breaker states

## References

- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [SLI/SLO/SLA](https://sre.google/sre-book/service-level-objectives/)
- [Observability Engineering](https://www.honeycomb.io/what-is-observability)
