const client = require('prom-client');

client.collectDefaultMetrics({ prefix: 'chat_' });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (status >= 400)',
  labelNames: ['method', 'route', 'status_code'],
});

const httpActiveRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests in progress',
  labelNames: ['method'],
});

// Service-level metrics
const chatMessagesTotal = new client.Counter({
  name: 'chat_messages_total',
  help: 'Total chat messages saved',
  labelNames: ['status'],
});

const socketConnectionsActive = new client.Gauge({
  name: 'socket_connections_active',
  help: 'Number of active Socket.IO connections',
});

const mongoQueryDuration = new client.Histogram({
  name: 'chat_mongo_query_duration_seconds',
  help: 'MongoDB query duration for chat-service',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

const rabbitmqPublishTotal = new client.Counter({
  name: 'chat_rabbitmq_publish_total',
  help: 'Total RabbitMQ messages published by chat-service',
  labelNames: ['routing_key', 'status'],
});

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics' || req.path === '/health') return next();

  const start = process.hrtime.bigint();
  const method = req.method;
  httpActiveRequests.inc({ method });

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route ? req.route.path : req.path;
    const statusCode = String(res.statusCode);

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpActiveRequests.dec({ method });

    if (res.statusCode >= 400) {
      httpErrorsTotal.inc({ method, route, status_code: statusCode });
    }
  });

  next();
}

module.exports = {
  client,
  metricsMiddleware,
  chatMessagesTotal,
  socketConnectionsActive,
  mongoQueryDuration,
  rabbitmqPublishTotal,
};
