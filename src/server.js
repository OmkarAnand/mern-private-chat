require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const Message = require('./models/Message');
const createRoomId = require('./utils/roomId');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Connect DB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

let onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("userConnected", (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit("onlineUsers", Array.from(onlineUsers.keys())); // send all online users
    console.log("✅ User online:", userId);
  });

  socket.on("privateMessage", ({ senderId, receiverId, message }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receivePrivateMessage", { senderId, message });
      console.log(`📩 Message from ${senderId} to ${receiverId}: ${message}`);
    }
  });

  socket.on("disconnect", () => {
    for (let [key, value] of onlineUsers.entries()) {
      if (value === socket.id) {
        onlineUsers.delete(key);
        break;
      }
    }
    io.emit("onlineUsers", Array.from(onlineUsers.keys()));
  });
});

// Middleware to authenticate socket using token
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', socket => {
  console.log('Socket connected:', socket.userId);
  socket.join(socket.userId); // join personal room

  socket.on('join_private', ({ otherUserId }) => {
    const roomId = createRoomId(socket.userId, otherUserId);
    socket.join(roomId);
  });

  socket.on('private_message', async ({ otherUserId, text }) => {
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
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        text: msg.text,
        createdAt: msg.createdAt
      });
    } catch (err) {
      console.error('Error saving message', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected', socket.userId);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
