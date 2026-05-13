# Grafana Alert Configuration Guide

## Overview
This guide demonstrates setting up critical alerts in Grafana for the Eventify Platform monitoring system.

## Prerequisites
- Grafana running on http://localhost:3030
- Prometheus datasource configured (default: http://prometheus:9090)
- Admin access to Grafana

## Alert Rules Configuration

### 1. High Error Rate Alert

**Setup via UI:**
1. Go to Grafana → Alerts & IRM → Alert Rules
2. Click "Create alert rule"
3. Configure:
   - **Name**: "High Error Rate - Event Service"
   - **Condition**: PromQL Query
   ```promql
   increase(event_service_requests_total{status=~"5.."}[5m]) > 10
   ```
   - **Evaluation frequency**: 1m
   - **For duration**: 5m
   - **Severity**: Critical

### 2. High API Latency Alert

**PromQL Query:**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
```

**Configuration:**
- **Name**: "High API Latency (p95 > 500ms)"
- **Alert if**: Value exceeds 0.5 (500ms)
- **For duration**: 5m
- **Severity**: Warning

### 3. Service Unavailability Alert

**PromQL Query:**
```promql
up{job=~"event-service|api-gateway|user-service|chat-service|notification-service"} == 0
```

**Configuration:**
- **Name**: "Service Down - {{instance}}"
- **Alert if**: Value equals 0 (service down)
- **For duration**: 1m
- **Severity**: Critical

### 4. Database Connection Issues

**PromQL Query:**
```promql
rate(mongodb_connections_available[5m]) < 5
```

**Configuration:**
- **Name**: "Low MongoDB Connections Available"
- **Alert if**: Value < 5
- **For duration**: 2m
- **Severity**: Warning

### 5. Memory Usage Alert

**PromQL Query:**
```promql
(container_memory_usage_bytes / container_spec_memory_limit_bytes) * 100 > 85
```

**Configuration:**
- **Name**: "High Memory Usage - {{container_name}}"
- **Alert if**: Percentage > 85%
- **For duration**: 5m
- **Severity**: Warning

### 6. Cache Miss Rate Alert

**PromQL Query:**
```promql
rate(redis_keyspace_misses_total[5m]) / (rate(redis_keyspace_misses_total[5m]) + rate(redis_keyspace_hits_total[5m])) > 0.3
```

**Configuration:**
- **Name**: "High Redis Cache Miss Rate"
- **Alert if**: Miss rate > 30%
- **For duration**: 5m
- **Severity**: Warning

### 7. Event Service - CRUD Operations Failing

**PromQL Query:**
```promql
rate(event_service_requests_total{endpoint="/api/events",status="400"}[5m]) > 0.1
```

**Configuration:**
- **Name**: "High Event Creation Failure Rate"
- **Alert if**: Rate > 0.1 (10 failures/sec)
- **For duration**: 2m
- **Severity**: Critical

### 8. Queue Backlog Alert

**PromQL Query:**
```promql
rabbitmq_queue_messages > 1000
```

**Configuration:**
- **Name**: "RabbitMQ Queue Backlog"
- **Alert if**: Queue depth > 1000 messages
- **For duration**: 5m
- **Severity**: Warning

---

## Setting Up Notification Channels

After creating alert rules, configure where alerts should be sent:

### 1. Email Notifications
1. Go to Grafana → Administration → Channels
2. Click "New Channel"
3. Select "Email"
4. Configure:
   - **Name**: "Ops Team Email"
   - **Email address**: ops@company.com
   - **Include image**: Yes
   - **Include dashboard link**: Yes

### 2. Webhook Integration (For Slack/Teams)
1. Create a Slack webhook: https://api.slack.com/messaging/webhooks
2. In Grafana Channels → New Channel
3. Select "Webhook"
4. Configure:
   - **Name**: "Slack #alerts"
   - **URL**: `https://hooks.slack.com/services/YOUR/WEBHOOK/URL`
   - **HTTP Method**: POST

### 3. PagerDuty Integration
1. Get PagerDuty integration key
2. Grafana Channels → New Channel → PagerDuty
3. Enter integration key
4. Map severity levels

---

## Notification Policy

Configure routing and grouping:

1. Go to Grafana → Alerting → Notification policies
2. Set up routing rules:

```yaml
# Root route
group_by: ['alertname', 'cluster', 'service']
group_wait: 10s
group_interval: 10s
repeat_interval: 12h

routes:
  # Critical alerts - immediate
  - match:
      severity: critical
    receiver: 'ops-team'
    repeat_interval: 1h

  # Warnings - once per day
  - match:
      severity: warning
    receiver: 'dev-team'
    repeat_interval: 24h
    
  # Info - grouped daily
  - match:
      severity: info
    receiver: 'archive'
    repeat_interval: 24h
```

---

## Dashboard Visualization

### Create Alert Status Dashboard

1. New Dashboard
2. Add panels for:

**Panel 1: Alert State**
```promql
ALERTS{alertstate="firing"}
```

**Panel 2: Error Rate Trend**
```promql
rate(event_service_requests_total{status=~"5.."}[5m])
```

**Panel 3: Service Health**
```promql
up{job=~".*-service"}
```

**Panel 4: API Latency (p95)**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Panel 5: Active Alerts**
- Use "Alert list" panel
- Show: Firing alerts
- Sort: By priority

---

## Testing Alerts

### Simulate High Error Rate
```bash
# Generate errors by hitting invalid endpoints
for i in {1..100}; do
  curl -s http://localhost:3000/api/events/invalid &
done
```

### Verify Alert Firing
1. Go to Grafana → Alerting → Alert Rules
2. Look for alert status change to "Firing"
3. Check notification channel received message

### Test Notification Channel
1. Alert Rule → Edit → Test Rule
2. Select notification channel
3. Click "Send Test Alert"

---

## Performance Baselines

### Expected Metrics (Normal Operation)

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| API Response Time (p95) | <200ms | >300ms | >500ms |
| Error Rate | <1% | >5% | >10% |
| Cache Hit Rate | >80% | <70% | <50% |
| Database Latency | <50ms | >100ms | >200ms |
| Memory Usage | <60% | >75% | >85% |
| CPU Usage | <50% | >70% | >85% |
| Queue Depth | <100 | >500 | >1000 |

---

## Integration with CI/CD

### Trigger Alerts from Deployment
```bash
# After deployment, run k6 load test
k6 run tests/load/load_test.js --env BASE_URL=http://localhost:3000

# If alerts fire, rollback deployment
if [ $? -ne 0 ]; then
  docker-compose down
  # Rollback to previous version
fi
```

---

## Escalation Policy

```
L1: Dev Team (warning alerts, 5 min response)
    ↓ (if not resolved in 10 min)
L2: Ops Team (critical alerts, 2 min response)
    ↓ (if not resolved in 5 min)
L3: On-Call Manager (system down, immediate)
```

---

## Maintenance

### Monthly Review
- [ ] Check alert accuracy (false positive rate)
- [ ] Review alert threshold values
- [ ] Update dashboards
- [ ] Test notification channels
- [ ] Review resolved incidents

### Quarterly Tuning
- [ ] Adjust thresholds based on metrics trends
- [ ] Add new alert rules for emerging issues
- [ ] Remove stale/redundant alerts
- [ ] Update runbooks

---

## Runbooks (Action Items)

### High Error Rate
1. Check API Gateway logs: `docker logs eventify-platform-api-gateway-1`
2. Verify database connectivity
3. Check service health endpoints
4. Review recent deployments
5. Escalate if unresolved in 15 min

### Service Down
1. Check service status: `docker ps`
2. View logs: `docker logs <service-name>`
3. Restart service: `docker restart <service-name>`
4. If restart fails, escalate

### High Latency
1. Check database performance
2. Verify cache hit rate
3. Check network connectivity
4. Review active queries
5. Consider scaling if load-related

### Memory Issues
1. Check container memory limits
2. Review for memory leaks
3. Increase allocation if needed
4. Monitor after restart
5. Investigate trending if recurring
