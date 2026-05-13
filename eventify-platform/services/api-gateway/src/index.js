const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const CircuitBreaker = require('opossum');
const { 
  client, 
  metricsMiddleware, 
  trackJWTVerification, 
  trackRateLimit 
} = require('./metrics');
const { requireOrganizer } = require('./middleware/rbac');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eventify_jwt_secret_key_2026';

app.use(cors());
app.use(helmet());
app.use(morgan('combined'));

// DO NOT use express.json() globally — it consumes the body stream
// and prevents http-proxy-middleware from forwarding POST bodies.

// Metrics middleware (must be early in the chain)
app.use(metricsMiddleware);

// Rate limiter - relaxed for load testing
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10000,  // Allow 10,000 requests per minute for load testing
  message: { error: 'Too many requests, please try again later.' },
  handler: (req, res) => {
    trackRateLimit('blocked');
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
});
app.use(limiter);

// JWT middleware — injects x-user-id header for downstream services and populates req for RBAC
const trackedJWTVerify = trackJWTVerification(jwt.verify);
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = trackedJWTVerify(token, JWT_SECRET);
      req.headers['x-user-id'] = decoded.id;
      req.headers['x-user-email'] = decoded.email;
      req.headers['x-user-role'] = decoded.role || 'user';
      // Populate req fields consumed by RBAC middleware
      req.userId = decoded.id;
      req.userRoles = [decoded.role || 'user'];
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
// Write operations require authentication (any logged-in user can create/edit their own events).
// Ownership enforcement (only creator can edit/delete) is handled inside the event-service.
// RBAC middleware (requireOrganizer / requireAdmin) is available in ./middleware/rbac for
// admin-only routes — demonstrated via the admin delete route below.
const eventProxy = createProxyMiddleware({
  target: process.env.EVENT_SERVICE_URL || 'http://localhost:5001',
  changeOrigin: true
});

// Admin-only: hard-delete any event regardless of ownership
app.delete('/api/admin/events/:id', requireOrganizer, createProxyMiddleware({
  target: process.env.EVENT_SERVICE_URL || 'http://localhost:5001',
  changeOrigin: true,
  pathRewrite: { '^/api/admin/events': '/api/events' }
}));

// All other event routes — auth forwarded, ownership checked downstream
app.use('/api/events', eventProxy);

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

// Circuit breaker for downstream event-service call (opossum)
const eventUrl = process.env.EVENT_SERVICE_URL || 'http://event-service:5001';

function fetchEventStats() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    http.get(`${eventUrl}/api/events/stats`, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from event-service')); }
      });
    }).on('error', reject);
  });
}

const statsBreaker = new CircuitBreaker(fetchEventStats, {
  timeout: 3000,          // call fails if event-service takes > 3s
  errorThresholdPercentage: 50, // open after 50% failures
  resetTimeout: 10000,    // try again after 10s
});

const STATS_FALLBACK = { total_events: 0, total_rsvps: 0, trending_events: [] };
statsBreaker.fallback(() => STATS_FALLBACK);

// Dashboard stats — aggregates from event service (with circuit breaker)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const data = await statsBreaker.fire();
    res.json(data);
  } catch (err) {
    res.json(STATS_FALLBACK);
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
  });
}

module.exports = app;
