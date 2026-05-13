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

// Prevent redis from hanging open connections
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
