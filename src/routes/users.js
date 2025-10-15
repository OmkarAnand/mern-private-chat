const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const auth = require('../middleware/authMiddleware');
const createRoomId = require('../utils/roomId');

// get all users (for contact list) except self
router.get('/', auth, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.id } }).select('_id name email');
  res.json(users);
});

// get chat history between logged user and other user
router.get('/messages/:otherUserId', auth, async (req, res) => {
  const { otherUserId } = req.params;
  const roomId = createRoomId(req.user.id, otherUserId);
  const messages = await Message.find({ chatId: roomId }).sort({ createdAt: 1 });
  res.json(messages);
});

module.exports = router;
