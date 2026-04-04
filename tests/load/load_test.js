import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Health check
  let healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 200ms': (r) => r.timings.duration < 200,
  });

  // List events
  let eventsRes = http.get(`${BASE_URL}/api/events`);
  check(eventsRes, {
    'events status is 200': (r) => r.status === 200,
    'events response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Get stats
  let statsRes = http.get(`${BASE_URL}/api/events/stats`);
  check(statsRes, {
    'stats status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
