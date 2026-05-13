/**
 * Observability Demo Test Scenario
 * 
 * This script demonstrates the observability features by simulating:
 * 1. Slow responses (increased latency)
 * 2. Random failures (errors)
 * 3. Increased load (high request rate)
 * 
 * Expected Grafana observations:
 * - Latency ↑ (p95, p99 increase)
 * - Error rate ↑ (4xx, 5xx responses increase)
 * - Request rate ↑ (requests/second increase)
 * - Active requests ↑ (concurrency increase)
 * - Dependency metrics show impact (DB, cache, message queue)
 * 
 * Run with: k6 run tests/observability/demo-scenario.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');
const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');

// Test configuration
export const options = {
  stages: [
    // Phase 1: Warm up - Normal load
    { duration: '30s', target: 10 },
    
    // Phase 2: Increased Load - Ramp up to high load
    { duration: '1m', target: 50 },
    
    // Phase 3: Spike Load - Sudden spike to very high load
    { duration: '30s', target: 200 },
    
    // Phase 4: Sustained High Load - Maintain high load
    { duration: '2m', target: 150 },
    
    // Phase 5: Recovery - Ramp down
    { duration: '1m', target: 20 },
    
    // Phase 6: Cool down
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // Expected to fail during spike
    'errors': ['rate<0.1'], // Expected to fail with simulated errors
  }
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

// Mock JWT token for testing (would be invalid, but tests the path)
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4OTAiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJuYW1lIjoiVGVzdCBVc2VyIn0.fake';

/**
 * Scenario: Test various endpoints with different load patterns
 */
export default function () {
  const scenario = Math.random();
  
  // Health checks (10% of traffic)
  if (scenario < 0.1) {
    testHealthEndpoints();
  }
  // List events (30% of traffic)
  else if (scenario < 0.4) {
    testListEvents();
  }
  // Get specific event (25% of traffic)
  else if (scenario < 0.65) {
    testGetEvent();
  }
  // Create event (15% of traffic - heavier operation)
  else if (scenario < 0.8) {
    testCreateEvent();
  }
  // RSVP to event (10% of traffic - heavier operation)
  else if (scenario < 0.9) {
    testRSVPEvent();
  }
  // Intentional failures (10% of traffic - to demonstrate error tracking)
  else {
    testIntentionalFailures();
  }
  
  // Add variable sleep to simulate realistic user behavior
  sleep(Math.random() * 2 + 0.5);
}

function testHealthEndpoints() {
  const endpoints = [
    `${BASE_URL}/health`,
  ];
  
  endpoints.forEach(endpoint => {
    const res = http.get(endpoint);
    const success = check(res, {
      'health check status is 200': (r) => r.status === 200,
    });
    
    trackMetrics(res, success);
  });
}

function testListEvents() {
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  // Test with various query parameters
  const queries = [
    '',
    '?page=1&limit=10',
    '?page=2&limit=20',
    '?category=tech',
    '?search=conference',
  ];
  
  const query = queries[Math.floor(Math.random() * queries.length)];
  const res = http.get(`${BASE_URL}/api/events${query}`, params);
  
  const success = check(res, {
    'list events status is 200': (r) => r.status === 200,
    'response has events array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && Array.isArray(body.events);
      } catch (e) {
        return false;
      }
    },
  });
  
  trackMetrics(res, success);
}

function testGetEvent() {
  // Generate random event ID (some will be invalid - simulates real-world behavior)
  const eventId = Math.random() < 0.7 
    ? `60d5ec49f1d2c3a4b5e6f7${Math.floor(Math.random() * 10)}` // Valid-looking ID
    : 'invalid-id'; // Invalid ID to test error handling
  
  const res = http.get(`${BASE_URL}/api/events/${eventId}`);
  
  const success = check(res, {
    'get event status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  trackMetrics(res, success);
}

function testCreateEvent() {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MOCK_TOKEN}`,
    },
  };
  
  const payload = JSON.stringify({
    title: `Load Test Event ${Date.now()}`,
    description: 'This is a load test event to demonstrate observability',
    date: new Date(Date.now() + 86400000).toISOString(),
    location: 'Test Location',
    category: 'tech',
    max_capacity: 100,
  });
  
  const res = http.post(`${BASE_URL}/api/events`, payload, params);
  
  const success = check(res, {
    'create event status is 201 or 401': (r) => r.status === 201 || r.status === 401, // 401 expected with mock token
  });
  
  trackMetrics(res, success);
}

function testRSVPEvent() {
  const eventId = `60d5ec49f1d2c3a4b5e6f7${Math.floor(Math.random() * 10)}`;
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MOCK_TOKEN}`,
    },
  };
  
  const res = http.post(`${BASE_URL}/api/events/${eventId}/rsvp`, null, params);
  
  const success = check(res, {
    'rsvp status is 201, 400, 401, or 404': (r) => 
      r.status === 201 || r.status === 400 || r.status === 401 || r.status === 404,
  });
  
  trackMetrics(res, success);
}

function testIntentionalFailures() {
  // Test endpoints that will cause errors (to demonstrate error tracking)
  const errorEndpoints = [
    `${BASE_URL}/api/events/invalid-id-format`,
    `${BASE_URL}/api/nonexistent-endpoint`,
    `${BASE_URL}/api/events//double-slash`,
  ];
  
  const endpoint = errorEndpoints[Math.floor(Math.random() * errorEndpoints.length)];
  const res = http.get(endpoint);
  
  // These are expected to fail
  check(res, {
    'intentional error endpoint returns 400 or 404': (r) => r.status >= 400,
  });
  
  trackMetrics(res, false); // Mark as failed
}

function trackMetrics(res, success) {
  if (success) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
  }
  
  errorRate.add(!success);
  requestDuration.add(res.timings.duration);
}

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('🚀 Starting Observability Demo Scenario');
  console.log('📊 Monitor Grafana dashboard at http://localhost:3001');
  console.log('📈 Expected observations:');
  console.log('  - Phase 1 (0-30s): Normal baseline metrics');
  console.log('  - Phase 2 (30s-1.5m): Increased load, latency starts to rise');
  console.log('  - Phase 3 (1.5m-2m): Spike load, latency ↑↑, some errors');
  console.log('  - Phase 4 (2m-4m): Sustained high load, system under stress');
  console.log('  - Phase 5 (4m-5m): Recovery, metrics normalize');
  console.log('  - Phase 6 (5m-5.5m): Cool down, return to baseline');
  console.log('');
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  console.log('');
  console.log('✅ Observability Demo Scenario Complete');
  console.log('📊 Review Grafana dashboards for:');
  console.log('  ✓ Request rate increase during load phases');
  console.log('  ✓ Error rate spike during intentional failures');
  console.log('  ✓ Latency (p95, p99) increase under load');
  console.log('  ✓ Active requests (concurrency) during spike');
  console.log('  ✓ Service-level metrics (event operations, auth, etc.)');
  console.log('  ✓ Dependency metrics (MongoDB, Redis, RabbitMQ latency)');
  console.log('  ✓ Cache hit rate variations');
  console.log('  ✓ System resource usage (CPU, memory)');
}
