const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');
const redis = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { 
  client, 
  metricsMiddleware, 
  trackAuthOperation, 
  trackUserOperation,
  trackDBQuery,
  trackCacheOperation,
  activeUsersGauge,
  cacheHitRate
} = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'eventify_jwt_secret_key_2026';

app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(passport.initialize());
app.use(metricsMiddleware);

// Database
const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgresql://eventify:eventify123@localhost:5432/eventify_users', {
  logging: false,
  dialect: 'postgres'
});

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  avatar_url: { type: DataTypes.STRING },
  bio: { type: DataTypes.TEXT, defaultValue: '' },
  google_id: { type: DataTypes.STRING, unique: true },
  role: { type: DataTypes.STRING(20), defaultValue: 'user', allowNull: false }
}, { tableName: 'users', timestamps: true, underscored: true });

// Redis
let redisClient;
async function initRedis() {
  redisClient = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  redisClient.on('error', (err) => console.log('Redis error:', err.message));
  try { await redisClient.connect(); } catch(e) { console.log('Redis not available, continuing without cache'); }
}

// Google OAuth2
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || 'placeholder',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
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

function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

// Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Auth routes
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

app.get('/api/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/failure' }),
  async (req, res) => {
    try {
      await trackAuthOperation('google_oauth')(async () => {
        const tokens = generateTokens(req.user);
        if (redisClient && redisClient.isReady) {
          await trackCacheOperation('set')(async () => {
            await redisClient.set(`refresh:${req.user.id}`, tokens.refreshToken, { EX: 604800 });
          });
        }
        res.redirect(`http://localhost:3080/login?token=${tokens.accessToken}`);
      });
    } catch (err) {
      res.redirect('/api/auth/failure');
    }
  }
);

app.get('/api/auth/failure', (req, res) => {
  res.status(401).json({ error: 'Authentication failed' });
});

app.post('/api/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });
  try {
    await trackAuthOperation('refresh_token')(async () => {
      const decoded = jwt.verify(refresh_token, JWT_SECRET);
      const user = await trackDBQuery('findByPk', 'users')(async () => {
        return await User.findByPk(decoded.id);
      });
      if (!user) throw new Error('User not found');
      const tokens = generateTokens(user);
      res.json({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: 'Bearer',
        expires_in: 900
      });
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (userId && redisClient && redisClient.isReady) {
    await redisClient.del(`refresh:${userId}`);
  }
  res.status(204).send();
});

// User routes
app.get('/api/users/me', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Invalid user ID format' });
  }
});

app.put('/api/users/me', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { name, bio } = req.body;
    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Invalid user ID format' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, { attributes: ['id', 'email', 'name', 'avatar_url', 'bio'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Invalid user ID format' });
  }
});

// Start with retry for DB connection
async function start() {
  await initRedis();
  for (let i = 0; i < 15; i++) {
    try {
      await sequelize.authenticate();
      console.log('Database connected');
      break;
    } catch (e) {
      console.log(`Waiting for database... attempt ${i+1}/15`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  await sequelize.sync({ alter: true });
  app.listen(PORT, () => console.log(`User Service running on port ${PORT}`));
}

if (require.main === module) {
  start();
}

module.exports = app;
