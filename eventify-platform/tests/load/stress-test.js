import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const eventCreationDuration = new Trend('event_creation_duration');

export const options = {
  stages: [
    // Ramp-up: Gradually increase load to find baseline
    { duration: '2m', target: 50 },      // Warm-up to 50 VUs
    { duration: '3m', target: 100 },     // Increase to 100 VUs
    
    // Stress: Push beyond normal capacity
    { duration: '3m', target: 200 },     // Stress level 1
    { duration: '3m', target: 300 },     // Stress level 2
    { duration: '3m', target: 500 },     // Stress level 3 - Breaking point
    
    // Spike: Sudden traffic surge
    { duration: '1m', target: 1000 },    // Spike to 1000 VUs
    { duration: '2m', target: 1000 },    // Sustain spike
    
    // Recovery: Gradual decrease
    { duration: '3m', target: 300 },     // Cool down
    { duration: '2m', target: 100 },     // Further cool down
    { duration: '1m', target: 0 },       // Complete shutdown
  ],
  
  thresholds: {
    // Stress test thresholds are more lenient than load tests
    'http_req_duration': ['p(95)<5000', 'p(99)<10000'],  // 5s p95, 10s p99
    'http_req_failed': ['rate<0.75'],                     // Allow up to 75% errors at peak stress
    'errors': ['rate<0.75'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Simulated user token (in real stress test, would authenticate)
const AUTH_TOKEN = __ENV.TEST_TOKEN || '';

export default function () {
  // Vary behavior to simulate realistic traffic
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% - Read heavy (list events)
    group('Heavy Read Load', function () {
      const page = Math.floor(Math.random() * 10) + 1;
      const res = http.get(`${BASE_URL}/api/events?page=${page}&limit=20`);
      
      const success = check(res, {
        'list events status 200': (r) => r.status === 200,
      });
      
      errorRate.add(!success);
      sleep(Math.random() * 2);  // Random sleep 0-2 seconds
    });
    
  } else if (scenario < 0.7) {
    // 30% - Stats and aggregations (expensive queries)
    group('Heavy Aggregation', function () {
      const res = http.get(`${BASE_URL}/api/events/stats`);
      
      const success = check(res, {
        'stats status 200': (r) => r.status === 200,
      });
      
      errorRate.add(!success);
      sleep(Math.random() * 1.5);
    });
    
  } else if (scenario < 0.85) {
    // 15% - Health checks (minimal load)
    group('Health Checks', function () {
      const res = http.get(`${BASE_URL}/health`);
      
      const success = check(res, {
        'health status 200': (r) => r.status === 200,
      });
      
      errorRate.add(!success);
      sleep(0.5);
    });
    
  } else {
    // 15% - Create event (write operation, most expensive)
    group('Write Operations', function () {
      const payload = JSON.stringify({
        title: `Stress Test Event ${Date.now()}-${Math.random()}`,
        description: 'Load testing event - will be cleaned up',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Zewail City of Science and Technology',
        category: 'conference',
        max_capacity: Math.floor(Math.random() * 500) + 50,
      });
      
      const params = {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': `stress-test-user-${__VU}`,  // Simulate different users
        },
      };
      
      if (AUTH_TOKEN) {
        params.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
      }
      
      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/api/events`, payload, params);
      const duration = Date.now() - startTime;
      
      eventCreationDuration.add(duration);
      
      const success = check(res, {
        'create event status 201 or 401': (r) => r.status === 201 || r.status === 401,
      });
      
      errorRate.add(!success);
      sleep(Math.random() * 3);  // Longer sleep after write
    });
  }

  // Occasionally, simulate a slow client
  if (Math.random() < 0.1) {
    sleep(Math.random() * 5);  // 10% of users are slow (0-5s delay)
  }
}

// Setup function runs once at the beginning
export function setup() {
  console.log('===================================');
  console.log('STRESS TEST STARTING');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Duration: ~25 minutes`);
  console.log(`Peak VUs: 1000`);
  console.log('===================================');
  
  // Verify service is accessible
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Service not healthy: ${res.status}`);
  }
  
  return { startTime: Date.now() };
}

// Teardown function runs once at the end
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('===================================');
  console.log('STRESS TEST COMPLETED');
  console.log(`Total duration: ${duration.toFixed(2)} seconds`);
  console.log('===================================');
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/stress-test-results.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const colors = options.enableColors || false;
  
  let output = '\n' + indent + '===== STRESS TEST SUMMARY =====\n\n';
  
  // Test duration
  output += indent + `Test Duration: ${(data.state.testRunDurationMs / 1000).toFixed(2)}s\n`;
  
  // HTTP metrics
  const metrics = data.metrics;
  output += indent + '\n--- HTTP Metrics ---\n';
  output += indent + `Requests: ${metrics.http_reqs.values.count}\n`;
  output += indent + `Request Rate: ${metrics.http_reqs.values.rate.toFixed(2)} req/s\n`;
  output += indent + `Failed Requests: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  
  if (metrics.http_req_duration) {
    output += indent + '\n--- Response Times ---\n';
    output += indent + `Min: ${metrics.http_req_duration.values.min.toFixed(2)}ms\n`;
    output += indent + `Avg: ${metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    output += indent + `Med: ${metrics.http_req_duration.values.med.toFixed(2)}ms\n`;
    output += indent + `p(90): ${metrics.http_req_duration.values['p(90)'].toFixed(2)}ms\n`;
    output += indent + `p(95): ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    output += indent + `p(99): ${metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
    output += indent + `Max: ${metrics.http_req_duration.values.max.toFixed(2)}ms\n`;
  }
  
  // Custom metrics
  if (metrics.errors) {
    output += indent + '\n--- Error Rate ---\n';
    output += indent + `Error Rate: ${(metrics.errors.values.rate * 100).toFixed(2)}%\n`;
  }
  
  if (metrics.event_creation_duration) {
    output += indent + '\n--- Event Creation Performance ---\n';
    output += indent + `Avg Duration: ${metrics.event_creation_duration.values.avg.toFixed(2)}ms\n`;
    output += indent + `p(95): ${metrics.event_creation_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  
  // Virtual Users
  output += indent + '\n--- Virtual Users ---\n';
  output += indent + `Peak VUs: ${metrics.vus_max.values.max}\n`;
  
  // Threshold results
  output += indent + '\n--- Threshold Results ---\n';
  const thresholds = data.thresholds || {};
  Object.keys(thresholds).forEach(name => {
    const threshold = thresholds[name];
    const passed = threshold.ok ? '✓ PASS' : '✗ FAIL';
    output += indent + `${name}: ${passed}\n`;
  });
  
  output += indent + '\n===== END SUMMARY =====\n';
  
  return output;
}

/*
STRESS TEST ANALYSIS CHECKLIST:

After running this stress test, analyze the following:

1. BREAKING POINT
   - At what VU level did error rates exceed 50%?
   - What was the maximum throughput achieved?
   - Which component failed first?

2. DEGRADATION PATTERN
   - Did latency increase gradually or suddenly?
   - Were all endpoints affected equally?
   - Did the system recover after load decreased?

3. RESOURCE BOTTLENECKS
   - Check Grafana: Which service hit 100% CPU first?
   - Check Grafana: Did memory usage spike?
   - Check Grafana: Did database connections max out?
   - Check Grafana: Did Redis hit memory limits?

4. ERROR PATTERNS
   - What HTTP status codes appeared at high load?
   - Were errors consistent or intermittent?
   - Did circuit breakers open?

5. RECOVERY BEHAVIOR
   - How long did it take to recover after load decreased?
   - Were there any lingering effects (memory leaks)?
   - Did all services return to normal state?

6. SCALABILITY INSIGHTS
   - Is the system CPU-bound, memory-bound, or I/O-bound?
   - Which component needs scaling first?
   - What is the estimated max capacity?

RUN COMMAND:
k6 run tests/load/stress-test.js --out json=stress-test-results.json

PREREQUISITES:
1. All services must be running (docker-compose up)
2. Database should be in clean state
3. Grafana dashboards should be open for monitoring
4. Alert rules should be enabled

EXPECTED OUTCOMES:
- System should handle 100-200 VUs without errors
- System may start showing degradation at 300-500 VUs
- System may fail partially or completely at 1000 VUs (spike)
- Error rate should be acceptable (<25%) up to breaking point
- System should recover fully after load decreases

PRODUCTION RECOMMENDATIONS:
Based on results, set capacity limits and auto-scaling triggers.
Example: If system handles 200 VUs comfortably, set alert at 150 VUs
         and auto-scale trigger at 180 VUs.
*/
