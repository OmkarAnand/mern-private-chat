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

const allowedOrigins = [
  'https://mern-private-chat-frontend.vercel.app',
  'https://mern-private-chat-frontend-l6d9456hb-omkar-anands-projects.vercel.app'
];

app.use(cors({
  // origin: function(origin, callback) {
  //   if (!origin || allowedOrigins.includes(origin)) callback(null, true);
  //   else callback(new Error('Not allowed by CORS'));
  // },
  origin:allowedOrigins,
  methods: ["GET","POST","PUT","DELETE"],
  credentials: true
}));
app.use(express.json());

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Connect MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET","POST"],
    credentials:true
  }
});

let onlineUsers = new Map();

// Middleware to authenticate socket
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.userId);

  // Add user to online list
  onlineUsers.set(socket.userId, socket.id);

  // Send updated online users to all clients
  io.emit('onlineUsers', Array.from(onlineUsers.keys()));

  // Listen for private messages
  socket.on('privateMessage', async ({ senderId, receiverId, message }) => {
    const roomId = createRoomId(senderId, receiverId);
    
    // Save to DB
    const msg = new Message({
      chatId: roomId,
      senderId,
      receiverId,
      text: message
    });
    await msg.save();

    // Emit to receiver
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receivePrivateMessage', { senderId, message });
    }

    // Also emit to sender (optional)
    socket.emit('receivePrivateMessage', { senderId, message });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.userId);
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
    console.log('User disconnected:', socket.userId);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
