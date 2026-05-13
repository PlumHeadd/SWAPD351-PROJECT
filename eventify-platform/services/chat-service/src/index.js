const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib');
const cors = require('cors');
const {
  client,
  metricsMiddleware,
  chatMessagesTotal,
  socketConnectionsActive,
  mongoQueryDuration,
  rabbitmqPublishTotal,
} = require('./metrics');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'eventify_jwt_secret_key_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/eventify_chat';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// MongoDB
mongoose.connect(MONGO_URI).catch(err => console.log('MongoDB error:', err.message));

const messageSchema = new mongoose.Schema({
  event_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true },
  user_name: { type: String, default: 'Anonymous' },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// RabbitMQ
let rabbitChannel = null;
async function connectRabbit() {
  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await conn.createChannel();
    await rabbitChannel.assertExchange('eventify.events', 'topic', { durable: true });
  } catch (e) {
    console.log('RabbitMQ not available:', e.message);
  }
}
connectRabbit();

function publishMessage(routingKey, data) {
  if (!rabbitChannel) return;
  try {
    rabbitChannel.publish('eventify.events', routingKey, Buffer.from(JSON.stringify(data)), { persistent: true });
    rabbitmqPublishTotal.inc({ routing_key: routingKey, status: 'success' });
  } catch (e) {
    rabbitmqPublishTotal.inc({ routing_key: routingKey, status: 'error' });
  }
}

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'chat-service' }));

// Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// REST: get chat history
app.get('/api/chat/:eventId/messages', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const start = Date.now();
  try {
    const messages = await Message.find({ event_id: req.params.eventId })
      .sort({ timestamp: -1 }).skip(skip).limit(limit);
    const total = await Message.countDocuments({ event_id: req.params.eventId });
    mongoQueryDuration.observe({ operation: 'find_messages', status: 'success' }, (Date.now() - start) / 1000);
    res.json({ messages: messages.reverse(), total, page });
  } catch (err) {
    mongoQueryDuration.observe({ operation: 'find_messages', status: 'error' }, (Date.now() - start) / 1000);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Socket.IO for real-time
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    socket.userName = decoded.name || 'Anonymous';
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socketConnectionsActive.inc();
  console.log(`User connected: ${socket.userId}`);

  socket.on('join_room', (eventId) => {
    socket.join(eventId);
    socket.eventId = eventId;
  });

  socket.on('send_message', async (data) => {
    const start = Date.now();
    try {
      const msg = new Message({
        event_id: data.event_id || socket.eventId,
        user_id: socket.userId,
        user_name: socket.userName,
        content: data.content
      });
      await msg.save();
      chatMessagesTotal.inc({ status: 'success' });
      mongoQueryDuration.observe({ operation: 'save_message', status: 'success' }, (Date.now() - start) / 1000);

      io.to(msg.event_id).emit('new_message', {
        id: msg._id,
        event_id: msg.event_id,
        user_id: msg.user_id,
        user_name: msg.user_name,
        content: msg.content,
        timestamp: msg.timestamp
      });

      publishMessage('chat.message', {
        event_id: msg.event_id,
        user_id: msg.user_id,
        user_name: msg.user_name,
        content: msg.content
      });
    } catch (err) {
      chatMessagesTotal.inc({ status: 'error' });
      mongoQueryDuration.observe({ operation: 'save_message', status: 'error' }, (Date.now() - start) / 1000);
    }
  });

  socket.on('leave_room', (eventId) => {
    socket.leave(eventId);
  });

  socket.on('disconnect', () => {
    socketConnectionsActive.dec();
    console.log(`User disconnected: ${socket.userId}`);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Chat Service running on port ${PORT}`));
}
module.exports = { app, server };
