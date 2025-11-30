import express, { Router } from 'express';
import { connectToDatabase } from '../db';
import EphemeralEmail from '../models/EphemeralEmail';
import InboundEmail from '../models/InboundEmail';

const router = Router();

// Mailchimp transactional (Mandrill) sends inbound events as
// application/x-www-form-urlencoded with the payload stored in
// `mandrill_events`. Enable urlencoded parsing for this router only so the
// global JSON body parser remains unaffected.
router.use(express.urlencoded({ extended: true }));

const normalizeAddresses = (msg: any): string[] => {
  const recipients: string[] = [];
  if (msg?.email) {
    recipients.push(String(msg.email));
  }
  if (Array.isArray(msg?.to)) {
    for (const entry of msg.to) {
      if (Array.isArray(entry) && entry.length > 0) {
        recipients.push(String(entry[0]));
      } else if (typeof entry === 'string') {
        recipients.push(entry);
      }
    }
  }
  return [...new Set(recipients.filter(Boolean).map((addr) => addr.toLowerCase()))];
};

const extractAttachments = (msg: any) => {
  if (!msg || typeof msg.attachments !== 'object') {
    return [];
  }
  return Object.values(msg.attachments).map((attachment: any) => ({
    filename: attachment?.name || attachment?.filename,
    size: typeof attachment?.size === 'number' ? attachment.size : undefined,
    contentType: attachment?.type,
  }));
};

router.post('/inbound', async (req, res) => {
  try {
    const rawEvents = req.body?.mandrill_events;
    if (!rawEvents) {
      console.warn('Mailchimp inbound payload missing mandrill_events');
      return res.json({ ok: true });
    }
    let events: any[] = [];
    try {
      events = JSON.parse(rawEvents);
      if (!Array.isArray(events)) {
        events = [];
      }
    } catch (parseErr) {
      console.error('Failed to parse Mailchimp inbound events:', parseErr);
      return res.json({ ok: false });
    }
    if (events.length === 0) {
      return res.json({ ok: true });
    }
    await connectToDatabase();
    let processed = 0;
    for (const event of events) {
      if (event?.event && event.event !== 'inbound') {
        continue;
      }
      const msg = event?.msg || {};
      const recipients = normalizeAddresses(msg);
      if (recipients.length === 0) {
        continue;
      }
      const matching = await EphemeralEmail.find({
        email_address: { $in: recipients },
        is_active: true,
      })
        .collation({ locale: 'en', strength: 2 })
        .lean();
      if (!matching || matching.length === 0) {
        continue;
      }
      const attachments = extractAttachments(msg);
      const messageId = msg?._id || event?._id || event?.ts?.toString() || `${Date.now()}-${Math.random()}`;
      const fromAddress = msg?.from_email || msg?.from || (msg?.headers && msg.headers.from) || 'unknown@unknown.test';
      for (const emailDoc of matching) {
        const now = new Date().toISOString();
        try {
          await InboundEmail.updateOne(
            { message_id: messageId, email_id: emailDoc._id.toString() },
            {
              $setOnInsert: {
                user_id: emailDoc.user_id,
                email_id: emailDoc._id.toString(),
                email_address: (emailDoc.email_address || '').toLowerCase(),
                from: fromAddress,
                subject: msg?.subject || '',
                text: msg?.text || msg?.['stripped-text'] || '',
                html: msg?.html || msg?.['stripped-html'] || '',
                attachments,
                received_at: now,
                provider: 'mailchimp',
                raw_event: event,
              },
            },
            { upsert: true }
          );
          processed += 1;
        } catch (err) {
          console.error('Failed to persist inbound email:', err);
        }
      }
    }
    res.json({ ok: true, processed });
  } catch (error) {
    console.error('Mailchimp inbound handler error:', error);
    res.status(500).json({ error: 'Failed to process inbound events' });
  }
});

export default router;
