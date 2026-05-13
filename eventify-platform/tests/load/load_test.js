import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
    'http_req_failed': ['rate<0.5'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {

  group('Health Checks', function () {
    let res = http.get(`${BASE_URL}/health`);
    
    check(res, {
      'health status is 200': (r) => r.status === 200,
    });
    
    sleep(0.5);
  });

  group('Event Service - Read Operations', function () {
    let page = Math.floor(Math.random() * 5) + 1;
    let eventsRes = http.get(`${BASE_URL}/api/events?page=${page}&limit=20`);

    check(eventsRes, {
      'list events status 200': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  group('Event Service - Stats', function () {
    let statsRes = http.get(`${BASE_URL}/api/events/stats`);

    check(statsRes, {
      'stats status 200': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  group('Concurrent Reads', function () {
    let responses = http.batch([
      ['GET', `${BASE_URL}/api/events?page=1`],
      ['GET', `${BASE_URL}/api/events?page=2`],
      ['GET', `${BASE_URL}/api/events?page=3`],
      ['GET', `${BASE_URL}/api/events/stats`],
    ]);

    responses.forEach((res) => {
      check(res, {
        'batch status 200': (r) => r.status === 200,
      });
    });

    sleep(1);
  });
}
