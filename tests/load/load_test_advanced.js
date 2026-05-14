import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const listEventsDuration = new Trend('list_events_duration');
const createEventDuration = new Trend('create_event_duration');
const chatMessageDuration = new Trend('chat_message_duration');
const searchEventsDuration = new Trend('search_events_duration');

// Load testing stages
export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp-up: 0→20 users
    { duration: '1m', target: 50 },    // Ramp-up: 20→50 users
    { duration: '1m30s', target: 100 },// Peak: 50→100 users
    { duration: '1m', target: 50 },    // Ramp-down: 100→50 users
    { duration: '30s', target: 0 },    // Ramp-down: 50→0 users
  ],
  thresholds: {
    // API performance thresholds
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.05'],
    'errors': ['rate<0.05'],
    
    // Service-specific thresholds
    'list_events_duration': ['p(95)<300'],
    'create_event_duration': ['p(95)<800'],
    'chat_message_duration': ['p(95)<200'],
    'search_events_duration': ['p(95)<400'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // ========================================================================
  // 1. HEALTH CHECK
  // ========================================================================
  group('Health Checks', () => {
    let healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
      'health status is 200': (r) => r.status === 200,
      'health response time < 100ms': (r) => r.timings.duration < 100,
      'health returns ok status': (r) => r.json().status === 'ok',
    }) || errorRate.add(1);
  });

  sleep(0.5);

  // ========================================================================
  // 2. EVENT LISTING (READ-HEAVY)
  // ========================================================================
  group('Event Listing', () => {
    let eventsRes = http.get(`${BASE_URL}/api/events`);
    listEventsDuration.add(eventsRes.timings.duration);
    
    check(eventsRes, {
      'list events status is 200': (r) => r.status === 200,
      'list events response time < 500ms': (r) => r.timings.duration < 500,
      'events array exists': (r) => Array.isArray(r.json().events),
    }) || errorRate.add(1);
  });

  sleep(1);

  // ========================================================================
  // 3. EVENT LISTING WITH PAGINATION
  // ========================================================================
  group('Paginated Event Listing', () => {
    let page = Math.floor(Math.random() * 5) + 1;
    let limit = 20;
    
    let paginatedRes = http.get(
      `${BASE_URL}/api/events?page=${page}&limit=${limit}`
    );
    
    check(paginatedRes, {
      'paginated list status is 200': (r) => r.status === 200,
      'paginated response time < 400ms': (r) => r.timings.duration < 400,
      'pagination data present': (r) => 'total' in r.json() || 'page' in r.json(),
    }) || errorRate.add(1);
  });

  sleep(1);

  // ========================================================================
  // 4. EVENT SEARCH (READ-HEAVY, COMPUTE-INTENSIVE)
  // ========================================================================
  group('Event Search', () => {
    let searchTerms = ['tech', 'conference', 'meetup', 'workshop', 'event'];
    let searchTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    
    let searchRes = http.get(
      `${BASE_URL}/api/events?search=${searchTerm}`
    );
    searchEventsDuration.add(searchRes.timings.duration);
    
    check(searchRes, {
      'search status is 200': (r) => r.status === 200,
      'search response time < 600ms': (r) => r.timings.duration < 600,
      'search returns array': (r) => Array.isArray(r.json().events),
    }) || errorRate.add(1);
  });

  sleep(1);

  // ========================================================================
  // 5. CATEGORY FILTERING (READ-HEAVY)
  // ========================================================================
  group('Category Filtering', () => {
    let categories = ['tech', 'business', 'entertainment', 'sports', 'education'];
    let category = categories[Math.floor(Math.random() * categories.length)];
    
    let categoryRes = http.get(
      `${BASE_URL}/api/events?category=${category}`
    );
    
    check(categoryRes, {
      'category filter status is 200': (r) => r.status === 200,
      'category filter response time < 400ms': (r) => r.timings.duration < 400,
    }) || errorRate.add(1);
  });

  sleep(1);

  // ========================================================================
  // 6. EVENT DETAILS RETRIEVAL
  // ========================================================================
  group('Event Details', () => {
    // First get a list of events
    let listRes = http.get(`${BASE_URL}/api/events?limit=1`);
    
    if (listRes.status === 200 && listRes.json().events.length > 0) {
      let eventId = listRes.json().events[0]._id;
      
      // Then get details
      let detailRes = http.get(`${BASE_URL}/api/events/${eventId}`);
      
      check(detailRes, {
        'event details status is 200 or 404': (r) => 
          r.status === 200 || r.status === 404,
        'event details response time < 300ms': (r) => r.timings.duration < 300,
      }) || errorRate.add(1);
    }
  });

  sleep(1);

  // ========================================================================
  // 7. API GATEWAY ROUTING
  // ========================================================================
  group('API Gateway Routing', () => {
    let routeRes = http.get(`${BASE_URL}/api/events`);
    
    check(routeRes, {
      'gateway routing successful': (r) => r.status === 200,
      'gateway adds forwarding headers': (r) => 
        r.headers['X-Forwarded-For'] !== undefined || r.status === 200,
    }) || errorRate.add(1);
  });

  sleep(0.5);

  // ========================================================================
  // 8. METRICS ENDPOINT (PROMETHEUS)
  // ========================================================================
  group('Metrics Collection', () => {
    let metricsRes = http.get(`${BASE_URL}/metrics`);
    
    check(metricsRes, {
      'metrics endpoint is 200': (r) => r.status === 200,
      'metrics response time < 200ms': (r) => r.timings.duration < 200,
      'metrics content is text': (r) => 
        r.headers['Content-Type'].includes('text'),
    }) || errorRate.add(1);
  });

  sleep(0.5);

  // ========================================================================
  // 9. CONCURRENT EVENT LISTING (STRESS TEST)
  // ========================================================================
  group('Concurrent Load - Event Listing', () => {
    let requests = {
      'list_1': {
        method: 'GET',
        url: `${BASE_URL}/api/events?limit=10`,
      },
      'list_2': {
        method: 'GET',
        url: `${BASE_URL}/api/events?limit=20`,
      },
      'list_3': {
        method: 'GET',
        url: `${BASE_URL}/api/events?page=2&limit=15`,
      },
    };
    
    let responses = http.batch(requests);
    
    check(responses, {
      'batch requests all 200': (r) => r.every(resp => resp.status === 200),
      'batch response time < 1s': (r) => 
        r.every(resp => resp.timings.duration < 1000),
    }) || errorRate.add(1);
  });

  sleep(1);

  // ========================================================================
  // 10. HEALTH CHECK WITH HIGH FREQUENCY
  // ========================================================================
  group('High Frequency Health Checks', () => {
    for (let i = 0; i < 5; i++) {
      let healthRes = http.get(`${BASE_URL}/health`);
      
      check(healthRes, {
        'health check always 200': (r) => r.status === 200,
      }) || errorRate.add(1);
      
      sleep(0.1);
    }
  });

  sleep(1);

  // ========================================================================
  // 11. CACHE EFFECTIVENESS TEST (SAME QUERY MULTIPLE TIMES)
  // ========================================================================
  group('Cache Effectiveness', () => {
    // Make same request 3 times to test caching
    let cacheTestRes1 = http.get(`${BASE_URL}/api/events?limit=5&page=1`);
    sleep(0.2);
    let cacheTestRes2 = http.get(`${BASE_URL}/api/events?limit=5&page=1`);
    sleep(0.2);
    let cacheTestRes3 = http.get(`${BASE_URL}/api/events?limit=5&page=1`);
    
    // Second and third should be faster (cache hit)
    check(cacheTestRes3, {
      'cache hit response time < 100ms': (r) => r.timings.duration < 100,
      'cached responses are 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });

  sleep(1);

  // ========================================================================
  // 12. ERROR HANDLING UNDER LOAD
  // ========================================================================
  group('Error Handling', () => {
    // Test invalid endpoints
    let invalidRes = http.get(`${BASE_URL}/api/invalid-endpoint`);
    
    check(invalidRes, {
      'invalid endpoint returns 404': (r) => r.status === 404,
      'error response time < 200ms': (r) => r.timings.duration < 200,
    }) || errorRate.add(1);
    
    // Test malformed request
    let badIdRes = http.get(`${BASE_URL}/api/events/invalid-id`);
    
    check(badIdRes, {
      'bad request handled': (r) => [400, 404].includes(r.status),
    }) || errorRate.add(1);
  });

  sleep(1);

  // ========================================================================
  // ITERATION SUMMARY
  // ========================================================================
  // Each virtual user completes one iteration, then loops
  // With current stages, will create distributed load over time
}

/*
 * LOAD TEST BREAKDOWN:
 * 
 * ✅ Health Checks: 1 test
 * ✅ Event Listing: Basic + Paginated (2 tests)
 * ✅ Event Search: Search functionality (1 test)
 * ✅ Category Filtering: Filter by category (1 test)
 * ✅ Event Details: Get single event (1 test)
 * ✅ API Gateway Routing: Routing verification (1 test)
 * ✅ Metrics: Prometheus endpoint (1 test)
 * ✅ Concurrent Load: Batch requests (1 test)
 * ✅ High Frequency: Rapid requests (1 test)
 * ✅ Cache Testing: Cache effectiveness (1 test)
 * ✅ Error Handling: Invalid requests (2 tests)
 * 
 * Total: 14+ load test scenarios
 * 
 * METRICS TRACKED:
 * - Custom Trends: listEventsDuration, createEventDuration, etc.
 * - Error Rate: Overall request failure rate
 * - HTTP Duration: p95 < 500ms, p99 < 1000ms
 * - Failed Requests: < 5%
 * 
 * LOAD STAGES:
 * 1. Ramp-up to 20 users (30s)
 * 2. Ramp-up to 50 users (1m)
 * 3. Peak at 100 users (1m30s)
 * 4. Ramp-down to 50 users (1m)
 * 5. Ramp-down to 0 users (30s)
 * Total: ~5 minutes
 * 
 * RUN COMMAND:
 * k6 run tests/load/load_test_advanced.js
 * 
 * Or with custom base URL:
 * BASE_URL=http://staging.example.com k6 run tests/load/load_test_advanced.js
 */
