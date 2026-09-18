const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');  
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { User, Conversation, Message } = require('./models');
const authRoutes = require('./authRoutes');

const app = express();
const keyPath = path.join(__dirname, '..', '..', 'client', 'localhost+2-key.pem');
const certPath = path.join(__dirname, '..', '..', 'client', 'localhost+2.pem');
const hasLocalCertificates = fs.existsSync(keyPath) && fs.existsSync(certPath);
const useHttps = process.env.NODE_ENV !== 'production' && hasLocalCertificates;
const server = useHttps
  ? https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }, app)
  : http.createServer(app);

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dialo_chat';
const CLIENT_URL = process.env.CLIENT_URL || '*';

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json());

// API Routes
app.use('/api', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    appName: 'Dialo - 1-on-1 Realtime Chat & Calls',
    mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST', 'OPTIONS']
  }
});

// Mapping socketId -> phone
const socketToPhone = new Map();
const callRoomMembers = new Map();
const phoneToCallRoom = new Map();

const addCallRoomMember = (roomId, phone) => {
  if (!roomId || !phone) return [];
  const members = callRoomMembers.get(roomId) || new Set();
  members.add(phone);
  callRoomMembers.set(roomId, members);
  phoneToCallRoom.set(phone, roomId);
  io.in(`phone:${phone}`).socketsJoin(`call:${roomId}`);
  return [...members];
};

const removeCallRoomMember = (roomId, phone) => {
  const members = callRoomMembers.get(roomId);
  if (!members || !members.has(phone)) return;

  members.delete(phone);
  if (phoneToCallRoom.get(phone) === roomId) phoneToCallRoom.delete(phone);
  io.in(`phone:${phone}`).socketsLeave(`call:${roomId}`);

  const remainingMembers = [...members];
  io.to(`call:${roomId}`).emit('call-participant-left', {
    phone,
    roomId,
    roomMembers: remainingMembers
  });

  if (members.size === 0) callRoomMembers.delete(roomId);
};

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. User registers their phone number on socket
  socket.on('register-user', ({ phone }) => {
    if (!phone) return;
    const cleanPhone = phone.trim();

    socketToPhone.set(socket.id, cleanPhone);
    socket.join(`phone:${cleanPhone}`);

    const room = io.sockets.adapter.rooms.get(`phone:${cleanPhone}`);
    console.log(`[Dialo Online] ${cleanPhone} registered on socket ${socket.id} (active sockets: ${room ? room.size : 1})`);
  });

  // 2. Real-time text messaging
  socket.on('send-message', async ({ conversationId, toPhone, text }) => {
    try {
      const fromPhone = socketToPhone.get(socket.id);
      if (!fromPhone || !toPhone || !text || !conversationId) return;

      const cleanToPhone = toPhone.trim();
      const cleanText = text.trim();

      // Persist message in MongoDB
      const message = await Message.create({
        conversationId,
        senderPhone: fromPhone,
        receiverPhone: cleanToPhone,
        text: cleanText,
        createdAt: new Date()
      });

      // Update Conversation's lastMessage and updatedAt
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
          text: cleanText,
          senderPhone: fromPhone,
          timestamp: message.createdAt
        },
        updatedAt: message.createdAt
      });

      const messagePayload = {
        id: message._id,
        conversationId: message.conversationId,
        senderPhone: message.senderPhone,
        receiverPhone: message.receiverPhone,
        text: message.text,
        createdAt: message.createdAt
      };

      // Deliver to recipient's room
      io.to(`phone:${cleanToPhone}`).emit('receive-message', messagePayload);

      // Confirm to sender
      socket.emit('message-sent', messagePayload);

      console.log(`[Message Saved & Sent] ${fromPhone} -> ${cleanToPhone}: "${cleanText.substring(0, 30)}"`);
    } catch (err) {
      console.error('Error handling send-message:', err);
      socket.emit('message-error', { message: 'Failed to send message.' });
    }
  });

  // --- WebRTC Signaling (Voice & Video) ---

  // 3. Initiate call (Voice or Video)
  socket.on('call-user', async ({ toPhone, offer, callType, roomId, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    if (!fromPhone || !toPhone) return;

    const cleanToPhone = toPhone.trim();
    const cleanFromPhone = fromPhone.trim();

    // Check if recipient has active sockets in room
    const room = io.sockets.adapter.rooms.get(`phone:${cleanToPhone}`);
    const isOnline = room && room.size > 0;

    if (!isOnline) {
      socket.emit('call-failed', {
        reason: 'offline',
        toPhone: cleanToPhone,
        message: `${cleanToPhone} is currently offline.`
      });
      return;
    }

    const activeRoomId = phoneToCallRoom.get(cleanFromPhone) || roomId;
    addCallRoomMember(activeRoomId, cleanFromPhone);
    const roomMembers = addCallRoomMember(activeRoomId, cleanToPhone);

    const callerUser = await User.findOne({ phone: cleanFromPhone }).lean();
    const callerName = callerUser ? (callerUser.name || cleanFromPhone) : cleanFromPhone;

    console.log(`[WebRTC Call] ${cleanFromPhone} (${callerName}) calling ${cleanToPhone} [Type: ${callType}] | Recipient online: ${isOnline}`);

    io.to(`phone:${cleanToPhone}`).emit('incoming-call', {
      fromPhone: cleanFromPhone,
      callerName,
      offer,
      callType: callType || 'voice',
      roomId: activeRoomId || null,
      roomMembers
    });
  });

  // 4. Answer incoming call
  socket.on('answer-call', ({ toPhone, answer, roomId, fromName, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    const cleanToPhone = toPhone ? toPhone.trim() : null;
    const roomMembers = addCallRoomMember(roomId, fromPhone);
    console.log(`[WebRTC Answered] ${fromPhone} answered call from ${cleanToPhone}`);

    if (cleanToPhone) {
      io.to(`phone:${cleanToPhone}`).emit('call-accepted', {
        fromPhone,
        participantName: fromName || fromPhone,
        answer,
        roomId: roomId || null,
        roomMembers
      });

      if (roomId) {
        io.to(`call:${roomId}`).emit('call-participant-joined', {
          phone: fromPhone,
          participantName: fromName || fromPhone,
          roomId,
          roomMembers
        });
      }
    }
  });

  // 5. Reject incoming call
  socket.on('reject-call', ({ toPhone, roomId, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    const cleanToPhone = toPhone ? toPhone.trim() : null;
    console.log(`[WebRTC Rejected] ${fromPhone} rejected call from ${cleanToPhone}`);

    if (cleanToPhone) {
      io.to(`phone:${cleanToPhone}`).emit('call-rejected', {
        fromPhone
      });
    }
    removeCallRoomMember(roomId || phoneToCallRoom.get(fromPhone), fromPhone);
  });

  // 6. ICE Candidate exchange
  socket.on('ice-candidate', ({ toPhone, candidate, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    if (toPhone && candidate) {
      io.to(`phone:${toPhone.trim()}`).emit('ice-candidate', {
        fromPhone,
        candidate
      });
    }
  });

  // 7. End Call
  socket.on('end-call', ({ toPhone, roomId, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    const cleanToPhone = toPhone ? toPhone.trim() : null;
    console.log(`[WebRTC Call Ended] ${fromPhone} ended call with ${cleanToPhone}`);

    if (cleanToPhone) {
      io.to(`phone:${cleanToPhone}`).emit('call-ended', {
        fromPhone,
        roomId: roomId || null
      });
    }
    removeCallRoomMember(roomId, fromPhone);
  });

  // 8. Toggle Media state (mute mic or toggle camera)
  socket.on('toggle-media', ({ toPhone, type, enabled, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    if (toPhone) {
      io.to(`phone:${toPhone.trim()}`).emit('peer-media-toggled', {
        fromPhone,
        type,
        enabled
      });
    }
  });

  // 9. Disconnect cleanup
  socket.on('disconnect', () => {
    const phone = socketToPhone.get(socket.id);
    if (phone) {
      socketToPhone.delete(socket.id);
      for (const [roomId, members] of callRoomMembers) {
        if (members.has(phone)) removeCallRoomMember(roomId, phone);
      }
      const room = io.sockets.adapter.rooms.get(`phone:${phone}`);
      console.log(`[Dialo Offline] ${phone} socket ${socket.id} closed. Remaining active: ${room ? room.size : 0}`);
    }
  });
});

// Connect to MongoDB and start HTTP server
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('\n Connected to MongoDB');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(` Dialo Backend Server running on ${useHttps ? 'https' : 'http'}://0.0.0.0:${PORT}`);
      console.log(` Realtime Socket.IO & WebRTC Signaling active!\n`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });