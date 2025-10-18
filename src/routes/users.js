const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const auth = require('../middleware/authMiddleware');
const createRoomId = require('../utils/roomId');

// get all users (for contact list) except self
router.get('/', auth, async (req, res) => {
   try {
    const users = await User.find({}, "_id name"); // only _id and name
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// get chat history between logged user and other user
router.get('/messages/:otherUserId', auth, async (req, res) => {
  const { otherUserId } = req.params;
  const roomId = createRoomId(req.user.id, otherUserId);
  const messages = await Message.find({ chatId: roomId }).sort({ createdAt: 1 });
  res.json(messages);
});

module.exports = router;
