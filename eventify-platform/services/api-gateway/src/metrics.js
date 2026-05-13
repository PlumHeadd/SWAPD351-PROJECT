const client = require('prom-client');

// Collect default metrics (CPU, memory, etc.)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// ===== 1. API-LEVEL METRICS =====

// Request count counter
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Request latency histogram (p50, p95, p99)
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// Active requests gauge (concurrency)
const httpActiveRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests',
  labelNames: ['method']
});

// Error tracking counter
const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'status_code', 'error_type']
});

// ===== 2. SERVICE-LEVEL INSTRUMENTATION =====

// JWT authentication operations
const jwtOperationDuration = new client.Histogram({
  name: 'jwt_operation_duration_seconds',
  help: 'JWT operation execution time',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
});

const jwtOperationTotal = new client.Counter({
  name: 'jwt_operations_total',
  help: 'Total JWT operations',
  labelNames: ['operation', 'status']
});

// Rate limiting operations
const rateLimitHits = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total rate limit hits',
  labelNames: ['action']
});

// ===== 3. DEPENDENCY OBSERVABILITY =====

// Downstream service call metrics
const downstreamRequestDuration = new client.Histogram({
  name: 'downstream_request_duration_seconds',
  help: 'Downstream service request latency',
  labelNames: ['service', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

const downstreamRequestErrors = new client.Counter({
  name: 'downstream_request_errors_total',
  help: 'Total downstream service request errors',
  labelNames: ['service', 'error_type']
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

// ===== MIDDLEWARE FUNCTIONS =====

/**
 * Middleware to track request metrics
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  // Increment active requests
  httpActiveRequests.inc({ method: req.method });
  
  // Track response
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    const statusCode = res.statusCode.toString();
    
    // Record metrics
    httpRequestCounter.inc({ method: req.method, route, status_code: statusCode });
    httpRequestDuration.observe({ method: req.method, route, status_code: statusCode }, duration);
    
    // Track errors (4xx, 5xx)
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      httpErrorsTotal.inc({ method: req.method, route, status_code: statusCode, error_type: errorType });
    }
    
    // Decrement active requests
    httpActiveRequests.dec({ method: req.method });
  });
  
  next();
}

/**
 * Track JWT verification operations
 */
function trackJWTOperation(operation, success) {
  const status = success ? 'success' : 'failure';
  jwtOperationTotal.inc({ operation, status });
}

/**
 * Track JWT verification with timing
 */
function trackJWTVerification(fn) {
  return (...args) => {
    const end = jwtOperationDuration.startTimer({ operation: 'verify', status: 'pending' });
    try {
      const result = fn(...args);
      end({ operation: 'verify', status: 'success' });
      trackJWTOperation('verify', true);
      return result;
    } catch (error) {
      end({ operation: 'verify', status: 'failure' });
      trackJWTOperation('verify', false);
      throw error;
    }
  };
}

/**
 * Track rate limit hits
 */
function trackRateLimit(action) {
  rateLimitHits.inc({ action });
}

module.exports = {
  client,
  metricsMiddleware,
  trackJWTOperation,
  trackJWTVerification,
  trackRateLimit,
  httpRequestCounter,
  httpRequestDuration,
  httpActiveRequests,
  httpErrorsTotal,
  jwtOperationDuration,
  jwtOperationTotal,
  rateLimitHits,
  downstreamRequestDuration,
  downstreamRequestErrors,
  cacheOperationDuration,
  cacheOperationErrors
};
