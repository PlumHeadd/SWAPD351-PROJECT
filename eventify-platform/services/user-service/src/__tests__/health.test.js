// Mock prom-client before any imports to prevent registry conflicts
jest.mock('prom-client', () => {
  const noop = jest.fn();
  const metricMock = { inc: noop, observe: noop, set: noop, dec: noop, startTimer: jest.fn(() => noop), labels: jest.fn(() => ({ inc: noop, observe: noop, set: noop, dec: noop })) };
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

// Mock Sequelize so it doesn't attempt a real Postgres connection
jest.mock('sequelize', () => {
  const fakeModel = {
    findByPk: jest.fn().mockResolvedValue(null),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'test-id', email: 'test@test.com', name: 'Test' }),
  };
  const Sequelize = jest.fn().mockImplementation(() => ({
    define: jest.fn().mockReturnValue(fakeModel),
    authenticate: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue(undefined),
  }));
  Sequelize.DataTypes = {
    UUID: 'UUID', UUIDV4: 'UUIDV4', STRING: 'STRING', TEXT: 'TEXT',
  };
  return { Sequelize, DataTypes: Sequelize.DataTypes };
});

// Mock Redis so initRedis() doesn't hang
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

const request = require('supertest');
const app = require('../index');

describe('User Service', () => {
  it('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('user-service');
  });
});
