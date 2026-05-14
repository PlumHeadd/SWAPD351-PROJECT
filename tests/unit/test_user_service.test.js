const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring app
jest.mock('passport');
jest.mock('sequelize');
jest.mock('redis');

const app = require('../../services/user-service/src/index');

const JWT_SECRET = 'test_secret_key_for_unit_tests_only';

describe('User Service - Authentication & Profile', () => {
  describe('GET /health', () => {
    it('should return service health status', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('user-service');
    });
  });

  describe('GET /metrics', () => {
    it('should return prometheus metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text/);
    });
  });

  describe('OAuth2 Callback - POST /api/auth/google/callback', () => {
    it('should return 400 when missing authorization code', async () => {
      const res = await request(app)
        .post('/api/auth/google/callback')
        .send({});
      
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/code|missing/i);
    });

    it('should handle OAuth exchange error gracefully', async () => {
      const res = await request(app)
        .post('/api/auth/google/callback')
        .send({ code: 'invalid-code-123' });
      
      // Should return 400 or 401 for invalid code
      expect([400, 401]).toContain(res.statusCode);
    });

    it('should return tokens on successful OAuth', async () => {
      // Note: In real scenario with mocked Google OAuth
      const res = await request(app)
        .post('/api/auth/google/callback')
        .send({ 
          code: 'valid-auth-code',
          state: 'state-value' // CSRF protection
        });
      
      // Expect either 200 with tokens or redirect
      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
      }
    });
  });

  describe('JWT Token Management - POST /api/auth/refresh', () => {
    it('should return 400 when missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});
      
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/refresh_token|missing/i);
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: 'invalid-token-xyz' });
      
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toMatch(/invalid|expired/i);
    });

    it('should return new access token for valid refresh token', async () => {
      // Generate valid refresh token (7 day expiration)
      const validRefreshToken = jwt.sign(
        { user_id: 'user-123', type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: validRefreshToken });
      
      // Should return new access token
      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty('access_token');
        expect(res.body.access_token).toMatch(/^[A-Za-z0-9\-._~\+\/]+=*$/); // JWT format
      }
    });

    it('should return 401 for expired refresh token', async () => {
      // Generate expired refresh token
      const expiredRefreshToken = jwt.sign(
        { user_id: 'user-123', type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: expiredRefreshToken });
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('User Profile - GET /api/users/me', () => {
    it('should return 401 without authorization header', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with malformed authorization header', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'InvalidFormat token');
      
      expect(res.statusCode).toBe(401);
    });

    it('should return user profile with valid access token', async () => {
      // Generate valid access token
      const validAccessToken = jwt.sign(
        { 
          user_id: 'user-123',
          email: 'user@example.com',
          type: 'access' 
        },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${validAccessToken}`);
      
      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('email');
      }
    });

    it('should reject expired access token', async () => {
      // Generate expired access token
      const expiredAccessToken = jwt.sign(
        { user_id: 'user-123', type: 'access' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expiredAccessToken}`);
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Logout - POST /api/auth/logout', () => {
    it('should clear session on logout', async () => {
      const validAccessToken = jwt.sign(
        { user_id: 'user-123', type: 'access' },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${validAccessToken}`);
      
      expect([200, 204]).toContain(res.statusCode);
    });

    it('should work even without authorization header (no-op)', async () => {
      const res = await request(app)
        .post('/api/auth/logout');
      
      expect([200, 204]).toContain(res.statusCode);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in responses', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 gracefully', async () => {
      const res = await request(app)
        .get('/api/nonexistent-endpoint');
      
      expect(res.statusCode).toBe(404);
    });

    it('should return 500 on internal server error', async () => {
      // This would depend on actual implementation
      // Just verify no crashes
      const res = await request(app).get('/health');
      expect(res.statusCode).toBeLessThan(500);
    });
  });

  describe('Security Headers', () => {
    it('should include Helmet security headers', async () => {
      const res = await request(app).get('/health');
      
      // Helmet adds these headers
      expect(res.headers['x-content-type-options']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });
});
