const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    trim: true,
    default: ''
  },
  passwordHash: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// OTP Schema (with auto-expiring TTL index after 10 minutes)
const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  phone: {
    type: String,
    trim: true,
    default: '',
    index: true
  },
  code: {
    type: String,
    required: true,
    trim: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index: document deletes automatically when expiresAt <= now
  }
});

// Conversation Schema (One-to-One)
const conversationSchema = new mongoose.Schema({
  participants: [{
    type: String,
    required: true,
    trim: true
  }],
  lastMessage: {
    text: { type: String, default: '' },
    senderPhone: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Message Schema
const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderPhone: {
    type: String,
    required: true,
    trim: true
  },
  receiverPhone: {
    type: String,
    required: true,
    trim: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const User = mongoose.model('User', userSchema);
const Otp = mongoose.model('Otp', otpSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = {
  User,
  Otp,
  Conversation,
  Message
};
