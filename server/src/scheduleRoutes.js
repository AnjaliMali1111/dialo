const express = require('express');
const { User, ScheduledCall } = require('./models');
const { authenticateToken } = require('./middleware');

const router = express.Router();

function cleanPhone(phone) {
  return typeof phone === 'string' ? phone.trim() : '';
}

router.post('/scheduled-calls', authenticateToken, async (req, res) => {
  try {
    const participantPhone = cleanPhone(req.body.participantPhone);
    const callType = req.body.callType === 'video' ? 'video' : 'voice';
    const scheduledAt = new Date(req.body.scheduledAt);
    const creatorPhone = req.user.phone;

    if (!participantPhone || participantPhone === creatorPhone) {
      return res.status(400).json({ success: false, message: 'Choose another participant.' });
    }
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'Choose a future date and time.' });
    }

    const participant = await User.findOne({ phone: participantPhone }).lean();
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Participant was not found.' });
    }

    const schedule = await ScheduledCall.create({
      creatorPhone,
      participantPhone,
      callType,
      scheduledAt
    });

    res.status(201).json({
      success: true,
      schedule: {
        id: schedule._id,
        creatorPhone,
        participantPhone,
        participantName: participant.name || participantPhone,
        callType,
        scheduledAt: schedule.scheduledAt,
        status: schedule.status
      }
    });
  } catch (error) {
    console.error('Error creating scheduled call:', error);
    res.status(500).json({ success: false, message: 'Failed to schedule call.' });
  }
});

router.get('/scheduled-calls', authenticateToken, async (req, res) => {
  try {
    const schedules = await ScheduledCall.find({
      $or: [{ creatorPhone: req.user.phone }, { participantPhone: req.user.phone }],
      status: 'pending',
      scheduledAt: { $gte: new Date() }
    }).sort({ scheduledAt: 1 }).lean();

    res.json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load scheduled calls.' });
  }
});

router.delete('/scheduled-calls/:id', authenticateToken, async (req, res) => {
  try {
    const schedule = await ScheduledCall.findOneAndUpdate(
      {
        _id: req.params.id,
        creatorPhone: req.user.phone,
        status: 'pending'
      },
      { status: 'cancelled' },
      { new: true }
    );

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Scheduled call not found.' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel scheduled call.' });
  }
});

module.exports = router;
