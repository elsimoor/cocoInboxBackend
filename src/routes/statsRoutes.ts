import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { connectToDatabase } from '../db';
import EphemeralEmail from '../models/EphemeralEmail';
import SecureNote from '../models/SecureNote';
import SecureFile from '../models/SecureFile';
import TempPhoneNumber from '../models/TempPhoneNumber';

const router = Router();

router.get('/user', authenticate, async (req: AuthRequest, res) => {
  try {
    await connectToDatabase();
    const userId = req.user!.id;

    const nowIso = new Date().toISOString();
    const now = new Date();

    const [activeEmails, notesCount, filesCount, activeNumbers] = await Promise.all([
      EphemeralEmail.countDocuments({ user_id: userId, is_active: true, expires_at: { $gt: nowIso } }),
      SecureNote.countDocuments({
        user_id: userId,
        $and: [
          { $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: nowIso } }] },
          { $or: [{ auto_delete_after_read: { $ne: true } }, { has_been_read: { $ne: true } }] },
        ],
      }),
      SecureFile.countDocuments({ user_id: userId, $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: now } }] }),
      TempPhoneNumber.countDocuments({ user_id: userId, is_active: true, $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: now } }] }),
    ]);

    return res.json({
      ephemeralEmails: { activeCount: activeEmails },
      secureNotes: { activeCount: notesCount },
      secureFiles: { activeCount: filesCount },
      sms: { activeNumbers },
    });
  } catch (err) {
    console.error('stats error', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
