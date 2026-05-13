const client = require('prom-client');

// Collect default metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// ===== 1. API-LEVEL METRICS =====

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

const httpActiveRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests',
  labelNames: ['method']
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'status_code', 'error_type']
});

// ===== 2. SERVICE-LEVEL INSTRUMENTATION =====

// Authentication operations
const authOperationDuration = new client.Histogram({
  name: 'auth_operation_duration_seconds',
  help: 'Authentication operation execution time',
  labelNames: ['operation', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

const authOperationTotal = new client.Counter({
  name: 'auth_operations_total',
  help: 'Total authentication operations',
  labelNames: ['operation', 'status']
});

const authOperationSuccessRate = new client.Gauge({
  name: 'auth_operation_success_rate',
  help: 'Authentication operation success rate (0-1)',
  labelNames: ['operation']
});

// User operations
const userOperationDuration = new client.Histogram({
  name: 'user_operation_duration_seconds',
  help: 'User operation execution time',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
});

const userOperationTotal = new client.Counter({
  name: 'user_operations_total',
  help: 'Total user operations',
  labelNames: ['operation', 'status']
});

// Active users gauge
const activeUsersGauge = new client.Gauge({
  name: 'active_users_total',
  help: 'Total number of active users in system'
});

// ===== 3. DEPENDENCY OBSERVABILITY =====

// PostgreSQL database operations
const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query execution time',
  labelNames: ['operation', 'table', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
});

const dbQueryErrors = new client.Counter({
  name: 'db_query_errors_total',
  help: 'Total database query errors',
  labelNames: ['operation', 'table', 'error_type']
});

const dbConnectionPoolSize = new client.Gauge({
  name: 'db_connection_pool_size',
  help: 'Database connection pool size',
  labelNames: ['status']
});

// Redis cache operations
const cacheOperationDuration = new client.Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Cache operation latency',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
});

const cacheOperationErrors = new client.Counter({
  name: 'cache_operation_errors_total',
  help: 'Total cache operation errors',
  labelNames: ['operation', 'error_type']
});

const cacheHitRate = new client.Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate (0-1)'
});

// ===== HELPER FUNCTIONS =====

function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  httpActiveRequests.inc({ method: req.method });
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    const statusCode = res.statusCode.toString();
    
    httpRequestCounter.inc({ method: req.method, route, status_code: statusCode });
    httpRequestDuration.observe({ method: req.method, route, status_code: statusCode }, duration);
    
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      httpErrorsTotal.inc({ method: req.method, route, status_code: statusCode, error_type: errorType });
    }
    
    httpActiveRequests.dec({ method: req.method });
  });
  
  next();
}

function trackAuthOperation(operation) {
  return async (fn) => {
    const end = authOperationDuration.startTimer({ operation, status: 'pending' });
    try {
      const result = await fn();
      end({ operation, status: 'success' });
      authOperationTotal.inc({ operation, status: 'success' });
      return result;
    } catch (error) {
      end({ operation, status: 'failure' });
      authOperationTotal.inc({ operation, status: 'failure' });
      throw error;
    }
  };
}

function trackUserOperation(operation) {
  return async (fn) => {
    const end = userOperationDuration.startTimer({ operation, status: 'pending' });
    try {
      const result = await fn();
      end({ operation, status: 'success' });
      userOperationTotal.inc({ operation, status: 'success' });
      return result;
    } catch (error) {
      end({ operation, status: 'failure' });
      userOperationTotal.inc({ operation, status: 'failure' });
      throw error;
    }
  };
}

function trackDBQuery(operation, table) {
  return async (fn) => {
    const end = dbQueryDuration.startTimer({ operation, table, status: 'pending' });
    try {
      const result = await fn();
      end({ operation, table, status: 'success' });
      return result;
    } catch (error) {
      end({ operation, table, status: 'failure' });
      dbQueryErrors.inc({ operation, table, error_type: error.name || 'Unknown' });
      throw error;
    }
  };
}

function trackCacheOperation(operation) {
  return async (fn) => {
    const end = cacheOperationDuration.startTimer({ operation, status: 'pending' });
    try {
      const result = await fn();
      end({ operation, status: 'success' });
      return result;
    } catch (error) {
      end({ operation, status: 'failure' });
      cacheOperationErrors.inc({ operation, error_type: error.name || 'Unknown' });
      throw error;
    }
  };
}

module.exports = {
  client,
  metricsMiddleware,
  trackAuthOperation,
  trackUserOperation,
  trackDBQuery,
  trackCacheOperation,
  activeUsersGauge,
  cacheHitRate,
  dbConnectionPoolSize,
  httpRequestCounter,
  httpRequestDuration,
  httpActiveRequests,
  httpErrorsTotal,
  authOperationDuration,
  authOperationTotal,
  authOperationSuccessRate,
  userOperationDuration,
  userOperationTotal,
  dbQueryDuration,
  dbQueryErrors,
  cacheOperationDuration,
  cacheOperationErrors
};
