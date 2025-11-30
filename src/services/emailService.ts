import mailchimpTransactional from '@mailchimp/mailchimp_transactional';
import { EphemeralEmail as EphemeralEmailType } from '../types';
import EphemeralEmail, { IEphemeralEmail } from '../models/EphemeralEmail';
import InboundEmail from '../models/InboundEmail';
import SentEmail from '../models/SentEmail';
import { connectToDatabase } from '../db';
import { DomainService } from './domainService';
import { randomBytes } from 'crypto';

export class EmailService {
  /**
   * The DomainService instance used to lookup configured SMTP domains. This is
   * lazily constructed so that the DomainService and its underlying MongoDB
   * connection are only initialized if needed. Since this service is only
   * required when generating a new temporary address, instantiating it here
   * avoids adding a dependency on DomainService in places that only fetch
   * existing emails.
   */
  private domainService: DomainService | null = null;
  private mailchimpClient: ReturnType<typeof mailchimpTransactional> | null = null;
  private mailchimpInboundDomain: string | null = process.env.MAILCHIMP_INBOUND_DOMAIN || null;

  constructor() {
    if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_SERVER_PREFIX) {
      this.mailchimpClient = mailchimpTransactional(process.env.MAILCHIMP_API_KEY);
    }
  }

  async createEphemeralEmail(userId: string, aliasName?: string): Promise<EphemeralEmailType | null> {
    try {
      await connectToDatabase();
      const premiumEmail = await this.createMailchimpEphemeralEmail(userId, aliasName);
      if (premiumEmail) {
        return premiumEmail;
      }
      // Check if a list of freemium email addresses has been configured via
      // environment variable. When FREEMIUM_EMAILS is defined, it should
      // contain a comma‑separated list of fully qualified email addresses.
      // These addresses represent fixed mailboxes that free users can
      // temporarily claim for receiving email. If the list is present and
      // non‑empty, we allocate from it rather than generating a random
      // address. Once an address is assigned to a user, it remains
      // unavailable until deactivated or expired.
      const configured = (process.env.FREEMIUM_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@'));
      if (configured.length > 0) {
        // Find which of the configured addresses are currently in use
        const usedDocs = await EphemeralEmail.find({
          email_address: { $in: configured },
          is_active: true,
        }).lean();
        const usedSet = new Set<string>(usedDocs.map((doc: any) => doc.email_address.toLowerCase()));
        // Determine the first unused address
        const available = configured.find((addr) => !usedSet.has(addr));
        if (!available) {
          // No free addresses remain; return null to indicate failure
          return null;
        }
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const doc = {
          user_id: userId,
          email_address: available,
          alias_name: aliasName,
          expires_at: expiresAt,
        };
        const createdEmail = await EphemeralEmail.create(doc);
        const { _id, __v, ...emailFields } = createdEmail.toObject();
        return { id: createdEmail.id, ...emailFields } as EphemeralEmailType;
      }
      // If no freemium list is configured, fall back to the existing random
      // address logic. Select a domain for the free tier. If SMTP domains are
      // configured in the database, derive the domain portion from the
      // `from` address on one of those entries. If no domains exist, derive
      // from SENDER_EMAIL or default to temmail.me.
      let domain = 'temmail.me';
      const isValidDomain = (d: string): boolean => {
        return /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(d.trim());
      };
      const senderEmail = process.env.SENDER_EMAIL;
      if (senderEmail && senderEmail.includes('@')) {
        const parts = senderEmail.split('@');
        if (parts.length === 2 && isValidDomain(parts[1])) {
          domain = parts[1].trim().toLowerCase();
        }
      }
      try {
        if (!this.domainService) {
          this.domainService = new DomainService();
        }
        const domains = await this.domainService.getDomains();
        if (domains && domains.length > 0) {
          const first = domains[0];
          if (typeof first.from === 'string' && first.from.includes('@')) {
            const parts = first.from.split('@');
            if (parts.length === 2 && isValidDomain(parts[1])) {
              domain = parts[1].trim().toLowerCase();
            }
          }
        }
      } catch (err) {
        console.error('Error selecting domain for temporary email:', err);
      }
      const localPart = randomBytes(6).toString('hex');
      const emailAddress = `${localPart}@${domain}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const doc = {
        user_id: userId,
        email_address: emailAddress,
        alias_name: aliasName,
        expires_at: expiresAt,
      };
      const createdEmail = await EphemeralEmail.create(doc);
      const { _id, __v, ...emailFields } = createdEmail.toObject();
      return { id: createdEmail.id, ...emailFields } as EphemeralEmailType;
    } catch (error) {
      console.error('Error creating ephemeral email:', error);
      return null;
    }
  }

  async getUserEmails(userId: string): Promise<EphemeralEmailType[]> {
    try {
      await connectToDatabase();
      const emails = await EphemeralEmail.find({ user_id: userId, is_active: true })
        .sort({ created_at: -1 })
        .lean();

      return emails.map((e) => {
        const { _id, __v, ...rest } = e;
        return { id: _id.toString(), ...rest };
      }) as EphemeralEmailType[];
    } catch (error) {
      console.error('Error fetching user emails:', error);
      return [];
    }
  }

  async getEmailThread(emailId: string, userId: string) {
    try {
      await connectToDatabase();
      const emailDoc = await EphemeralEmail.findOne({ _id: emailId, user_id: userId, is_active: true });
      if (!emailDoc) {
        return null;
      }
      const inboundMessages = await InboundEmail.find({ email_id: emailId }).sort({ received_at: -1 }).lean();
      const sentMessages = await SentEmail.find({ email_id: emailId }).sort({ sent_at: -1 }).lean();
      const emailObject = emailDoc.toObject();
      const { _id, __v, ...emailFields } = emailObject;
      return {
        email: { id: emailDoc.id, ...emailFields },
        inbound: inboundMessages.map((msg: any) => {
          const { _id: inboundId, __v: inboundV, raw_event, ...rest } = msg;
          return { id: inboundId.toString(), ...rest };
        }),
        sent: sentMessages.map((msg: any) => {
          const { _id: sentId, __v: sentV, ...rest } = msg;
          return { id: sentId.toString(), ...rest };
        }),
      };
    } catch (error) {
      console.error('Error fetching email thread:', error);
      return null;
    }
  }

  async deactivateEmail(emailId: string, userId: string): Promise<boolean> {
    try {
      await connectToDatabase();
      const emailDoc = await EphemeralEmail.findOne({ _id: emailId, user_id: userId });
      if (!emailDoc) {
        return false;
      }
      if (!emailDoc.is_active) {
        return true;
      }
      emailDoc.is_active = false;
      await emailDoc.save();
      await this.removeMailchimpRoute(emailDoc);
      return true;
    } catch (error) {
      console.error('Error deactivating email:', error);
      return false;
    }
  }

  async deleteExpiredEmails(): Promise<void> {
    try {
      await connectToDatabase();
      const now = new Date().toISOString();
      const expired = await EphemeralEmail.find({ expires_at: { $lt: now }, is_active: true }).lean();
      if (expired.length === 0) {
        return;
      }
      const expiredIds = expired.map((doc: any) => doc._id);
      await EphemeralEmail.updateMany({ _id: { $in: expiredIds } }, { $set: { is_active: false } });
      await Promise.all(
        expired.map((doc: any) => {
          return this.removeMailchimpRoute(doc as Pick<IEphemeralEmail, 'provider' | 'provider_metadata'>);
        })
      );
    } catch (error) {
      console.error('Error deleting expired emails:', error);
    }
  }

  private sanitizeLocalPart(aliasName?: string): string | null {
    if (!aliasName) {
      return null;
    }
    const normalized = aliasName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return normalized.length >= 3 ? normalized : null;
  }

  private buildMailchimpWebhookTarget(): string | null {
    if (process.env.MAILCHIMP_INBOUND_WEBHOOK_URL) {
      return process.env.MAILCHIMP_INBOUND_WEBHOOK_URL.trim();
    }
    const base = process.env.PUBLIC_BASE_URL;
    if (!base) {
      return null;
    }
    return `${base.replace(/\/$/, '')}/api/mailchimp/inbound`;
  }

  private async ensureMailchimpInboundDomain(): Promise<string | null> {
    if (this.mailchimpInboundDomain) {
      return this.mailchimpInboundDomain;
    }
    if (process.env.MAILCHIMP_INBOUND_DOMAIN) {
      this.mailchimpInboundDomain = process.env.MAILCHIMP_INBOUND_DOMAIN.trim();
      return this.mailchimpInboundDomain;
    }
    if (!this.mailchimpClient) {
      return null;
    }
    try {
      const domains = await this.mailchimpClient.inbound.domains({});
      if (Array.isArray(domains) && domains.length > 0) {
        const active = domains.find((d: any) => Boolean(d.valid_mx) && Boolean(d.active)) || domains[0];
        if (active && active.domain) {
          this.mailchimpInboundDomain = active.domain;
          return active.domain;
        }
      }
    } catch (error) {
      console.error('Failed to fetch Mailchimp inbound domains:', error);
    }
    return null;
  }

  private async createMailchimpEphemeralEmail(userId: string, aliasName?: string): Promise<EphemeralEmailType | null> {
    if (!this.mailchimpClient) {
      return null;
    }
    const inboundDomain = await this.ensureMailchimpInboundDomain();
    if (!inboundDomain) {
      return null;
    }
    const alias = this.sanitizeLocalPart(aliasName);
    const localPart = alias ? `${alias}-${randomBytes(3).toString('hex')}` : randomBytes(6).toString('hex');
    const normalizedDomain = inboundDomain.toLowerCase();
    const emailAddress = `${localPart}@${normalizedDomain}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const webhookUrl = this.buildMailchimpWebhookTarget();
    let providerMetadata: Record<string, any> | null = { inboundDomain, pattern: localPart };
    if (webhookUrl) {
      try {
        const route = await this.mailchimpClient.inbound.addRoute({
          domain: inboundDomain,
          pattern: localPart,
          url: webhookUrl,
          description: `cocoinbox:${userId}`,
        });
        providerMetadata = { inboundDomain, pattern: localPart, route_id: route.id, webhook_url: webhookUrl };
      } catch (error) {
        console.error('Failed to register Mailchimp inbound route:', error);
      }
    } else {
      console.warn('Mailchimp inbound webhook URL is not configured; inbound messages will not be delivered.');
    }
    const createdEmail = await EphemeralEmail.create({
      user_id: userId,
      email_address: emailAddress.toLowerCase(),
      alias_name: aliasName,
      expires_at: expiresAt,
      provider: 'mailchimp',
      provider_metadata: providerMetadata,
    });
    const { _id, __v, ...emailFields } = createdEmail.toObject();
    return { id: createdEmail.id, ...emailFields } as EphemeralEmailType;
  }

  private async removeMailchimpRoute(email: Pick<IEphemeralEmail, 'provider' | 'provider_metadata'> | null | undefined) {
    if (!email || email.provider !== 'mailchimp' || !this.mailchimpClient) {
      return;
    }
    const routeId = email.provider_metadata?.route_id;
    if (!routeId) {
      return;
    }
    try {
      await this.mailchimpClient.inbound.deleteRoute({ id: routeId });
    } catch (error) {
      console.error(`Failed to remove Mailchimp route ${routeId}:`, error);
    }
  }
}
