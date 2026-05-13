# ADR-009: Security Implementation Strategy

**Status:** Accepted  
**Date:** 2026-04-25  
**Updated:** 2026-05-04

## Context

The Eventify Platform handles user authentication, personal data, and event information. We must implement comprehensive security measures to:
- Protect user accounts and data
- Prevent unauthorized access
- Secure API endpoints
- Comply with security best practices
- Prevent common web vulnerabilities

## Decision

We implement a **defense-in-depth security strategy** with multiple layers:

### Layer 1: Authentication & Authorization
- OAuth2 (Google) for user authentication
- JWT tokens for API authorization
- Token expiration and refresh mechanism
- Secure session management

### Layer 2: API Security
- API Gateway as security enforcement point
- Rate limiting to prevent abuse
- Input validation on all endpoints
- CORS configuration
- Security headers (Helmet.js)

### Layer 3: Transport Security
- HTTPS/TLS for all external communication (production)
- TLS-ready configuration
- Secure cookie attributes

### Layer 4: Infrastructure Security
- Network isolation (Docker networks)
- Secrets management (.env files, Docker secrets)
- Database access controls
- Least privilege principle

### Layer 5: Application Security
- Secure password handling (OAuth2 delegates this)
- SQL injection prevention (ORMs)
- NoSQL injection prevention (input validation)
- XSS prevention (React escaping, CSP headers)
- CSRF protection (JWT in headers, not cookies)

## Authentication Implementation

### OAuth2 with Google

**Why Google OAuth2?**
- Users don't need to remember another password
- Google handles secure password storage
- Two-factor authentication inherited from Google
- Users trust Google's security
- Reduces attack surface (no password database to breach)

**Flow**:
```
1. User clicks "Login with Google"
   ↓
2. Frontend redirects to Google consent screen
   GET https://accounts.google.com/o/oauth2/v2/auth
   ?client_id=...
   &redirect_uri=http://localhost:3000/api/auth/google/callback
   &response_type=code
   &scope=profile email
   ↓
3. User authorizes access
   ↓
4. Google redirects back with authorization code
   GET http://localhost:3000/api/auth/google/callback?code=AUTHORIZATION_CODE
   ↓
5. User Service exchanges code for access token
   POST https://oauth2.googleapis.com/token
   ↓
6. User Service retrieves user profile
   GET https://www.googleapis.com/oauth2/v1/userinfo
   ↓
7. User Service creates/updates user in database
   ↓
8. User Service generates JWT tokens (access + refresh)
   ↓
9. Frontend stores tokens and redirects to dashboard
```

**Implementation**:
- **Library**: Passport.js with passport-google-oauth20
- **Scopes**: `profile`, `email`
- **User Service**: Handles OAuth2 callback and JWT generation
- **API Gateway**: Validates JWT on protected routes

### JWT Token Structure

**Access Token**:
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe",
    "iat": 1714838400,
    "exp": 1714842000
  },
  "signature": "HMAC-SHA256(header.payload, JWT_SECRET)"
}
```

**Properties**:
- **Algorithm**: HS256 (HMAC with SHA-256)
- **Expiration**: 1 hour (3600 seconds)
- **Issuer**: User Service
- **Secret**: `JWT_SECRET` environment variable (shared across services)

**Refresh Token**:
- **Expiration**: 7 days
- **Purpose**: Obtain new access token without re-authentication
- **Storage**: Stored in database with user association
- **Revocation**: Can be invalidated on logout or security breach

### Token Validation

**API Gateway** (on every protected request):
```javascript
function validateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Event Service** (Python):
```python
def get_user_id():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            return decoded.get('id')
        except jwt.ExpiredSignatureError:
            abort(401, 'Token expired')
        except jwt.InvalidTokenError:
            abort(401, 'Invalid token')
    
    # Fallback for service-to-service communication
    return request.headers.get('x-user-id')
```

### Role-Based Authorization (To Be Implemented)

**Roles**:
- `user`: Can browse events, RSVP, chat
- `organizer`: Can create and manage own events
- `admin`: Full system access

**Implementation** (planned):
```javascript
// Add roles to JWT payload
{
  "id": "user-123",
  "email": "user@example.com",
  "roles": ["user", "organizer"]
}

// Middleware for role checking
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Usage
app.delete('/api/events/:id', 
  validateJWT, 
  requireRole('organizer'),
  deleteEvent
);
```

**Status**: NOT YET IMPLEMENTED (all authenticated users have same permissions)

## API Security

### Rate Limiting

**Implementation**: express-rate-limit + Redis

**Configuration**:
```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:'
  }),
  windowMs: 60 * 1000,        // 1 minute
  max: 10000,                  // 10,000 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later'
});

app.use(limiter);
```

**Per-Endpoint Limits**:
- **Login**: 10 requests/minute (prevent brute force)
- **Event creation**: 10 requests/minute (prevent spam)
- **General API**: 10,000 requests/minute (generous for development)

**Production Recommendations**:
- Lower limits: 100-1000 req/min
- Per-user rate limiting (not just per-IP)
- Exponential backoff for repeated violations
- Whitelist for monitoring services

### Input Validation

**Validation Strategy**:
- Validate all user input
- Whitelist allowed characters
- Enforce length limits
- Validate data types
- Sanitize before database operations

**Example** (Event Service):
```python
def validate_event_data(data):
    required_fields = ['title', 'date', 'location', 'category']
    for field in required_fields:
        if field not in data or not data[field]:
            abort(400, f'{field} is required')
    
    # Title: 5-200 characters
    if len(data['title']) < 5 or len(data['title']) > 200:
        abort(400, 'Title must be 5-200 characters')
    
    # Category: Must be in allowed list
    allowed_categories = ['conference', 'workshop', 'meetup', 'webinar', 'social']
    if data['category'] not in allowed_categories:
        abort(400, 'Invalid category')
    
    # Date: Must be in future
    event_date = datetime.fromisoformat(data['date'])
    if event_date < datetime.now():
        abort(400, 'Event date must be in the future')
    
    # Capacity: Positive integer
    if 'max_capacity' in data:
        if not isinstance(data['max_capacity'], int) or data['max_capacity'] < 1:
            abort(400, 'Capacity must be a positive integer')
```

**Validation Libraries**:
- **Python**: Manual validation + Flask abort (current)
- **Node.js**: joi, express-validator (recommended to add)

### Security Headers (Helmet.js)

**API Gateway Configuration**:
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true
}));
```

**Headers Added**:
- `Content-Security-Policy`: Prevents XSS attacks
- `Strict-Transport-Security`: Enforces HTTPS
- `X-Frame-Options`: Prevents clickjacking
- `X-Content-Type-Options`: Prevents MIME sniffing
- `X-XSS-Protection`: Additional XSS protection

### CORS Configuration

**API Gateway**:
```javascript
const cors = require('cors');

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3080',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
```

**Security Considerations**:
- Only allow specific origin (not `*`)
- Enable credentials for cookies (if used)
- Restrict allowed headers and methods

## Transport Security

### HTTPS/TLS

**Development**:
- HTTP only (for local development)
- No TLS termination

**Production Strategy**:
```
[Internet]
  ↓ HTTPS (443)
[Nginx Reverse Proxy]
  - TLS termination
  - Let's Encrypt certificates
  - HTTPS → HTTP translation
  ↓ HTTP
[API Gateway]
[Microservices]
```

**Nginx Configuration** (example for production):
```nginx
server {
    listen 443 ssl http2;
    server_name api.eventify.com;

    ssl_certificate /etc/letsencrypt/live/eventify.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eventify.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://api-gateway:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Status**: TLS-ready but not configured (development environment)

### Cookie Security (If Used)

**Attributes**:
- `HttpOnly`: Prevents JavaScript access (XSS protection)
- `Secure`: Only send over HTTPS
- `SameSite=Strict`: CSRF protection

**Current Implementation**: JWT in Authorization header (not cookies)

**Trade-offs**:
- **Header-based (current)**: More flexible, works with mobile apps, requires client-side storage
- **Cookie-based**: More secure (HttpOnly), automatic with requests, CSRF risk (mitigated with SameSite)

## Infrastructure Security

### Network Isolation

**Docker Network**:
```yaml
networks:
  eventify-net:
    driver: bridge
```

**Security**:
- All containers on isolated network
- No direct external access to databases
- Only API Gateway and Frontend expose ports to host
- Internal communication uses service names (DNS)

**Port Exposure**:
- **External**: 3080 (Frontend), 3000 (API Gateway), 3030 (Grafana), 9090 (Prometheus), etc.
- **Internal Only**: PostgreSQL, MongoDB, Redis, RabbitMQ (accessible only within Docker network)

**Production Recommendation**:
- Remove port mappings for databases
- Use Docker secrets for credentials
- Use private Docker registry
- Network policies for service-to-service communication

### Secrets Management

**Development** (.env file):
```bash
# .env (gitignored)
JWT_SECRET=eventify_jwt_secret_key_2026
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
DATABASE_URL=postgresql://eventify:eventify123@postgres:5432/eventify_users
```

**Production Options**:

1. **Docker Secrets** (Docker Swarm):
```bash
echo "strong-jwt-secret" | docker secret create jwt_secret -
```

```yaml
services:
  api-gateway:
    secrets:
      - jwt_secret
secrets:
  jwt_secret:
    external: true
```

2. **Kubernetes Secrets**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: eventify-secrets
type: Opaque
data:
  jwt-secret: base64-encoded-secret
```

3. **Azure Key Vault** (Cloud):
```javascript
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const credential = new DefaultAzureCredential();
const client = new SecretClient(vaultUrl, credential);
const jwtSecret = await client.getSecret('jwt-secret');
```

**Current Status**: Environment variables (development only)

### Database Security

**PostgreSQL**:
- **Current**: No authentication (development)
- **Production**: Strong password, SSL/TLS, read replicas for read-only access
- **SQL Injection Prevention**: Parameterized queries (ORMs handle this)

**MongoDB**:
- **Current**: No authentication (development)
- **Production**: Authentication enabled, role-based access, TLS
- **NoSQL Injection Prevention**: Input validation, avoid dynamic queries

**Redis**:
- **Current**: No authentication (development)
- **Production**: Password authentication (`requirepass`), TLS

**RabbitMQ**:
- **Current**: Default guest/guest credentials
- **Production**: Strong credentials, TLS, virtual hosts

## Application Security

### XSS Prevention

**React** (automatic escaping):
```javascript
// Safe: React escapes by default
<div>{userInput}</div>

// Unsafe (don't do this)
<div dangerouslySetInnerHTML={{__html: userInput}} />
```

**CSP Headers**: Configured via Helmet.js

### SQL/NoSQL Injection Prevention

**SQL** (PostgreSQL with Sequelize ORM):
```javascript
// Safe: Parameterized query
User.findAll({
  where: {
    email: userEmail
  }
});

// Unsafe (don't do this)
User.findAll({
  where: literal(`email = '${userEmail}'`)
});
```

**NoSQL** (MongoDB with Mongoose):
```javascript
// Safe: Schema validation
Event.find({ category: req.query.category });

// Unsafe (don't do this)
Event.find(req.query);  // Allows MongoDB operator injection
```

**Mitigation**: Validate and whitelist input, use ORMs/ODMs, never trust user input

### CSRF Prevention

**Current Strategy**: JWT in Authorization header (not cookies)

**Why CSRF Not a Concern**:
- JWT stored in localStorage, not cookies
- Browser doesn't automatically send Authorization header
- Cross-origin requests blocked by CORS
- Custom header (`Authorization`) triggers CORS preflight

**If Using Cookies**: Enable `SameSite=Strict` attribute

### Session Security

**Current**: Stateless JWT (no server-side sessions)

**Session Storage** (User Service uses Redis for OAuth state):
- Temporary storage during OAuth flow
- Expires after 5 minutes
- Not used for application sessions

## Security Testing

### Automated Security Checks (To Be Implemented)

1. **Dependency Scanning**:
```bash
# Node.js
npm audit
npm audit fix

# Python
pip install safety
safety check
```

2. **Container Scanning**:
```bash
# Trivy
trivy image eventify-platform/api-gateway:latest
```

3. **Static Analysis**:
```bash
# ESLint security plugin
npm install --save-dev eslint-plugin-security

# Bandit for Python
pip install bandit
bandit -r services/event-service/
```

4. **Secret Scanning**:
```bash
# git-secrets
git secrets --scan

# truffleHog
truffleHog --regex --entropy=True https://github.com/org/eventify
```

### Manual Security Testing

1. **Authentication Bypass**:
   - Try accessing protected routes without token
   - Try with invalid token
   - Try with expired token

2. **Authorization Bypass**:
   - Try to modify other users' events
   - Try to access other users' RSVPs
   - Try admin functions as regular user

3. **Input Validation**:
   - SQL/NoSQL injection attempts
   - XSS payload in event titles
   - Extremely long inputs (buffer overflow)
   - Special characters

4. **Rate Limiting**:
   - Exceed rate limits and verify blocking
   - Verify rate limit headers

## Security Checklist

### ✅ Implemented
- OAuth2 authentication (Google)
- JWT token generation and validation
- Token expiration
- Rate limiting (API Gateway)
- Input validation (Event Service)
- Security headers (Helmet.js)
- CORS configuration
- Network isolation (Docker)
- Secrets in .env files (not committed)

### ⚠️ Partial
- HTTPS/TLS (TLS-ready, not configured)
- Database authentication (disabled in development)
- Role-based authorization (planned, not implemented)

### ❌ Not Implemented
- Automated security scanning
- Secret rotation
- Security audit logging
- Intrusion detection
- Web Application Firewall (WAF)
- DDoS protection

## Compliance Considerations

### GDPR (General Data Protection Regulation)

**User Data Collected**:
- Email address (from Google)
- Name (from Google)
- Event creation and RSVP history

**Requirements**:
- User consent (via OAuth)
- Right to access data (API: GET /users/me)
- Right to delete data (API: DELETE /users/me - to be implemented)
- Data breach notification (manual process)

**To Implement**:
- Data export functionality
- Account deletion functionality
- Privacy policy
- Data retention policy

### OWASP Top 10 (2021)

1. **Broken Access Control**: ⚠️ Partial (JWT validation, need RBAC)
2. **Cryptographic Failures**: ✅ OK (OAuth2, JWT, TLS-ready)
3. **Injection**: ✅ OK (ORMs, input validation)
4. **Insecure Design**: ⚠️ Partial (defense in depth, need security testing)
5. **Security Misconfiguration**: ⚠️ Partial (development defaults, need production hardening)
6. **Vulnerable Components**: ❌ Not checked (need dependency scanning)
7. **Authentication Failures**: ✅ OK (OAuth2, JWT)
8. **Software and Data Integrity Failures**: ⚠️ Partial (need CI/CD security)
9. **Security Logging Failures**: ⚠️ Partial (logging exists, need security events)
10. **Server-Side Request Forgery**: ✅ OK (no user-controlled URLs)

## Trade-offs

### OAuth2 Dependency

**Advantages**:
- No password management
- Delegate authentication to experts (Google)
- 2FA inherited
- User trust

**Disadvantages**:
- Dependency on Google (single point of failure)
- Users without Google account excluded
- Privacy concerns (Google knows user uses Eventify)

**Mitigation**: Support multiple OAuth2 providers (GitHub, Microsoft, Facebook)

### JWT vs Session Tokens

**Chose JWT**:
- Stateless (no server-side session store)
- Scales horizontally
- Works across microservices
- Includes user claims

**Trade-offs**:
- Cannot revoke (until expiration)
- Larger payload (sent with every request)
- Secret must be shared across services

**Mitigation**:
- Short expiration (1 hour)
- Refresh tokens for revocation
- Store revoked tokens in Redis (if needed)

## Alternatives Considered

### Alternative 1: Traditional Username/Password

**Rejected Because**:
- Need to implement password reset
- Need to implement email verification
- Need to store hashed passwords
- Users forget passwords
- Higher security risk

### Alternative 2: Magic Link Authentication

**Could Be Added**:
- Passwordless authentication
- Email-based login
- Good UX for mobile

**Not Primary Because**:
- Requires email infrastructure
- Slower than OAuth2
- Email deliverability issues

### Alternative 3: Session-Based Authentication

**Rejected Because**:
- Requires shared session store (Redis)
- Harder to scale horizontally
- More complex for microservices
- Sticky sessions for load balancing

### Alternative 4: API Keys

**Not Suitable For**:
- User authentication (no identity)
- Browser applications (exposure risk)

**Could Be Added For**:
- Service-to-service authentication
- Third-party integrations
- Mobile apps (with secure storage)

## Future Improvements

1. **Implement Role-Based Access Control (RBAC)**
2. **Add automated security scanning to CI/CD**
3. **Implement account deletion (GDPR compliance)**
4. **Add security audit logging**
5. **Implement secret rotation**
6. **Add multi-factor authentication (MFA)**
7. **Implement API key authentication for third parties**
8. **Add Web Application Firewall (WAF)**
9. **Implement DDoS protection**
10. **Regular security audits and penetration testing**

## Review Schedule

- **Weekly**: Review failed authentication attempts, rate limit violations
- **Monthly**: Dependency vulnerability scanning
- **Quarterly**: Security architecture review
- **Annually**: Full security audit and penetration testing

**Last Reviewed**: 2026-05-04  
**Next Review**: 2026-08-01
