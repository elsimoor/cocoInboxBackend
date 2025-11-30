import nodemailer from 'nodemailer';
import mailchimpTransactional from '@mailchimp/mailchimp_transactional';
import axios from 'axios';
import { DomainService } from './domainService';
// Import IMAP client and mail parser for receiving emails via IMAP. These
// dependencies allow the application to connect to a real mailbox (e.g., GMX,
// Outlook, or another provider) and parse incoming messages. You need to
// install these packages (imapflow and mailparser) and configure IMAP_* env
// variables for this functionality to work.
// import imap-simple instead of imapflow for IMAP retrieval. imap-simple
// provides a high‑level API similar to the example in Hi.zip. See
// src/routes/imapRoutes.ts for a standalone implementation.
const imaps = require('imap-simple');
import { simpleParser } from 'mailparser';
// Import database connection and models for filtering inbound emails by user. If a
// catch‑all mailbox is used to receive forwarded messages, filtering ensures that
// each user only sees emails addressed to their active temporary addresses.
import { connectToDatabase } from '../db';
import EphemeralEmail from '../models/EphemeralEmail';

/**
 * MailService encapsulates email sending and receiving logic. For free users it
 * sends email via SMTP using nodemailer or an SMTP testing API (smtp.dev). For
 * pro users it sends email using the Mailchimp Transactional API. Receiving
 * email is implemented for the free tier via the smtp.dev API. Inbound email
 * for premium users is left as a stub.
 */
export class MailService {
  private domainService: DomainService;
  private mailchimpClient: ReturnType<typeof mailchimpTransactional> | null = null;
  constructor() {
    // Configure Mailchimp client on construction. Only runs once.
    const mailchimpApiKey = process.env.MAILCHIMP_API_KEY;
    const mailchimpServerPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
    if (mailchimpApiKey && mailchimpServerPrefix) {
      this.mailchimpClient = mailchimpTransactional(mailchimpApiKey);
    }

    // Instantiate a DomainService to manage free tier domain rotation. This
    // service handles retrieving domains from MongoDB and tracking
    // per‑domain usage counts. It is declared here so that a single
    // instance can be reused across calls to sendEmail().
    this.domainService = new DomainService();
  }

  /**
   * Send an email. Uses nodemailer for free users and Mailchimp for pro users.
   * @param user The authenticated user sending the email. The user's roles
   * determine whether to use the free SMTP route or premium Mailchimp.
   * @param message Email message parameters including to, subject, text and html.
   */
  async sendEmail(
    user: { id: string; roles?: string[] },
    message: { to: string; subject: string; text?: string; html?: string; from?: string }
  ): Promise<any> {
    const { to, subject, text, html, from } = message;
    // Determine if user is pro. If roles array contains 'pro', use Mailchimp.
    const isPro = Array.isArray(user.roles) && user.roles.includes('pro');
    if (isPro) {
      // Premium: use Mailchimp Transactional API to send email
      if (!this.mailchimpClient) {
        throw new Error('Mailchimp transactional client is not configured');
      }
      // Default to a verified sender on our Brevo domain when SENDER_EMAIL is not set.
      const fromEmail = from || process.env.SENDER_EMAIL || 'no-reply@temmail.me';
      const response = await this.mailchimpClient.messages.send({
        message: {
          from_email: fromEmail,
          subject,
          text: text || undefined,
          html: html || undefined,
          to: [{ email: to, type: 'to' }],
        },
      } as any);
      return response;
    }
    // Free tier: send email using one of the configured domains managed by
    // DomainService. The service rotates through domains based on
    // per‑domain usage limits. If all domains are exhausted, fall back to
    // any SMTP credentials defined in environment variables. Finally, if
    // smtp.dev credentials are provided, use that as a last resort.
    // 1. Attempt to find an available domain from the database
    try {
      const domain = await this.domainService.getNextAvailableDomain();
      if (domain) {
        // Create a nodemailer transport using the domain's credentials
        const transporter = nodemailer.createTransport({
          host: domain.host,
          port: domain.port,
          secure: domain.secure,
          auth: {
            user: domain.username,
            pass: domain.password,
          },
        });
        const info = await transporter.sendMail({
          from: from || domain.from,
          to,
          subject,
          text: text || undefined,
          html: html || undefined,
        });
        // Record the usage count for this domain. This updates the
        // per‑domain window and ensures the next call sees the updated
        // count.
        await this.domainService.recordUsage(domain.id);
        return info;
      }
    } catch (e) {
      // Log error but continue to fallback transports
      console.error('Error sending via configured domain:', e);
    }

    // 2. Fallback: use SMTP credentials from environment variables if provided
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USERNAME;
    const smtpPass = process.env.SMTP_PASSWORD;
    // Use the configured sender email or fall back to our Brevo domain address.
    const fromEmail = from || process.env.SENDER_EMAIL || 'no-reply@temmail.me';
    if (smtpHost && smtpPort && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      const info = await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        text: text || undefined,
        html: html || undefined,
      });
      return info;
    }

    // 3. Final fallback: use smtp.dev API if configured. Useful for
    // development/testing when no real SMTP server is available.
    const smtpDevApiKey = process.env.SMTPDEV_API_KEY;
    const smtpDevAccountId = process.env.SMTPDEV_ACCOUNT_ID;
    const smtpDevMailboxId = process.env.SMTPDEV_MAILBOX_ID;
    if (smtpDevApiKey && smtpDevAccountId && smtpDevMailboxId) {
      const response = await axios.post(
        `https://api.smtp.dev/accounts/${smtpDevAccountId}/mailboxes/${smtpDevMailboxId}/messages`,
        {
          to,
          from: fromEmail,
          subject,
          text: text || '',
          html: html || '',
        },
        {
          headers: {
            'X-API-KEY': smtpDevApiKey,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    }
    // If we reach this point, there are no configured domains or fallback
    // transports available. This typically means that all configured free
    // domains have reached their hourly send limits. Inform the caller so
    // they can advise the user to wait until the hourly window resets or
    // upgrade to the premium plan which uses Mailchimp.
    throw new Error(
      'All free tier domains have reached their hourly send limit. Please wait until the next hour or upgrade to the premium plan.'
    );
  }

  /**
   * Receive emails. For free users this fetches messages via smtp.dev API. For
   * pro users this is a stub as inbound email processing would require
   * additional setup (e.g. Mailchimp Inbound processing or IMAP). Returns an
   * array of messages or an empty array if none are available or no inbound
   * mechanism is configured.
   * @param user The authenticated user requesting messages.
   */
  async receiveEmails(user: { id: string; roles?: string[] }): Promise<any[]> {
    const isPro = Array.isArray(user.roles) && user.roles.includes('pro');
    // Pro users: inbound email via Mailchimp is not implemented in this version
    if (isPro) {
      return [];
    }
    // Attempt to fetch messages via IMAP if IMAP credentials are provided.
    // Many forwarding providers (like ImprovMX) simply forward emails to a real
    // mailbox. By connecting to that mailbox over IMAP, we can retrieve
    // messages for display in the web UI. Set the following environment
    // variables in your .env file to enable this: IMAP_HOST, IMAP_PORT,
    // IMAP_USERNAME, IMAP_PASSWORD. IMAP_PORT should be 993 for secure
    // connections or 143 for STARTTLS. If these variables are not set or the
    // connection fails, the method falls back to smtp.dev below.
    // When MAIL_* variables are provided, fetch messages from that mailbox using
    // imap-simple. This mirrors the Hi.zip implementation and avoids
    // dependence on imapflow. The mailbox acts as a catch‑all inbox for
    // temporary addresses.
    const mailUser = process.env.MAIL_USER;
    const mailPass = process.env.MAIL_PASS;
    const mailHost = process.env.MAIL_HOST;
    const mailPort = process.env.MAIL_PORT;
    const mailTls = process.env.MAIL_TLS;
    if (mailUser && mailPass && mailHost && mailPort) {
      try {
        const imapConfig = {
          imap: {
            user: mailUser,
            password: mailPass,
            host: mailHost,
            port: parseInt(mailPort as string, 10),
            tls: mailTls !== 'false',
            authTimeout: 3000,
          },
        };
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');
        const searchCriteria = ['ALL'];
        const fetchOptions = {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
          struct: true,
        };
        const results = await connection.search(searchCriteria, fetchOptions);
        const rawMessages = await Promise.all(
          results.map(async (item: any) => {
            const all = item.parts.find((part: any) => part.which === 'TEXT') || { body: '' };
            const parsed = await simpleParser(all.body || '');
            return {
              uid: item.attributes && item.attributes.uid,
              from: parsed.from ? parsed.from.text : '',
              // @ts-ignore
              to: parsed.to ? parsed.to.text : '',
              subject: parsed.subject || '',
              date: parsed.date,
              text: parsed.text ? parsed.text.toString() : '',
              html: parsed.html || '',
            };
          })
        );
        await connection.end();
        // If the user has active temporary addresses in MongoDB, filter the
        // messages to only include those addressed to one of them. If no
        // active addresses exist, return an empty list. Otherwise return
        // the filtered messages.
        try {
          await connectToDatabase();
          const userEmails = await EphemeralEmail.find({ user_id: user.id, is_active: true }).lean();
          const activeAddresses = userEmails.map((e: any) => (e.email_address || '').toLowerCase());
          if (activeAddresses.length === 0) {
            return [];
          }
          const filtered = rawMessages.filter((m: any) => {
            const toField = (m.to || '').toLowerCase();
            return activeAddresses.some((addr: string) => toField.includes(addr));
          });
          return filtered;
        } catch (filterErr) {
          console.error('Error filtering IMAP messages:', filterErr);
          return rawMessages;
        }
      } catch (err) {
        console.error('Error fetching emails via IMAP:', err);
      }
    }
    // Free users: use smtp.dev API to fetch inbox messages. This allows
    // developers to test sending/receiving without a real mailbox. To use
    // smtp.dev, sign up for an account at smtp.dev and set SMTPDEV_API_KEY,
    // SMTPDEV_ACCOUNT_ID and SMTPDEV_MAILBOX_ID in your environment.
    const smtpDevApiKey = process.env.SMTPDEV_API_KEY;
    const smtpDevAccountId = process.env.SMTPDEV_ACCOUNT_ID;
    const smtpDevMailboxId = process.env.SMTPDEV_MAILBOX_ID;
    if (smtpDevApiKey && smtpDevAccountId && smtpDevMailboxId) {
      const response = await axios.get(
        `https://api.smtp.dev/accounts/${smtpDevAccountId}/mailboxes/${smtpDevMailboxId}/messages`,
        {
          headers: {
            'X-API-KEY': smtpDevApiKey,
            Accept: 'application/json',
          },
        }
      );
      // Filter the list of message resources to only include messages addressed to the
      // user's active email addresses. If filtering fails or no active addresses are
      // found, return an empty array to avoid showing unrelated messages.
      try {
        const allMessages = response.data.member || [];
        await connectToDatabase();
        const userEmails = await EphemeralEmail.find({ user_id: user.id, is_active: true }).lean();
        const activeAddresses = userEmails.map((e: any) => (e.email_address || '').toLowerCase());
        if (activeAddresses.length === 0) {
          return [];
        }
        return allMessages.filter((msg: any) => {
          // smtp.dev returns message objects with a `to` field that may be a string or array.
          const toValue = msg.to || msg.recipient || '';
          let toField = '';
          if (Array.isArray(toValue)) {
            toField = toValue.join(',');
          } else if (typeof toValue === 'object' && toValue !== null) {
            // Some APIs return objects like { address: 'example@temmail.me', name: '' }
            toField = toValue.address || toValue.email || '';
          } else {
            toField = String(toValue);
          }
          toField = toField.toLowerCase();
          return activeAddresses.some((addr: string) => toField.includes(addr));
        });
      } catch (filterErr) {
        console.error('Error filtering smtp.dev messages:', filterErr);
        return response.data.member || [];
      }
    }
    // If neither IMAP nor smtp.dev are configured, return an empty array.
    return [];
  }
}
