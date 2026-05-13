// Prevent mongoose from opening real connections during tests
jest.mock('mongoose', () => {
  const Schema = function () {};
  Schema.prototype.index = function () { return this; };
  const model = jest.fn(() => ({}));
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    Schema,
    model,
  };
});

// Prevent amqplib from opening real connections during tests
jest.mock('amqplib', () => ({
  connect: jest.fn().mockRejectedValue(new Error('amqp mocked')),
}));

// Prevent prom-client from clashing across test runs
jest.mock('prom-client', () => {
  const register = {
    contentType: 'text/plain',
    metrics: jest.fn().mockResolvedValue('# mocked metrics'),
    registerMetric: jest.fn(),
    getMetricsAsJSON: jest.fn().mockReturnValue([]),
    getSingleMetric: jest.fn().mockReturnValue(undefined),
  };
  return {
    collectDefaultMetrics: jest.fn(),
    Registry: jest.fn().mockReturnValue(register),
    register,
    Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn(), labels: jest.fn().mockReturnThis() })),
    Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn(), startTimer: jest.fn().mockReturnValue(jest.fn()), labels: jest.fn().mockReturnThis() })),
    Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn(), inc: jest.fn(), dec: jest.fn(), labels: jest.fn().mockReturnThis() })),
    Summary: jest.fn().mockImplementation(() => ({ observe: jest.fn(), labels: jest.fn().mockReturnThis() })),
  };
});
