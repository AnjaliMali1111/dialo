const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { User, Otp, Conversation, Message } = require('./models');
const { authenticateToken, JWT_SECRET } = require('./middleware');

const router = express.Router();
const smtpUser = process.env.SMTP_USER;
const smtpPassword = process.env.SMTP_APP_PASSWORD;
const emailTransporter = smtpUser && smtpPassword
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: smtpUser,
        pass: smtpPassword
      }
    })
  : null;
const emailFrom = process.env.EMAIL_FROM || smtpUser;

// Helper to normalize phone numbers
function cleanPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.trim();
}

function cleanEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// 1. Request OTP by email
router.post('/auth/request-otp', async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const phone = cleanPhone(req.body.phone);

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    if (!phone || phone.length < 4) {
      return res.status(400).json({ success: false, message: 'Please provide a valid phone number.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.deleteMany({ email });
    await Otp.create({
      email,
      phone,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    console.log(`\n========================================`);
    console.log(`📧 [Dialo OTP Generated] Email: ${email} | Phone: ${phone} | OTP: ${code}`);
    console.log(`========================================\n`);

    if (emailTransporter && emailFrom) {
      try {
        const emailResponse = await emailTransporter.sendMail({
          from: emailFrom,
          to: email,
          subject: 'Your Dialo verification code',
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
              <h2 style="margin-bottom: 12px;">Your verification code</h2>
              <p>Use the code below to verify your email and continue with Dialo.</p>
              <div style="margin: 20px 0; padding: 18px 20px; background: #f3f4f6; border-radius: 10px; font-size: 28px; letter-spacing: 6px; font-weight: bold; text-align: center;">
                ${code}
              </div>
              <p>This code expires in 10 minutes.</p>
            </div>
          `
        });

        console.log('[Gmail SMTP] OTP email sent:', emailResponse.messageId);
      } catch (emailError) {
        await Otp.deleteMany({ email });
        console.error('[Gmail SMTP Error]', emailError);
        return res.status(502).json({
          success: false,
          message: 'Unable to send the verification email. Check the Gmail SMTP configuration.'
        });
      }
    } else {
      await Otp.deleteMany({ email });
      console.error('[Email Configuration Error] SMTP_USER and SMTP_APP_PASSWORD are required.');
      return res.status(503).json({
        success: false,
        message: 'Email service is not configured.'
      });
    }

    res.json({
      success: true,
      message: 'OTP sent to your email address.',
      email,
      phone
    });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    res.status(500).json({ success: false, message: 'Failed to generate OTP.' });
  }
});

// 2. Verify OTP & Issue JWT
router.post('/auth/verify-otp', async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const phone = cleanPhone(req.body.phone);
    const code = req.body.code ? req.body.code.toString().trim() : '';
    const name = req.body.name ? req.body.name.toString().trim() : '';

    if (!email || !phone || !code) {
      return res.status(400).json({ success: false, message: 'Email, phone number, and OTP code are required.' });
    }

    const validOtp = await Otp.findOne({
      email,
      phone,
      code,
      expiresAt: { $gt: new Date() }
    });

    if (!validOtp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code.' });
    }

    const emailUser = await User.findOne({ email });
    const phoneUser = await User.findOne({ phone });

    if (emailUser && phoneUser && emailUser._id.toString() !== phoneUser._id.toString()) {
      return res.status(409).json({
        success: false,
        message: 'This email and phone number belong to different accounts. Use the matching email and phone number.'
      });
    }

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
