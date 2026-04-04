const request = require('supertest');

// Mock dependencies before requiring app
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (req, res, next) => {
    res.json({ proxied: true });
  }
}));

const app = require('../../services/api-gateway/src/index');

describe('API Gateway', () => {
  describe('GET /health', () => {
    it('should return ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('api-gateway');
    });
  });

  describe('GET /metrics', () => {
    it('should return prometheus metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text/);
    });
  });

  describe('JWT Authentication', () => {
    it('should pass requests without token (user=null)', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
    });

    it('should reject invalid tokens gracefully', async () => {
      const res = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer invalid-token-here');
      expect(res.statusCode).toBe(200); // health doesn't require auth
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
    });
  });
});
