const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eventify_jwt_secret_key_2026';

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

app.use(cors());
app.use(helmet());
app.use(morgan('combined'));

// DO NOT use express.json() globally — it consumes the body stream
// and prevents http-proxy-middleware from forwarding POST bodies.

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Count requests
app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestCounter.inc({ method: req.method, route: req.path, status: res.statusCode });
  });
  next();
});

// JWT middleware — injects x-user-id header for downstream services
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.headers['x-user-id'] = decoded.id;
      req.headers['x-user-email'] = decoded.email;
    } catch (err) {
      // invalid token — don't set headers, let downstream decide
    }
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// ===== PROXY ROUTES (must come BEFORE any express.json() usage) =====

// Proxy to User Service
app.use('/api/auth', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  changeOrigin: true
}));

app.use('/api/users', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  changeOrigin: true
}));

// Proxy to Event Service
app.use('/api/events', createProxyMiddleware({
  target: process.env.EVENT_SERVICE_URL || 'http://localhost:5001',
  changeOrigin: true
}));

// Proxy to Chat Service
app.use('/api/chat', createProxyMiddleware({
  target: process.env.CHAT_SERVICE_URL || 'http://localhost:3002',
  changeOrigin: true
}));

// Proxy notifications
app.use('/api/notifications', createProxyMiddleware({
  target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5002',
  changeOrigin: true
}));

// ===== NON-PROXIED ROUTES (can use express.json()) =====

// Dashboard stats — aggregates from event service
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const http = require('http');
    const eventUrl = process.env.EVENT_SERVICE_URL || 'http://event-service:5001';
    const url = `${eventUrl}/api/events/stats`;
    http.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { res.json(JSON.parse(data)); }
        catch(e) { res.json({ total_events: 0, total_rsvps: 0, trending_events: [] }); }
      });
    }).on('error', () => {
      res.json({ total_events: 0, total_rsvps: 0, trending_events: [] });
    });
  } catch (err) {
    res.json({ total_events: 0, total_rsvps: 0, trending_events: [] });
  }
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

module.exports = app;
