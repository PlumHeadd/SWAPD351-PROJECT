# OAuth2 Production Setup Guide

This guide covers setting up OAuth2 Google authentication for production deployment.

## Overview

OAuth2 provides secure, federated authentication without storing passwords. Users authenticate with Google and receive JWT tokens for API access.

**Flow:**
1. User clicks "Login with Google"
2. Redirected to Google OAuth consent screen
3. User grants permissions
4. Google redirects to callback URL with auth code
5. Backend exchanges code for tokens
6. User receives JWT token and session
7. Subsequent requests include JWT in Authorization header

## Google Cloud Setup

### 1. Create Google Cloud Project

```bash
# Go to Google Cloud Console
https://console.cloud.google.com

# Create new project
Project Name: "Eventify Production"
```

### 2. Enable OAuth 2.0 API

```bash
# In Google Cloud Console:
# 1. Navigate to APIs & Services > Library
# 2. Search for "Google+ API"
# 3. Click "Enable"
# 4. Repeat for "Google Identity Services API"
```

### 3. Create OAuth 2.0 Credentials

```bash
# APIs & Services > Credentials > Create Credentials > OAuth client ID

# Application type: Web application

# Authorized JavaScript origins:
https://yourdomain.com
https://www.yourdomain.com
http://localhost:3000  # for dev only

# Authorized redirect URIs:
https://yourdomain.com/api/auth/google/callback
https://yourdomain.com:3000/api/auth/google/callback
http://localhost:3000/api/auth/google/callback  # for dev only
```

### 4. Save Credentials

```
Client ID:     YOUR_CLIENT_ID.apps.googleusercontent.com
Client Secret: YOUR_CLIENT_SECRET_XXXXXXXXXXXXXX
```

⚠️ **IMPORTANT:** Never commit these to version control!

## Environment Configuration

### Development (.env.development)

```bash
NODE_ENV=development
GOOGLE_CLIENT_ID=YOUR_DEV_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_DEV_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
JWT_SECRET=dev-jwt-secret-key-min-32-characters-long
```

### Production (.env.production)

```bash
NODE_ENV=production
GOOGLE_CLIENT_ID=YOUR_PROD_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_PROD_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
JWT_SECRET=<64-character-random-string-use-openssl-rand>
```

### Secure Secret Generation

```bash
# Generate strong JWT secret
openssl rand -base64 48

# Store in environment variable
export JWT_SECRET=$(openssl rand -base64 48)

# Or use Azure Key Vault
az keyvault secret set --vault-name eventify-kv --name JwtSecret --value "$JWT_SECRET"

# Or use AWS Secrets Manager
aws secretsmanager create-secret \
  --name eventify/jwt-secret \
  --secret-string "$(openssl rand -base64 48)"
```

## Service Configuration

### User Service Implementation

File: `services/user-service/src/index.js`

```javascript
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Create or update user in database
    let user = await User.findOne({ where: { google_id: profile.id } });
    if (!user) {
      user = await User.create({
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar_url: profile.photos[0]?.value || '',
        google_id: profile.id
      });
    }
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

// Token generation
function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      type: 'access'
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }  // 15 minutes
  );

  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: 'refresh'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }  // 7 days
  );

  return { accessToken, refreshToken };
}

// Google OAuth endpoint
app.get('/api/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

// Google callback endpoint
app.get('/api/auth/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/login?error=auth_failed'
  }),
  (req, res) => {
    const tokens = generateTokens(req.user);
    
    // Option 1: Return tokens in URL (for SPA)
    res.redirect(`${process.env.FRONTEND_URL}/login?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
    
    // Option 2: Set secure HTTP-only cookie
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000  // 15 minutes
    });
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
    });
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3080');
  }
);

// Token refresh endpoint
app.post('/api/auth/refresh', (req, res) => {
  const { refresh_token } = req.body;
  
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token required' });
  }
  
  try {
    const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const newTokens = generateTokens(user);
    
    res.json({
      access_token: newTokens.accessToken,
      refresh_token: newTokens.refreshToken,
      token_type: 'Bearer',
      expires_in: 900
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

## Frontend Configuration

### React Login Component

File: `frontend/src/components/Login.js`

```jsx
import React, { useEffect } from 'react';

function Login() {
  const handleGoogleLogin = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = '/api/auth/google';
  };

  // Handle callback from OAuth provider
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const refresh = params.get('refresh');
    
    if (token) {
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', refresh);
      window.location.href = '/dashboard';
    }
  }, []);

  return (
    <div className="login-container">
      <h1>Eventify</h1>
      <button onClick={handleGoogleLogin}>
        Sign in with Google
      </button>
    </div>
  );
}

export default Login;
```

## API Gateway JWT Validation

File: `services/api-gateway/src/index.js`

```javascript
const jwt = require('jsonwebtoken');

// JWT validation middleware
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    // Public endpoints don't require authentication
    if (['/health', '/metrics', '/api/auth/google'].includes(req.path)) {
      return next();
    }
    return res.status(401).json({ error: 'Authorization header missing' });
  }
  
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type === 'access') {
      // Attach user info to request
      req.user = decoded;
      req.headers['x-user-id'] = decoded.id;
      req.headers['x-user-email'] = decoded.email;
      next();
    } else if (decoded.type === 'refresh') {
      return res.status(401).json({ error: 'Use access token for API requests' });
    }
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
});
```

## Docker Deployment

### Docker Environment

```dockerfile
# services/user-service/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

# Get credentials from environment
ENV GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
ENV GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
ENV GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}
ENV JWT_SECRET=${JWT_SECRET}

EXPOSE 3001

CMD ["node", "src/index.js"]
```

### Docker Compose

```yaml
user-service:
  build: ./services/user-service
  environment:
    - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
    - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    - GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
    - JWT_SECRET=${JWT_SECRET}
  secrets:
    - google_client_secret
    - jwt_secret

secrets:
  google_client_secret:
    external: true
  jwt_secret:
    external: true
```

## Kubernetes Deployment

### Secrets

```bash
# Create secrets from environment variables
kubectl create secret generic oauth-credentials \
  --from-literal=GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
  --from-literal=GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
  --from-literal=JWT_SECRET=$JWT_SECRET \
  -n eventify
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: eventify
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: user-service
        image: your-registry/eventify-user-service:latest
        envFrom:
        - secretRef:
            name: oauth-credentials
        env:
        - name: GOOGLE_CALLBACK_URL
          value: https://yourdomain.com/api/auth/google/callback
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: connection-string
```

## Security Best Practices

✅ **Store secrets securely**
- Use Azure Key Vault, AWS Secrets Manager, or HashiCorp Vault
- Never commit .env files
- Use different credentials for dev/staging/production

✅ **Use HTTPS only**
- All OAuth redirects must use HTTPS
- Configure valid certificate for domain

✅ **Token security**
- Use secure, random JWT secret (min 64 characters)
- Set short expiration for access tokens (15 minutes)
- Implement refresh token rotation

✅ **CSRF protection**
- Use state parameter in OAuth flow
- Validate state on callback
- Use SameSite cookies

✅ **Validate scopes**
- Request only necessary scopes (profile, email)
- Validate user permissions before API calls

✅ **Monitor authentication**
- Log authentication attempts
- Alert on failed login spikes
- Track token usage per user

## Troubleshooting

### Invalid Redirect URI

**Error:** `redirect_uri_mismatch`

**Cause:** Callback URL doesn't match Google Console configuration

**Fix:** Ensure exact match:
```
✓ https://yourdomain.com/api/auth/google/callback
✗ https://yourdomain.com/api/auth/google/callback/
✗ https://yourdomain.com/api/auth/callback
```

### Token Validation Fails

**Error:** `invalid signature`

**Cause:** JWT_SECRET mismatch between services

**Fix:** Ensure all services use same JWT_SECRET from environment

### Credential Leaks

**Error:** Client secret exposed in logs or git history

**Fix:**
```bash
# Check git history
git log --all --full-history -- .env

# Remove from history
git filter-branch --tree-filter 'rm -f .env' HEAD

# Rotate credentials immediately
```

## Testing OAuth2 Flow

```bash
# 1. Start local server
npm start

# 2. Visit login page
curl http://localhost:3000/login

# 3. Simulate OAuth callback
curl http://localhost:3001/api/auth/google/callback?code=test-code

# 4. Test token refresh
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"your-refresh-token"}'

# 5. Test protected endpoint
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer your-access-token"
```

## Monitoring & Alerts

Monitor these metrics:
- **Failed login attempts** - Alert if > 10/minute from single IP
- **Token expiration** - Alert if users frequently need refresh
- **Invalid token errors** - Alert if > 5%of API requests
- **OAuth callback timeouts** - Alert if > 1/minute

## Additional Resources

- Google OAuth Documentation: https://developers.google.com/identity/protocols/oauth2
- JWT Best Practices: https://tools.ietf.org/html/rfc8949
- OWASP OAuth2 Security: https://cheatsheetseries.owasp.org/cheatsheets/OAuth_2_Cheat_Sheet.html
