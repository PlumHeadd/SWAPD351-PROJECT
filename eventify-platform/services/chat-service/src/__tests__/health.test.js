// Mock prom-client before module import to prevent open handles
jest.mock('prom-client', () => {
  const noop = jest.fn();
  const metricMock = { inc: noop, dec: noop, observe: noop, set: noop, startTimer: jest.fn(() => noop), labels: jest.fn(() => ({ inc: noop, dec: noop, observe: noop, set: noop })) };
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

// Mock mongoose so connect() doesn't hang on unavailable localhost DB
jest.mock('mongoose', () => {
  const noop = jest.fn().mockResolvedValue(undefined);
  function Schema() {}
  Schema.prototype.index = jest.fn();
  const model = jest.fn(() => ({ find: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]), countDocuments: jest.fn().mockResolvedValue(0), save: jest.fn().mockResolvedValue({}) }));
  return { connect: noop, disconnect: noop, Schema, model };
});

// Mock amqplib so connectRabbit() fails fast and silently
jest.mock('amqplib', () => ({
  connect: jest.fn().mockRejectedValue(new Error('amqp mocked — not available in tests')),
}));

const request = require('supertest');
const { app } = require('../index');

describe('Chat Service', () => {
  it('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('chat-service');
  });
});
