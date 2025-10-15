const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  chatId: { type: String, required: true }, // unique room id between two users
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
