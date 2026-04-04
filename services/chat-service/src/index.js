const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib');
const cors = require('cors');
const client = require('prom-client');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'eventify_jwt_secret_key_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/eventify_chat';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

// Prometheus
client.collectDefaultMetrics();

app.use(cors());
app.use(express.json());

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
  if (rabbitChannel) {
    try {
      rabbitChannel.publish('eventify.events', routingKey, Buffer.from(JSON.stringify(data)), { persistent: true });
    } catch (e) { /* silent */ }
  }
}

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'chat-service' }));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// REST: get chat history
app.get('/api/chat/:eventId/messages', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const messages = await Message.find({ event_id: req.params.eventId })
    .sort({ timestamp: -1 }).skip(skip).limit(limit);
  const total = await Message.countDocuments({ event_id: req.params.eventId });

  res.json({ messages: messages.reverse(), total, page });
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
  console.log(`User connected: ${socket.userId}`);

  socket.on('join_room', (eventId) => {
    socket.join(eventId);
    socket.eventId = eventId;
    console.log(`${socket.userName} joined room ${eventId}`);
  });

  socket.on('send_message', async (data) => {
    const msg = new Message({
      event_id: data.event_id || socket.eventId,
      user_id: socket.userId,
      user_name: socket.userName,
      content: data.content
    });
    await msg.save();

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
  });

  socket.on('leave_room', (eventId) => {
    socket.leave(eventId);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userId}`);
  });
});

server.listen(PORT, () => console.log(`Chat Service running on port ${PORT}`));
module.exports = { app, server };
