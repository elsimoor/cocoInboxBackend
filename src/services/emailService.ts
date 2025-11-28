import { EphemeralEmail as EphemeralEmailType } from '../types';
import EphemeralEmail from '../models/EphemeralEmail';
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

  async createEphemeralEmail(userId: string, aliasName?: string): Promise<EphemeralEmailType | null> {
    try {
      await connectToDatabase();
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

  async deactivateEmail(emailId: string, userId: string): Promise<boolean> {
    try {
      await connectToDatabase();
      const result = await EphemeralEmail.updateOne({ _id: emailId, user_id: userId }, { $set: { is_active: false } });
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error deactivating email:', error);
      return false;
    }
  }

  async deleteExpiredEmails(): Promise<void> {
    try {
      await connectToDatabase();
      const now = new Date().toISOString();
      await EphemeralEmail.updateMany({ expires_at: { $lt: now } }, { $set: { is_active: false } });
    } catch (error) {
      console.error('Error deleting expired emails:', error);
    }
  }
}