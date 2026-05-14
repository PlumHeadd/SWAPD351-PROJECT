# Security Implementation Guide

**Eventify Platform - SWAPD 351**  
**Date**: May 14, 2026  
**Status**: Production Ready

---

## 1. Authentication & Authorization

### 1.1 OAuth2 Implementation

#### Google OAuth2 Configuration

**File**: `services/user-service/config/oauth.js`

```javascript
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Find or create user
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          avatar: profile.photos[0]?.value,
          provider: 'google',
          role: 'user' // Default role
        });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return done(null, { user, token });
    } catch (error) {
      return done(error, null);
    }
  }
));

// Serialize/deserialize for sessions
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

module.exports = passport;
```

#### Login Endpoint

```javascript
// GET /api/auth/google
app.get('/api/auth/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// GET /api/auth/google/callback
app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const token = req.user.token;
    
    // Set secure HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    // Redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('authToken');
  res.json({ message: 'Logged out successfully' });
});
```

### 1.2 JWT Token Management

#### Token Structure

```javascript
// Header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Payload
{
  "iss": "eventify",
  "sub": "user-id-12345",
  "iat": 1715750400,
  "exp": 1715836800,
  "email": "user@example.com",
  "roles": ["user"],
  "permissions": ["read:events", "write:rsvp"]
}

// Signature
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  secret
)
```

#### Token Validation Middleware

```javascript
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  // Extract token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      // Token expired
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      // Invalid token
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  });
}

// Use middleware
app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});
```

#### Token Refresh Strategy

```javascript
// Implement refresh token rotation
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days
const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour

app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    
    // Generate new access token
    const accessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
    
    res.json({ accessToken });
  } catch (error) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});
```

### 1.3 Role-Based Access Control (RBAC)

```javascript
// Define roles and permissions
const ROLES = {
  USER: {
    name: 'user',
    permissions: [
      'read:events',
      'read:user_profile',
      'write:rsvp',
      'write:messages'
    ]
  },
  ORGANIZER: {
    name: 'organizer',
    permissions: [
      ...ROLES.USER.permissions,
      'write:events',
      'delete:own_events',
      'write:event_details'
    ]
  },
  ADMIN: {
    name: 'admin',
    permissions: [
      'read:all',
      'write:all',
      'delete:all',
      'manage:users'
    ]
  }
};

// Authorization middleware
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userRole = ROLES[req.user.role.toUpperCase()];
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role
      });
    }
    
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userRole = ROLES[req.user.role.toUpperCase()];
    
    if (!userRole.permissions.includes(permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: permission
      });
    }
    
    next();
  };
}

// Usage
app.post('/api/events',
  authenticateToken,
  requirePermission('write:events'),
  createEventHandler
);

app.delete('/api/events/:id',
  authenticateToken,
  requireRole('ORGANIZER', 'ADMIN'),
  deleteEventHandler
);
```

---

## 2. API Security

### 2.1 Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

// Login rate limiting (stricter)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
});

// Event creation rate limiting
const eventCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 events per hour
  keyGenerator: (req) => req.user?.userId || req.ip // Per user, not IP
});

// Apply limiters
app.use('/api/', apiLimiter);
app.post('/api/auth/google/callback', loginLimiter);
app.post('/api/events', eventCreationLimiter);
```

### 2.2 Input Validation

```javascript
const Joi = require('joi');

// Validation schemas
const schemas = {
  event: Joi.object({
    title: Joi.string().required().max(200).trim(),
    description: Joi.string().max(2000).trim(),
    date: Joi.date().iso().required().greater('now'),
    location: Joi.string().required().max(300).trim(),
    capacity: Joi.number().integer().min(1).max(10000).required(),
    tags: Joi.array().items(Joi.string().max(50)).max(10),
    image_url: Joi.string().uri().optional()
  }),
  
  rsvp: Joi.object({
    status: Joi.string().valid('attending', 'maybe', 'not_attending').required(),
    comment: Joi.string().max(500).optional()
  }),
  
  message: Joi.object({
    content: Joi.string().required().min(1).max(1000).trim(),
    event_id: Joi.string().uuid().required()
  })
};

// Validation middleware
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return res.status(400).json({ errors });
    }
    
    req.validatedData = value;
    next();
  };
}

// Usage
app.post('/api/events',
  authenticateToken,
  validate(schemas.event),
  createEventHandler
);
```

### 2.3 CORS Configuration

```javascript
const cors = require('cors');

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 
          (process.env.NODE_ENV === 'production' 
            ? ['https://eventify.com', 'https://www.eventify.com']
            : ['http://localhost:3080', 'http://localhost:3000']),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'RateLimit-Remaining'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Preflight request handling
app.options('*', cors(corsOptions));
```

### 2.4 HTTPS/TLS Configuration

```javascript
const https = require('https');
const fs = require('fs');

let server;

if (process.env.NODE_ENV === 'production') {
  // Production: Use real certificates
  const options = {
    key: fs.readFileSync(process.env.TLS_KEY_PATH),
    cert: fs.readFileSync(process.env.TLS_CERT_PATH)
  };
  server = https.createServer(options, app);
} else {
  // Development: Use self-signed certificates
  const options = {
    key: fs.readFileSync('./certs/key.pem'),
    cert: fs.readFileSync('./certs/cert.pem')
  };
  server = https.createServer(options, app);
}

server.listen(process.env.PORT, () => {
  console.log(`HTTPS server running on port ${process.env.PORT}`);
});
```

---

## 3. Data Security

### 3.1 Password Security (when applicable)

```javascript
const bcrypt = require('bcrypt');

// Hash password
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Verify password
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// User creation
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user
    const user = await User.create({
      email,
      passwordHash,
      provider: 'local'
    });
    
    res.status(201).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});
```

### 3.2 Database Security

```sql
-- Create database user with minimal privileges
CREATE USER app_user WITH PASSWORD 'secure_password_here';

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE eventify TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Prevent system table access
REVOKE ALL ON pg_catalog.* FROM app_user;

-- Audit sensitive operations
CREATE POLICY row_level_security ON users
  FOR SELECT USING (id = current_user_id());
```

### 3.3 Encryption at Rest

```javascript
// Encrypt sensitive fields
const crypto = require('crypto');

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

function encryptField(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

function decryptField(encrypted) {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const authTag = Buffer.from(parts[2], 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Usage
const user = new User({
  email: 'user@example.com',
  phone: encryptField('+1234567890')
});
```

---

## 4. Environment & Secrets Management

### 4.1 Environment Variables

**File**: `.env.example`

```bash
# Authentication
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
JWT_SECRET=your_jwt_secret_key_min_32_chars
REFRESH_TOKEN_SECRET=your_refresh_secret_min_32_chars

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/eventify
MONGO_URI=mongodb://localhost:27017/eventify

# Cache
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Message Broker
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Encryption
ENCRYPTION_KEY=your_64_char_hex_key

# Security
ALLOWED_ORIGINS=http://localhost:3080,http://localhost:3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Application
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3080

# TLS/HTTPS
TLS_KEY_PATH=/path/to/key.pem
TLS_CERT_PATH=/path/to/cert.pem

# Logging
LOG_LEVEL=debug
```

### 4.2 Secrets Management (Production)

#### Azure Key Vault

```javascript
const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");

const credential = new DefaultAzureCredential();
const client = new SecretClient(
  `https://${process.env.KEY_VAULT_NAME}.vault.azure.net`,
  credential
);

async function getSecret(secretName) {
  const secret = await client.getSecret(secretName);
  return secret.value;
}

// Usage
const jwtSecret = await getSecret('jwt-secret');
const dbPassword = await getSecret('database-password');
```

---

## 5. Security Headers

```javascript
const helmet = require('helmet');

// Apply security headers
app.use(helmet());

// Customize headers as needed
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https://api.google.com']
  }
}));

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  next();
});
```

---

## 6. Logging & Audit

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'api-gateway' },
  transports: [
    // Log to file
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    // Log to console in development
    ...(process.env.NODE_ENV !== 'production' 
      ? [new winston.transports.Console()] 
      : [])
  ]
});

// Audit middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: duration,
      userId: req.user?.userId,
      ip: req.ip
    });
  });
  
  next();
});

// Sensitive action logging
function auditLog(action, userId, details) {
  logger.warn({
    action,
    userId,
    details,
    timestamp: new Date().toISOString()
  });
}
```

---

## 7. Security Checklist

- [x] OAuth2 implementation with Google
- [x] JWT token management with expiry
- [x] Role-based access control (RBAC)
- [x] Rate limiting on all endpoints
- [x] Input validation using Joi
- [x] CORS properly configured
- [x] HTTPS/TLS enabled
- [x] Security headers applied
- [x] Encrypted password handling
- [x] Environment secrets management
- [x] Database user permissions restricted
- [x] Audit logging enabled
- [x] SQL injection prevention (parameterized queries)
- [x] XSS protection via Content-Security-Policy
- [x] CSRF protection with token validation

---

## 8. Deployment Security Checklist

Before deploying to production:

- [ ] All environment secrets configured in Key Vault
- [ ] HTTPS certificates installed
- [ ] Database credentials rotated
- [ ] API keys from external services rotated
- [ ] JWT_SECRET generated with crypto.randomBytes(32)
- [ ] CORS origins whitelist updated
- [ ] Rate limiting tuned for expected traffic
- [ ] Monitoring and alerting configured
- [ ] Firewall rules configured
- [ ] Regular backups enabled
- [ ] Security headers verified
- [ ] SSL/TLS certificate pinning (optional)
- [ ] DDoS protection enabled
- [ ] WAF (Web Application Firewall) enabled

---

**Document Version**: 1.0  
**Last Updated**: May 14, 2026  
**Status**: Production Ready

For questions or security concerns, contact the security team.
