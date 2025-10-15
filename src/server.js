// src/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const Message = require('./models/Message');
const createRoomId = require('./utils/roomId');

const app = express();
const server = http.createServer(app);

// CORS - allow deployed frontend or local fallback
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
app.use(cors({
  origin: process.env.CLIENT_URL || 'https://mern-private-chat-frontend.vercel.app',
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// simple health route
app.get('/', (req, res) => res.send('OK'));

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Connect DB
const MONGO = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO) {
  console.error('No MongoDB URI provided. Set MONGODB_URI (or MONGO_URI) in env.');
  process.exit(1);
}

mongoose.connect(MONGO)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Setup Socket.io with CORS allowance
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

// Socket auth middleware - must be registered BEFORE connection handling
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: missing token'));
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id;
    return next();
  } catch (err) {
    console.error('Socket auth error:', err.message);
    return next(new Error('Authentication error'));
  }
});

// Keep track of online users (userId => socketId)
const onlineUsers = new Map();

io.on('connection', (socket) => {
  // socket.userId is set by the auth middleware
  console.log('Socket connected:', socket.id, 'userId:', socket.userId);

  // Add to online users map
  if (socket.userId) {
    onlineUsers.set(String(socket.userId), socket.id);
    // notify all clients of online users (send array of userIds)
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  }

  // Join personal room for targeted emits
  if (socket.userId) socket.join(String(socket.userId));

  // Client may request to join a deterministic private room
  socket.on('join_private', ({ otherUserId }) => {
    if (!socket.userId || !otherUserId) return;
    const roomId = createRoomId(socket.userId, otherUserId);
    socket.join(roomId);
    console.log(`User ${socket.userId} joined room ${roomId}`);
  });

  // Handle private_message (save to DB and broadcast to room)
  socket.on('private_message', async ({ otherUserId, text }) => {
    if (!socket.userId || !otherUserId || !text) return;
    try {
      const roomId = createRoomId(socket.userId, otherUserId);
      const msg = new Message({
        chatId: roomId,
        senderId: socket.userId,
        receiverId: otherUserId,
        text
      });
      await msg.save();
      io.to(roomId).emit('new_message', {
        _id: msg._id,
        chatId: roomId,
        senderId: String(msg.senderId),
        receiverId: String(msg.receiverId),
        text: msg.text,
        createdAt: msg.createdAt
      });
    } catch (err) {
      console.error('Error saving message', err);
    }
  });

  // Backwards-compatible event for simple direct private message (non-room)
  socket.on('privateMessage', ({ senderId, receiverId, message }) => {
    const receiverSocketId = onlineUsers.get(String(receiverId));
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receivePrivateMessage', { senderId, message });
    }
  });

  // When client disconnects
  socket.on('disconnect', () => {
    // remove user from onlineUsers
    for (const [userId, sId] of onlineUsers.entries()) {
      if (sId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
    console.log('Socket disconnected:', socket.id);
  });
});

// Start server; Render provides PORT in env
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
