# HTTPS/TLS Configuration for Eventify Platform

## Development Setup (HTTP only - for Docker Compose)

For local development, use HTTP. Update frontend URLs in docker-compose.yml:
```yaml
environment:
  - REACT_APP_API_URL=http://localhost:3000
```

## Production Setup (HTTPS required)

### 1. Certificate Management

#### Option A: Azure Key Vault (Recommended for Azure deployment)
```bash
# Create self-signed cert for initial setup
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Upload to Azure Key Vault
az keyvault certificate import \
  --vault-name eventify-kv \
  --name eventify-cert \
  --file cert.pfx \
  --password $password
```

#### Option B: Let's Encrypt (Free, automated)
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Renew automatically
sudo certbot renew --quiet
```

#### Option C: Self-signed (Testing only)
```bash
openssl req -x509 -newkey rsa:2048 -keyout private-key.pem -out certificate.pem -days 365 -nodes
```

### 2. Nginx Reverse Proxy (Production Frontend)

File: `frontend/nginx-prod.conf`
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL Certificate paths
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Root location
    root /usr/share/nginx/html;
    index index.html index.htm;

    # React SPA routing
    location / {
        try_files $uri /index.html;
    }

    # API Gateway proxy
    location /api/ {
        proxy_pass http://api-gateway:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect off;
    }

    # WebSocket support for chat
    location /socket.io {
        proxy_pass http://chat-service:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Static files cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Metrics (internal only)
    location /metrics {
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }
}

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 3. Node.js Service HTTPS Configuration

File: `services/api-gateway/src/https-server.js`
```javascript
const https = require('https');
const fs = require('fs');
const express = require('express');

const app = require('./index');

// Read certificate files
const cert = fs.readFileSync('/etc/ssl/certs/tls.crt', 'utf8');
const key = fs.readFileSync('/etc/ssl/private/tls.key', 'utf8');

const options = {
  key: key,
  cert: cert
};

const PORT = process.env.PORT || 3000;
https.createServer(options, app).listen(PORT, () => {
  console.log(`API Gateway running on HTTPS :${PORT}`);
});
```

### 4. Python Service HTTPS Configuration

File: `services/event-service/app-https.py`
```python
import ssl
from flask import Flask
import os

app = Flask(__name__)
# ... existing Flask app code ...

if __name__ == '__main__':
    ssl_context = (
        os.getenv('SSL_CERT_PATH', '/etc/ssl/certs/tls.crt'),
        os.getenv('SSL_KEY_PATH', '/etc/ssl/private/tls.key')
    )
    
    app.run(
        host='0.0.0.0',
        port=5001,
        ssl_context=ssl_context,
        debug=os.getenv('DEBUG', False)
    )
```

### 5. Docker Compose Production Setup

```yaml
services:
  frontend-nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./frontend/nginx-prod.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl/cert.pem:/etc/nginx/ssl/cert.pem:ro
      - ./ssl/key.pem:/etc/nginx/ssl/key.pem:ro
    depends_on:
      - api-gateway
      - chat-service

  # Services require SSL context
  api-gateway:
    # ... existing config ...
    environment:
      - SSL_CERT_PATH=/etc/ssl/certs/tls.crt
      - SSL_KEY_PATH=/etc/ssl/private/tls.key
    volumes:
      - ./ssl/cert.pem:/etc/ssl/certs/tls.crt:ro
      - ./ssl/key.pem:/etc/ssl/private/tls.key:ro
```

### 6. Kubernetes HTTPS Setup

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: tls-secret
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: eventify-ingress
spec:
  tls:
  - hosts:
    - yourdomain.com
    secretName: tls-secret
  rules:
  - host: yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 3000
      - path: /socket.io
        pathType: Prefix
        backend:
          service:
            name: chat-service
            port:
              number: 3002
```

### 7. Environment Variables for HTTPS

Add to `.env`:
```
# HTTPS Settings
NODE_ENV=production
SSL_CERT_PATH=/etc/ssl/certs/tls.crt
SSL_KEY_PATH=/etc/ssl/private/tls.key

# Security
HSTS_MAX_AGE=31536000
SECURE_COOKIE=true
SAME_SITE=Strict
```

### 8. Testing HTTPS Configuration

```bash
# Test SSL certificate
openssl s_client -connect yourdomain.com:443

# Verify certificate details
openssl x509 -in cert.pem -text -noout

# Test security headers
curl -I https://yourdomain.com | grep -E "Strict-Transport-Security|X-Frame-Options"

# SSL Labs test (online)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

### 9. Certificate Renewal Automation

```bash
#!/bin/bash
# renew-certs.sh

# For Let's Encrypt
sudo certbot renew --quiet

# Copy to Docker volume
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./ssl/key.pem

# Restart services
docker-compose restart frontend-nginx api-gateway

# For automated renewal in crontab:
# 0 0 1 * * /path/to/renew-certs.sh
```

## Security Best Practices

✅ **Use HTTPS only** - No HTTP to production
✅ **HSTS enabled** - Force HTTPS for future requests
✅ **TLS 1.2+** - Disable older protocols
✅ **Strong ciphers** - Use modern cipher suites
✅ **Certificate monitoring** - Alert on expiration
✅ **Automated renewal** - Prevent expired certificates
✅ **Security headers** - CSP, X-Frame-Options, etc.

## Common Issues

### Certificate Mismatch
```
Error: Certificate mismatch
Solution: Ensure certificate CN matches domain name
```

### Mixed Content
```
Error: Mixed Content Blocked
Solution: Ensure all resources load over HTTPS (no http://)
```

### Certificate Expiration
```
Error: Certificate expired
Solution: Renew certificate before expiration date
```
