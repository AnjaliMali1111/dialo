const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Conversation, Message } = require('./models');
const { authenticateToken, JWT_SECRET } = require('./middleware');

const router = express.Router();

// Helper to normalize phone numbers
function cleanPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.trim();
}

function cleanEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function internalEmailForPhone(phone) {
  return `user-${phone.replace(/\D/g, '')}@dialo.local`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = (storedHash || '').split(':');
  if (!salt || !hash) return false;
  const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derivedHash, 'hex'));
}

function createToken(user) {
  return jwt.sign(
    { userId: user._id, phone: user.phone, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    phone: user.phone,
    name: user.name || user.phone
  };
}

// Password registration
router.post('/auth/register', async (req, res) => {
  try {
    const phone = cleanPhone(req.body.phone);
    const password = req.body.password ? req.body.password.toString() : '';
    const name = req.body.name ? req.body.name.toString().trim() : '';

    if (!phone || phone.length < 4) {
      return res.status(400).json({ success: false, message: 'Please provide a valid phone number.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({ success: false, message: 'An account with that phone number already exists.' });
    }

    const user = await User.create({
      email: internalEmailForPhone(phone),
      phone,
      name,
      passwordHash: hashPassword(password)
    });
    res.status(201).json({ success: true, token: createToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Error registering user:', error);
    const message = error?.code === 11000 ? 'That email or phone number is already registered.' : 'Failed to create account.';
    res.status(500).json({ success: false, message });
  }
});

// Password login
router.post('/auth/login', async (req, res) => {
  try {
    const phone = cleanPhone(req.body.phone);
    const password = req.body.password ? req.body.password.toString() : '';

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone number and password are required.' });
    }

    const user = await User.findOne({ phone });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    res.json({ success: true, token: createToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ success: false, message: 'Failed to log in.' });
  }
});

/* Legacy OTP verification kept disabled until password migration is complete.
   Existing OTP-created users without a password can no longer log in here. */
/*
    let user = emailUser || phoneUser;
    if (!user) {
      user = await User.create({
        email,
        phone,
        name: name || `User ${email.split('@')[0]}`
      });
    } else {
      user.email = email;
      user.phone = phone;
      if (name && !user.name) {
        user.name = name;
      }
      await user.save();
    }

    await Otp.deleteOne({ _id: validOtp._id });

    const token = jwt.sign(
      { userId: user._id, phone: user.phone, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name || user.phone
      }
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    const message = error?.code === 11000
      ? 'That email or phone number is already linked to another account.'
      : 'Failed to verify OTP.';
    res.status(500).json({ success: false, message });
  }
});
*/

// 3. Get Current User info
router.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.user.phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name || user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
  }
});

// 4. Search registered users by phone number
router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const query = cleanPhone(req.query.phone);
    if (!query) {
      return res.json({ success: true, users: [] });
    }

    const myPhone = req.user.phone;
    const users = await User.find({
      phone: { $regex: query, $options: 'i', $ne: myPhone }
    }).limit(10).lean();

    res.json({
      success: true,
      users: users.map(u => ({
        id: u._id,
        phone: u.phone,
        name: u.name || u.phone
      }))
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ success: false, message: 'Error searching users.' });
  }
});

// 5. Get ongoing conversations for the logged-in user
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const myPhone = req.user.phone;
    const convos = await Conversation.find({
      participants: myPhone
    }).sort({ updatedAt: -1 }).lean();

    // Enrich conversation with peer user information
    const enriched = await Promise.all(
      convos.map(async (c) => {
        const peerPhone = c.participants.find(p => p !== myPhone) || myPhone;
        const peer = await User.findOne({ phone: peerPhone }).lean();
        return {
          id: c._id,
          peerPhone,
          peerName: peer ? (peer.name || peer.phone) : peerPhone,
          lastMessage: c.lastMessage || null,
          updatedAt: c.updatedAt
        };
      })
    );

    res.json({ success: true, conversations: enriched });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
  }
});

// 6. Start or get an existing conversation with another phone number
router.post('/conversations', authenticateToken, async (req, res) => {
  try {
    const myPhone = req.user.phone;
    const peerPhone = cleanPhone(req.body.peerPhone);

    if (!peerPhone) {
      return res.status(400).json({ success: false, message: 'Recipient phone number is required.' });
    }

    if (myPhone === peerPhone) {
      return res.status(400).json({ success: false, message: 'Cannot start conversation with yourself.' });
    }

    // Verify peer exists
    let peer = await User.findOne({ phone: peerPhone });
    if (!peer) {
      // Auto-create registered user record for peer if they don't exist yet so chat is immediately available
      peer = await User.create({
        phone: peerPhone,
        name: `User ${peerPhone.slice(-4)}`
      });
    }

    // Consistent sorted participants
    const participants = [myPhone, peerPhone].sort();

    let conversation = await Conversation.findOne({
      participants: { $all: participants, $size: 2 }
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants,
        lastMessage: {
          text: '',
          senderPhone: '',
          timestamp: new Date()
        },
        updatedAt: new Date()
      });
    }

    res.json({
      success: true,
      conversation: {
        id: conversation._id,
        peerPhone: peer.phone,
        peerName: peer.name || peer.phone,
        lastMessage: conversation.lastMessage,
        updatedAt: conversation.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ success: false, message: 'Failed to create conversation.' });
  }
});

// 7. Get message history for a conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const myPhone = req.user.phone;

    // Verify conversation exists and user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(myPhone)) {
      return res.status(403).json({ success: false, message: 'Access denied or conversation not found.' });
    }

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m._id,
        conversationId: m.conversationId,
        senderPhone: m.senderPhone,
        receiverPhone: m.receiverPhone,
        text: m.text,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
});

module.exports = router;
