import express, { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePro } from '../middleware/requirePro';
import { SmsService } from '../services/smsService';

const router = Router();
const sms = new SmsService();

router.use(authenticate, requirePro);

// Assign a temporary number for the authenticated user
router.post('/assign', async (req: AuthRequest, res) => {
  try {
    if (!sms.isConfigured() && !(process.env.TWILIO_PREALLOCATED_NUMBERS || '').trim()) {
      return res.status(400).json({ error: 'Twilio is not configured and no preallocated numbers set. Provide TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN or TWILIO_PREALLOCATED_NUMBERS.' });
    }
    const { expiresInMinutes, country } = req.body || {};
    const out = await sms.assignNumber(req.user!.id, expiresInMinutes, country);
    if (!out) return res.status(400).json({ error: 'No available numbers' });
    return res.json(out);
  } catch (e: any) {
    console.error('assign error', e);
    if (e && e.reason === 'TWILIO_TEST') {
      return res.status(400).json({ error: 'Twilio test credentials cannot list or buy numbers. Either switch to live Auth Token (left panel in console) or set TWILIO_PREALLOCATED_NUMBERS with a number you already own.' });
    }
    return res.status(500).json({ error: 'Failed to assign number' });
  }
});

// List user numbers
router.get('/numbers', async (req: AuthRequest, res) => {
  try {
    const list = await sms.listUserNumbers(req.user!.id);
    return res.json(list);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list numbers' });
  }
});

// Release a number
router.delete('/numbers/:id', async (req: AuthRequest, res) => {
  try {
    const ok = await sms.releaseNumber(req.params.id, req.user!.id);
    return res.json({ success: ok });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to release number' });
  }
});

// List messages (optionally for a specific number)
router.get('/messages', async (req: AuthRequest, res) => {
  try {
    const number = (req.query.number as string) || undefined;
    const msgs = await sms.listMessages(req.user!.id, number);
    return res.json(msgs);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list messages' });
  }
});

// Public webhook for Twilio to deliver inbound SMS
router.post('/webhook/twilio', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    // Optional: verify Twilio signature
    try {
      const token = process.env.TWILIO_AUTH_TOKEN;
      const signature = req.header('X-Twilio-Signature');
      const url = (process.env.PUBLIC_BASE_URL || '') + '/api/sms/webhook/twilio';
      if (token && signature) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const twilio = require('twilio');
        const valid = twilio.validateRequest(token, signature, url, req.body);
        if (!valid) {
          console.warn('Invalid Twilio signature');
        }
      }
    } catch {}
    await sms.handleTwilioWebhook(req);
    return res.type('text/xml').send('<Response></Response>');
  } catch (e) {
    console.error('webhook error', e);
    return res.status(200).type('text/xml').send('<Response></Response>');
  }
});

export default router;
