import { Router } from 'express';
import { EmailService } from '../services/emailService';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const emailService = new EmailService();

router.post('/create', async (req, res) => {
  try {
    const { userId, aliasName } = req.body;
    const email = await emailService.createEphemeralEmail(userId, aliasName);

    if (!email) {
      // When the service returns null it typically means there were no
      // available freemium addresses to allocate. Respond with a 400
      // status so the client can display an appropriate message.
      return res.status(400).json({ error: 'No available email addresses. Please try again later.' });
    }

    res.json(email);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const emails = await emailService.getUserEmails(userId);
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const { userId } = req.body;
    const success = await emailService.deactivateEmail(emailId, userId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to deactivate email' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:emailId/messages', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { emailId } = req.params;
    const inboundPage = Number(req.query.inboundPage) || 1;
    const inboundLimit = Number(req.query.inboundLimit) || 10;
    const sentPage = Number(req.query.sentPage) || 1;
    const sentLimit = Number(req.query.sentLimit) || 10;
    const thread = await emailService.getEmailThread(emailId, authReq.user.id, {
      inboundPage,
      inboundLimit,
      sentPage,
      sentLimit,
    });
    if (!thread) {
      return res.status(404).json({ error: 'Email not found' });
    }
    res.json(thread);
  } catch (error) {
    console.error('Error fetching email messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
