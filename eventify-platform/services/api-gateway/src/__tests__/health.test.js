// Mock prom-client before any module imports to prevent registry conflicts and open handles
jest.mock('prom-client', () => {
  const noop = jest.fn();
  const labelsMock = { inc: noop, observe: noop, set: noop, dec: noop };
  const metricMock = { inc: noop, observe: noop, set: noop, dec: noop, startTimer: jest.fn(() => noop), labels: jest.fn(() => labelsMock) };
  return {
    collectDefaultMetrics: noop,
    register: {
      contentType: 'text/plain',
      metrics: jest.fn().mockResolvedValue('# mocked'),
      registerMetric: noop,
      getSingleMetric: jest.fn().mockReturnValue(undefined),
    },
    Counter: jest.fn(() => metricMock),
    Histogram: jest.fn(() => metricMock),
    Gauge: jest.fn(() => metricMock),
    Summary: jest.fn(() => metricMock),
  };
});

// Mock redis so the rate-limiter store doesn't open connections
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    isReady: false,
    isOpen: false,
  })),
}));

// Mock opossum circuit breaker to avoid real HTTP calls in tests
jest.mock('opossum', () => {
  return jest.fn().mockImplementation(() => ({
    fire: jest.fn().mockResolvedValue({ total_events: 0, total_rsvps: 0, trending_events: [] }),
    fallback: jest.fn(),
    on: jest.fn(),
  }));
});

const request = require('supertest');
const app = require('../index');

describe('API Gateway', () => {
  it('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('api-gateway');
  });

  it('GET /health includes timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.body.timestamp).toBeDefined();
  });
});
