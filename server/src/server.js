const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');  
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { User, Conversation, Message, ScheduledCall } = require('./models');
const authRoutes = require('./authRoutes');
const scheduleRoutes = require('./scheduleRoutes');

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
app.use('/api', scheduleRoutes);

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
const callRoomMembers = new Map(); // roomId -> Set of phones in call
const phoneToCallRoom = new Map(); // phone -> roomId
const MAX_CALL_PARTICIPANTS = 4;

const addCallRoomMember = (roomId, phone) => {
  if (!roomId || !phone) return [];
  const cleanPhone = phone.trim();
  const members = callRoomMembers.get(roomId) || new Set();
  members.add(cleanPhone);
  callRoomMembers.set(roomId, members);
  phoneToCallRoom.set(cleanPhone, roomId);
  io.in(`phone:${cleanPhone}`).socketsJoin(`call:${roomId}`);
  return [...members];
};

const removeCallRoomMember = (roomId, phone) => {
  if (!phone) return;
  const cleanPhone = phone.trim();
  const targetRoomId = roomId || phoneToCallRoom.get(cleanPhone);
  if (!targetRoomId) return;

  const members = callRoomMembers.get(targetRoomId);
  if (members) {
    members.delete(cleanPhone);
    if (members.size === 0) {
      callRoomMembers.delete(targetRoomId);
    }
  }

  if (phoneToCallRoom.get(cleanPhone) === targetRoomId) {
    phoneToCallRoom.delete(cleanPhone);
  }
  io.in(`phone:${cleanPhone}`).socketsLeave(`call:${targetRoomId}`);

  const remainingMembers = members ? [...members] : [];
  io.to(`call:${targetRoomId}`).emit('call-participant-left', {
    phone: cleanPhone,
    roomId: targetRoomId,
    roomMembers: remainingMembers
  });
};

const broadcastCallRoomMembers = (roomId) => {
  const roomMembers = [...(callRoomMembers.get(roomId) || [])];
  io.to(`call:${roomId}`).emit('call-room-members', {
    roomId,
    roomMembers
  });
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
  socket.on('call-user', async ({ toPhone, offer, callType, roomId, fromPhone: clientFromPhone, fromName }) => {
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

    // Check if recipient is busy in a DIFFERENT call room
    const existingTargetRoom = phoneToCallRoom.get(cleanToPhone);
    const existingCallerRoom = phoneToCallRoom.get(cleanFromPhone);
    const activeRoomId = existingCallerRoom || roomId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());

    const activeMembers = callRoomMembers.get(activeRoomId) || new Set();
    if (activeMembers.size >= MAX_CALL_PARTICIPANTS && !activeMembers.has(cleanToPhone)) {
      socket.emit('call-failed', {
        reason: 'full',
        toPhone: cleanToPhone,
        message: 'This call already has four participants.'
      });
      return;
    }

    if (existingTargetRoom && existingTargetRoom !== activeRoomId) {
      socket.emit('call-failed', {
        reason: 'busy',
        toPhone: cleanToPhone,
        message: `${cleanToPhone} is currently busy on another call.`
      });
      return;
    }

    // Add caller to room (callee is added ONLY when they answer!)
    addCallRoomMember(activeRoomId, cleanFromPhone);
    const currentMembers = [...(callRoomMembers.get(activeRoomId) || [])];

    const callerUser = await User.findOne({ phone: cleanFromPhone }).lean();
    const callerName = fromName || (callerUser ? (callerUser.name || cleanFromPhone) : cleanFromPhone);

    console.log(`[WebRTC Call] ${cleanFromPhone} (${callerName}) calling ${cleanToPhone} [Type: ${callType}] in Room: ${activeRoomId}`);

    io.to(`phone:${cleanToPhone}`).emit('incoming-call', {
      fromPhone: cleanFromPhone,
      callerName,
      offer,
      callType: callType || 'voice',
      roomId: activeRoomId,
      roomMembers: currentMembers
    });
  });

  // 4. Answer incoming call
  socket.on('answer-call', ({ toPhone, answer, roomId, fromName, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    const cleanToPhone = toPhone ? toPhone.trim() : null;
    const cleanFromPhone = fromPhone ? fromPhone.trim() : null;
    if (!cleanFromPhone) return;

    const targetRoomId = roomId || phoneToCallRoom.get(cleanToPhone) || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
    const roomMembers = addCallRoomMember(targetRoomId, cleanFromPhone);
    console.log(`[WebRTC Answered] ${cleanFromPhone} answered call for room ${targetRoomId}. Members:`, roomMembers);

    if (cleanToPhone) {
      io.to(`phone:${cleanToPhone}`).emit('call-accepted', {
        fromPhone: cleanFromPhone,
        participantName: fromName || cleanFromPhone,
        answer,
        roomId: targetRoomId,
        roomMembers
      });
    }

    socket.emit('call-room-members', {
      roomId: targetRoomId,
      roomMembers
    });

    // Broadcast to existing room members that new participant joined
    socket.to(`call:${targetRoomId}`).emit('call-participant-joined', {
      phone: cleanFromPhone,
      participantName: fromName || cleanFromPhone,
      roomId: targetRoomId,
      roomMembers
    });
    broadcastCallRoomMembers(targetRoomId);
  });

  // 5. Reject incoming call
  socket.on('reject-call', ({ toPhone, roomId, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    const cleanToPhone = toPhone ? toPhone.trim() : null;
    const cleanFromPhone = fromPhone ? fromPhone.trim() : null;
    console.log(`[WebRTC Rejected] ${cleanFromPhone} rejected call from ${cleanToPhone}`);

    if (cleanToPhone) {
      io.to(`phone:${cleanToPhone}`).emit('call-rejected', {
        fromPhone: cleanFromPhone
      });
    }
    if (cleanFromPhone) {
      removeCallRoomMember(roomId, cleanFromPhone);
    }
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

  // 7. End Call / Leave Call
  const handleLeaveCall = ({ toPhone, roomId, fromPhone: clientFromPhone }) => {
    const fromPhone = socketToPhone.get(socket.id) || clientFromPhone;
    const cleanToPhone = toPhone ? toPhone.trim() : null;
    const cleanFromPhone = fromPhone ? fromPhone.trim() : null;
    console.log(`[WebRTC Call Left/Ended] ${cleanFromPhone} left call room ${roomId}`);

    if (cleanToPhone) {
      io.to(`phone:${cleanToPhone}`).emit('call-ended', {
        fromPhone: cleanFromPhone,
        roomId: roomId || null
      });
    }
    if (cleanFromPhone) {
      removeCallRoomMember(roomId, cleanFromPhone);
    }
  };

  socket.on('end-call', handleLeaveCall);
  socket.on('leave-call', handleLeaveCall);

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
        if (members.has(phone)) {
          removeCallRoomMember(roomId, phone);
        }
      }
      if (phoneToCallRoom.has(phone)) {
        phoneToCallRoom.delete(phone);
      }
      const room = io.sockets.adapter.rooms.get(`phone:${phone}`);
      console.log(`[Dialo Offline] ${phone} socket ${socket.id} closed. Remaining active: ${room ? room.size : 0}`);
    }
  });
});

async function notifyDueScheduledCalls() {
  try {
    const now = new Date();
    let schedule = await ScheduledCall.findOneAndUpdate(
      { status: 'pending', scheduledAt: { $lte: now } },
      { status: 'notified' },
      { sort: { scheduledAt: 1 }, new: true }
    ).lean();

    while (schedule) {
      const creator = await User.findOne({ phone: schedule.creatorPhone }).lean();
      const participant = await User.findOne({ phone: schedule.participantPhone }).lean();
      const payload = {
        scheduleId: schedule._id,
        callType: schedule.callType,
        scheduledAt: schedule.scheduledAt,
        creatorPhone: schedule.creatorPhone,
        creatorName: creator?.name || schedule.creatorPhone,
        participantPhone: schedule.participantPhone,
        participantName: participant?.name || schedule.participantPhone
      };

      io.to(`phone:${schedule.creatorPhone}`).emit('scheduled-call-due', payload);
      io.to(`phone:${schedule.participantPhone}`).emit('scheduled-call-due', payload);

      schedule = await ScheduledCall.findOneAndUpdate(
        { status: 'pending', scheduledAt: { $lte: new Date() } },
        { status: 'notified' },
        { sort: { scheduledAt: 1 }, new: true }
      ).lean();
    }
  } catch (error) {
    console.error('Error notifying scheduled calls:', error);
  }
}

const scheduledCallTimer = setInterval(notifyDueScheduledCalls, 5000);
scheduledCallTimer.unref?.();

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