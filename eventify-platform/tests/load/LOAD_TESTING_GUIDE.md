# Load Testing & Stress Testing Guide

## Overview

This guide covers running comprehensive load and stress tests for the Eventify Platform using k6, a modern load testing tool.

## Prerequisites

### Install k6
**Windows:**
```powershell
# Using Chocolatey
choco install k6

# Or download from: https://github.com/grafana/k6/releases
```

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install k6

# Or download binary from: https://github.com/grafana/k6/releases
```

### Verify Installation
```bash
k6 version
# Output: k6 v0.45.0 (commit/build info)
```

---

## Running Load Tests

### Basic Load Test (Default Configuration)
```bash
cd eventify-platform
k6 run tests/load/load_test.js
```

**What this does:**
- Ramps up from 0 → 20 VUs (1 min)
- Ramps up from 20 → 50 VUs (2 min)
- Peaks at 100 VUs (2 min)
- Ramps down (2 min total)
- **Total duration**: ~7 minutes
- **Concurrent users at peak**: 100

### Load Test with Custom Configuration
```bash
# Change base URL
k6 run tests/load/load_test.js --env BASE_URL=http://api.example.com

# Adjust test duration
k6 run tests/load/load_test.js --stage "0s:0,5m:100,5m:100,5m:0"

# Set maximum VUs
k6 run tests/load/load_test.js --max 200

# Run with results output
k6 run tests/load/load_test.js -o csv=results.csv
```

---

## Test Stages Explained

### Current Test Profile: Ramp-Up + Peak + Ramp-Down

```
VUs
100 │         ┌─────────┐
    │        ╱           ╲
 50 │       ╱             ╲
    │      ╱               ╲
 20 │     ╱                 ╲
    │    ╱                   ╲___
  0 └───┴─────────────────────────
    0    1m    2m    3m    4m    5m    6m    7m
       Ramp   Ramp  Peak  Ramp   Done
```

**Stages:**
1. **Ramp-up (20 VUs)**: 1m - Warm up the system
2. **Ramp-up (50 VUs)**: 2m - Increase load gradually
3. **Peak (100 VUs)**: 2m - Maximum stress point
4. **Ramp-down (50 VUs)**: 1m - Graceful decrease
5. **Ramp-down (0 VUs)**: 1m - Shutdown

---

## Load Test Scenarios

### Scenario 1: Spike Test (Sudden Traffic)
```bash
k6 run - <<'EOF'
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 1000 },   // Sudden spike
    { duration: '30s', target: 1000 },   // Hold spike
    { duration: '10s', target: 0 },      // Sudden drop
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'],
  },
};

export default function () {
  http.get('http://localhost:3000/health');
  sleep(0.1);
}
EOF
```

### Scenario 2: Sustained Load Test
```bash
k6 run - <<'EOF'
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp to 100 VUs
    { duration: '10m', target: 100 },  // Stay at 100 VUs for 10 minutes
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  http.get('http://localhost:3000/api/events');
  sleep(1);
}
EOF
```

### Scenario 3: Stress Test (Breaking Point)
```bash
k6 run - <<'EOF'
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '2m', target: 300 },
    { duration: '2m', target: 400 },
    { duration: '2m', target: 500 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.1'],
  },
};

export default function () {
  http.get('http://localhost:3000/api/events?page=1&limit=50');
}
EOF
```

### Scenario 4: Soak Test (Long Duration)
```bash
k6 run - <<'EOF'
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '5m', target: 50 },   // Ramp
    { duration: '60m', target: 50 },  // Hold for 1 hour
    { duration: '5m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  http.get('http://localhost:3000/api/events');
}
EOF
```

---

## Results Interpretation

### Key Metrics

| Metric | Meaning | Good | Warning | Critical |
|--------|---------|------|---------|----------|
| `http_req_duration` | Response time | <300ms | 300-500ms | >500ms |
| `http_req_failed` | Failed requests | <1% | 1-5% | >5% |
| `iterations` | Completed requests | Higher is better | - | - |
| `vus` | Active virtual users | Stable | Unstable | - |
| `vus_max` | Peak VUs | Meets target | - | - |

### Sample Output
```
checks........................: 92.3% ✓ 8765 ✗ 735
data_sent......................: 2.3 MB
data_received..................: 18.5 MB
http_req_blocked...............: avg=2.4ms    min=1ms  med=2ms max=150ms p(90)=3ms p(95)=4ms
http_req_connecting............: avg=0.8ms    min=0ms  med=0ms max=90ms  p(90)=0ms p(95)=0ms
http_req_duration..............: avg=234ms    min=10ms med=180ms max=2800ms p(90)=450ms p(95)=580ms
http_req_failed................: 7.75%
http_req_receiving.............: avg=12ms     min=0ms  med=8ms  max=250ms p(90)=25ms p(95)=35ms
http_req_sending...............: avg=1.2ms    min=0ms  med=1ms  max=80ms  p(90)=2ms  p(95)=3ms
http_req_tls_handshaking.......: avg=0ms      min=0ms  med=0ms  max=0ms   p(90)=0ms  p(95)=0ms
http_req_waiting...............: avg=220ms    min=5ms  med=160ms max=2700ms p(90)=430ms p(95)=560ms
http_reqs......................: 11500 192.19/s
iteration_duration.............: avg=3.2s     min=2.1s med=3.0s max=8.5s  p(90)=4.5s p(95)=5.2s
iterations......................: 11500 192.19/s
vus............................: 50
vus_max.........................: 100
```

**Analysis:**
- ✅ HTTP requests completed at 192/sec
- ✅ P95 response time: 580ms (acceptable)
- ⚠️ 7.75% failed requests (above 5% threshold)
- ⚠️ P99 response time: ~2.8s (high)

**Recommendations:**
- Investigate why 7.75% requests fail
- Optimize API response times
- Check database query performance
- Scale up resources if needed

---

## Advanced Testing

### Testing with Think Time
```javascript
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '5m',
};

export default function () {
  http.get('http://localhost:3000/api/events');
  sleep(Math.random() * 3);  // Random think time 0-3s
}
```

### Testing Different Endpoints
```javascript
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const getCounter = new Counter('endpoint_gets');
const postCounter = new Counter('endpoint_posts');

export const options = {
  vus: 30,
  duration: '10m',
};

export default function () {
  let random = Math.random();
  
  if (random < 0.8) {
    // 80% GET requests
    http.get('http://localhost:3000/api/events');
    getCounter.add(1);
  } else {
    // 20% POST requests (would fail without auth, but measures impact)
    http.post('http://localhost:3000/api/events', {});
    postCounter.add(1);
  }
}
```

### Distributed Load Testing (Cloud)
```bash
# Run test in Grafana Cloud
k6 cloud run tests/load/load_test.js

# This:
# - Uploads your test script
# - Runs it distributed across multiple regions
# - Provides web dashboard
# - Stores results for comparison
```

---

## Integration with Monitoring

### Collect Results in Database
```bash
# Export as JSON
k6 run tests/load/load_test.js -o json=results.json

# Export as CSV
k6 run tests/load/load_test.js -o csv=results.csv

# Send to InfluxDB (for Grafana visualization)
k6 run tests/load/load_test.js \
  -o influxdb=http://influxdb:8086/k6
```

### Monitor During Test
1. Open Grafana: http://localhost:3030
2. Create dashboard with Prometheus queries:
   ```promql
   # API Response Time
   rate(http_request_duration_seconds_bucket[1m])
   
   # Error Rate
   rate(http_request_failed_total[1m])
   
   # Request Rate
   rate(http_requests_total[1m])
   ```
3. Watch metrics during test execution

---

## Performance Targets

### Eventify Platform SLOs

| SLO | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.5% | Monthly uptime |
| Error Rate | <1% | HTTP 5xx rate |
| Latency (p95) | <300ms | API response time |
| Latency (p99) | <500ms | API response time |
| Throughput | >100 req/s | Sustained at 50 VUs |
| Cache Hit Rate | >80% | Redis requests |

### Test Matrix

| Test Type | Load | Duration | Target Metric |
|-----------|------|----------|---------------|
| Baseline | 10 VUs | 5 min | Normal performance |
| Load | 50 VUs | 10 min | p95 < 300ms |
| Spike | 500 VUs | 1 min | No crashes |
| Stress | 100→500 VUs | 15 min | Graceful degradation |
| Soak | 50 VUs | 2 hours | Memory stable |

---

## Troubleshooting

### Test Fails Immediately
```bash
# Check if services are running
docker ps | grep eventify

# Verify API Gateway is responding
curl http://localhost:3000/health

# Run with verbose output
k6 run tests/load/load_test.js -v
```

### High Error Rate During Test
1. Check logs: `docker logs eventify-platform-api-gateway-1`
2. Monitor resources: `docker stats`
3. Verify database: `docker logs eventify-platform-mongodb-1`
4. Check rate limiting: `docker exec eventify-platform-redis-1 redis-cli`

### Memory Leak Suspected
```bash
# Run soak test and monitor memory
k6 run - <<'EOF'
import http from 'k6/http';

export const options = {
  vus: 20,
  duration: '30m',
};

export default function () {
  http.get('http://localhost:3000/api/events');
}
EOF

# During test, monitor Docker memory
docker stats eventify-platform-api-gateway-1
```

### Timeouts or Connection Issues
```bash
# Increase timeout
k6 run tests/load/load_test.js --http-debug=full

# Check network connectivity
docker exec eventify-platform-api-gateway-1 netstat -an | grep ESTABLISHED

# Verify DNS resolution
docker exec eventify-platform-api-gateway-1 nslookup mongodb
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Load Tests
on: [push, pull_request]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install k6
        run: |
          sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3232A
          echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      
      - name: Start Docker Compose
        run: docker-compose up -d
      
      - name: Wait for services
        run: sleep 30
      
      - name: Run load tests
        run: k6 run tests/load/load_test.js --summary-trend-stats="avg,p(95),p(99),max"
      
      - name: Stop services
        if: always()
        run: docker-compose down
```

---

## Best Practices

✅ **DO:**
- Start with baseline tests (low VUs)
- Gradually increase load
- Monitor both test and system metrics
- Run tests during off-peak times
- Document results and trends
- Compare results over time
- Test realistic user scenarios

❌ **DON'T:**
- Run max stress tests on production
- Ignore failed requests
- Test with invalid/unrealistic scenarios
- Skip ramp-up periods
- Run tests without monitoring
- Share confidential results publicly
- Use load tests for DDoS attacks (illegal)

---

## Next Steps

1. ✅ Run baseline test: `k6 run tests/load/load_test.js`
2. ✅ Check results and identify bottlenecks
3. ✅ Optimize slow endpoints
4. ✅ Run stress test to find breaking point
5. ✅ Configure autoscaling policies
6. ✅ Set up alerts for threshold violations
7. ✅ Schedule regular load tests in CI/CD

