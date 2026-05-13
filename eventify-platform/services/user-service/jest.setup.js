// Prevent Sequelize from attempting real DB connections
jest.mock('sequelize', () => {
  const mSequelize = {
    define: jest.fn(() => ({
      findByPk: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    })),
    authenticate: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue(undefined),
  };
  const Ctor = jest.fn().mockImplementation(() => mSequelize);
  Ctor.DataTypes = {
    UUID: 'UUID', UUIDV4: 'UUIDV4', STRING: 'STRING', TEXT: 'TEXT',
  };
  return Ctor;
});

// Prevent redis from opening real connections
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    isReady: false,
  })),
}));

// Prevent prom-client clashes
jest.mock('./src/metrics', () => ({
  client: {
    register: {
      contentType: 'text/plain',
      metrics: jest.fn().mockResolvedValue('# mocked'),
    },
  },
  metricsMiddleware: (req, res, next) => next(),
  trackAuthOperation: () => fn => fn(),
  trackUserOperation: () => fn => fn(),
  trackDBQuery: () => () => fn => fn(),
  trackCacheOperation: () => fn => fn(),
  activeUsersGauge: { set: jest.fn() },
  cacheHitRate: { observe: jest.fn() },
}));
