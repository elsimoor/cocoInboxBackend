import { Router } from 'express';
import { MailService } from '../services/mailService';
import SentEmail from '../models/SentEmail';
import EphemeralEmail from '../models/EphemeralEmail';
import { authenticate } from '../middleware/auth';

// Routes for sending and receiving email through external services. Free users
// send via SMTP/smtp.dev and premium users send via Mailchimp. Inbox
// retrieval is implemented for free users via smtp.dev API; premium inbound
// email is not implemented.

const router = Router();
const mailService = new MailService();

// Send an email on behalf of the authenticated user. Requires the user to be
// authenticated via JWT (middleware/auth). Body should include `to` and
// `subject` fields, and optionally `text` and `html`.
router.post('/send', authenticate, async (req, res) => {
  try {
    const { to, subject, text, html, fromEmailId } = req.body;
    if (!to || !subject) {
      return res.status(400).json({ error: 'Recipient and subject are required' });
    }
    // The authenticate middleware attaches the decoded user object to req.user
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let fromEmail = process.env.SENDER_EMAIL || 'no-reply@temmail.me';
    let emailId: string | undefined;
    if (fromEmailId) {
      const emailDoc = await EphemeralEmail.findOne({ _id: fromEmailId, user_id: user.id, is_active: true });
      if (!emailDoc) {
        return res.status(400).json({ error: 'Invalid from email' });
      }
      fromEmail = emailDoc.email_address;
      emailId = emailDoc.id;
    }
    const result = await mailService.sendEmail(user, { to, subject, text, html, from: fromEmail });
    try {
      await SentEmail.create({ user_id: user.id, from: fromEmail, to, subject, text, html, email_id: emailId });
    } catch (persistErr) {
      console.error('Failed to persist sent email:', persistErr);
    }
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

// Retrieve inbox messages for the authenticated user. Only implemented for
// free tier via smtp.dev. The returned array contains message metadata.
router.get('/inbox', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const messages = await mailService.receiveEmails(user);
    return res.json(messages);
  } catch (error: any) {
    console.error('Error fetching inbox messages:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch messages' });
  }
});

// List sent emails by the authenticated user
router.get('/sent', authenticate, async (req, res) => {
  try {
    const user = (req as any).user
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const items = await SentEmail.find({ user_id: user.id }).sort({ sent_at: -1 }).lean()
    return res.json(items)
  } catch (e: any) {
    console.error('Error fetching sent emails:', e)
    return res.status(500).json({ error: e.message || 'Failed to fetch sent emails' })
  }
})

export default router;
