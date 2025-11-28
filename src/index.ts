import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import emailRoutes from './routes/emailRoutes';
import noteRoutes from './routes/noteRoutes';
import fileRoutes from './routes/fileRoutes';
import authRoutes from './routes/authRoutes';
import mailRoutes from './routes/mailRoutes';
import statsRoutes from './routes/statsRoutes';
import configRoutes from './routes/configRoutes';
import { connectToDatabase } from './db';
import { startFileCleanupJob, startNoteCleanupJob, startSmsCleanupJob, startSubscriptionEnforcementJob, enforceSubscriptionStatus } from './services/cleanupService';
import { authenticate } from './middleware/auth';
import { requirePro } from './middleware/requirePro';

dotenv.config();

async function start() {
  const app = express();
  const db = await connectToDatabase();

  app.use(cors());
  // Stripe webhook must receive the raw body for signature verification
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
  // JSON parser for the rest of the API (be sure raw is mounted BEFORE json)
  app.use(express.json());

 

  // Pro-gated services
  app.use('/api/emails', authenticate, requirePro, emailRoutes);
  app.use('/api/notes', authenticate, requirePro, noteRoutes);
  app.use('/api/files', authenticate, requirePro, fileRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/mail', mailRoutes);
  const smsRoutes = (await import('./routes/smsRoutes')).default;
  app.use('/api/sms', authenticate, requirePro, smsRoutes);
  const esimRoutes = (await import('./routes/esimRoutes')).default;
  app.use('/api/esim', authenticate, requirePro, esimRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/config', configRoutes);

  // Mount IMAP routes for reading messages from a configured mailbox. These
  // endpoints replicate the behaviour of Hi.zip and allow clients to fetch
  // inbound messages via `/api/get-all`. They use the imap-simple package
  // and environment variables MAIL_USER, MAIL_PASS, MAIL_HOST, MAIL_PORT
  // and MAIL_TLS. See src/routes/imapRoutes.ts for implementation.
  const imapRoutes = (await import('./routes/imapRoutes')).default;
  app.use('/api', imapRoutes);

  // Mount domain management routes. These endpoints allow administrators
  // to configure SMTP domains used for free email sending. See
  // backend/src/routes/domainRoutes.ts for implementation details.
  const domainRoutes = (await import('./routes/domainRoutes')).default;
  app.use('/api/domains', domainRoutes);

  // Mount admin routes for user management and system statistics
  const adminRoutes = (await import('./routes/adminRoutes')).default;
  app.use('/api/admin', adminRoutes);

  const billingRoutes = (await import('./routes/billingRoutes')).default;
  app.use('/api/billing', billingRoutes);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const port = Number(process.env.PORT) || 4000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server ready at http://0.0.0.0:${port}`);
  });

  // Start background job to remove expired / over-downloaded files
  try {
    startFileCleanupJob();
    startNoteCleanupJob();
    startSmsCleanupJob();
    // Periodically enforce subscription state (downgrade after grace)
    startSubscriptionEnforcementJob();
    // Run once immediately at startup to catch already-expired accounts
    enforceSubscriptionStatus().catch((e) => console.error('Initial subscription enforcement failed', e));
  } catch (e) {
    console.error('Failed to start cleanup job', e);
  }
}

start().catch((err) => {
  console.error('Failed to start server:', err);
});
