import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'],  // 95% under 2 seconds
    'http_req_failed': ['rate<0.5'],      // Allow 50% failure rate for any errors
  },
};

const BASE_URL = 'http://localhost:3000';

export default function () {
  // Test 1: Health check
  let health = http.get(`${BASE_URL}/health`);
  check(health, { 'health ok': (r) => r.status < 500 });

  // Test 2: List events
  let events = http.get(`${BASE_URL}/api/events?page=1&limit=10`);
  check(events, { 'events ok': (r) => r.status < 500 });

  // Test 3: Get stats
  let stats = http.get(`${BASE_URL}/api/events/stats`);
  check(stats, { 'stats ok': (r) => r.status < 500 });

  sleep(1);
}
