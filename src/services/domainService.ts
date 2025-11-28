import { connectToDatabase } from '../db';
import SmtpDomain, { ISmtpDomain } from '../models/SmtpDomain';
import SmtpDomainUsage, { ISmtpDomainUsage } from '../models/SmtpDomainUsage';
import mongoose from 'mongoose';

/**
 * Interface describing the SMTP domain configuration. Each entry represents
 * one outbound email domain that free users can send through. Fields like
 * host, port, username and password correspond to the credentials needed by
 * nodemailer to connect to the SMTP server. The `from` field defines the
 * default sender address used when sending mail through this domain. The
 * `limit` field defines the maximum number of messages that may be sent
 * through this domain within a one‑hour rolling window. The `order` field
 * determines the priority of the domain; lower numbers are tried first.
 */
export interface DomainConfig {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  limit: number;
  order: number;
  created_at: string;
}

/**
 * DomainService manages SMTP domain configuration and usage. It allows
 * administrators to add new domains, retrieve the list of configured
 * domains, and handle per‑domain send limits. The send limit logic is
 * implemented via the `getNextAvailableDomain` and `incrementUsage` methods.
 */
export class DomainService {
  /**
   * Returns all configured SMTP domains sorted by their `order` field. If no
   * domains exist, an empty array is returned. The returned documents are
   * mapped into `DomainConfig` objects where the MongoDB `_id` is converted
   * to a string `id` property.
   */
  async getDomains(): Promise<DomainConfig[]> {
    await connectToDatabase();
    const domains = await SmtpDomain.find().sort({ order: 1 }).lean();
    return domains.map((doc) => ({
      id: doc._id.toString(),
      host: doc.host,
      port: doc.port,
      secure: doc.secure,
      username: doc.username,
      password: doc.password,
      from: doc.from,
      limit: doc.limit,
      order: doc.order,
      created_at: doc.created_at,
    }));
  }

  /**
   * Returns a single SMTP domain by its ID. If no domain is found, null is
   * returned.
   */
  async getDomain(id: string): Promise<DomainConfig | null> {
    await connectToDatabase();
    const domain = await SmtpDomain.findById(id).lean();
    if (!domain) {
      return null;
    }
    return {
      id: domain._id.toString(),
      host: domain.host,
      port: domain.port,
      secure: domain.secure,
      username: domain.username,
      password: domain.password,
      from: domain.from,
      limit: domain.limit,
      order: domain.order,
      created_at: domain.created_at,
    };
  }

  /**
   * Inserts a new SMTP domain configuration into the `smtp_domains`
   * collection. The caller must supply all required fields. The `order`
   * defaults to the next available integer (i.e. the number of existing
   * documents) unless explicitly provided. On success the newly created
   * DomainConfig is returned; otherwise null is returned.
   */
  async addDomain(config: Omit<DomainConfig, 'id' | 'created_at' | 'order'> & { order?: number }): Promise<DomainConfig | null> {
    try {
      await connectToDatabase();
      // Determine default order if not provided. This ensures new domains
      // are appended to the end of the priority list by default.
      let order = config.order;
      if (order === undefined) {
        const count = await SmtpDomain.countDocuments();
        order = count;
      }
      const doc = {
        ...config,
        order: order,
      };
      const newDomain = await SmtpDomain.create(doc);
      return {
        id: newDomain.id,
        ...newDomain.toObject(),
      };
    } catch (error) {
      console.error('Error adding SMTP domain:', error);
      return null;
    }
  }

  /**
   * Updates an existing SMTP domain. The `updates` object may contain any
   * subset of the domain configuration fields. On success, the updated
   * domain config is returned. On failure (e.g. if the ID is not found),
   * null is returned.
   */
  async updateDomain(id: string, updates: Partial<Omit<DomainConfig, 'id' | 'created_at'>>): Promise<DomainConfig | null> {
    try {
      await connectToDatabase();
      const updatedDomain = await SmtpDomain.findByIdAndUpdate(id, updates, { new: true }).lean();
      if (!updatedDomain) {
        return null;
      }
      return {
        id: updatedDomain._id.toString(),
        host: updatedDomain.host,
        port: updatedDomain.port,
        secure: updatedDomain.secure,
        username: updatedDomain.username,
        password: updatedDomain.password,
        from: updatedDomain.from,
        limit: updatedDomain.limit,
        order: updatedDomain.order,
        created_at: updatedDomain.created_at,
      };
    } catch (error) {
      console.error('Error updating SMTP domain:', error);
      return null;
    }
  }

  /**
   * Deletes an SMTP domain by its ID. Returns true on success, false on
   * failure.
   */
  async deleteDomain(id: string): Promise<boolean> {
    try {
      await connectToDatabase();
      const result = await SmtpDomain.findByIdAndDelete(id);
      return !!result;
    } catch (error) {
      console.error('Error deleting SMTP domain:', error);
      return false;
    }
  }

  /**
   * Retrieves the usage document for the given domain. If no usage document
   * exists, one is created with a window start equal to now and count of
   * zero. This ensures usage tracking always returns a valid record.
   *
   * @param domainId String representation of the domain's ObjectId.
   */
  private async getUsageDoc(domainId: string): Promise<ISmtpDomainUsage> {
    await connectToDatabase();
    const domId = new mongoose.Types.ObjectId(domainId);
    let usage = await SmtpDomainUsage.findOne({ domain_id: domId });
    if (!usage) {
      const newUsage = {
        domain_id: domId,
        window_start: new Date(),
        count: 0,
      };
      usage = await SmtpDomainUsage.create(newUsage);
    }
    return usage;
  }

  /**
   * Determines whether a domain has remaining quota in the current one‑hour
   * window. If the existing window has expired (i.e. an hour has passed
   * since the window started), the usage is reset to zero. Returns true if
   * the domain has available quota, along with the updated count and
   * window start. If no quota remains, returns false.
   *
   * @param domain Domain configuration object.
   */
  private async hasQuota(domain: DomainConfig): Promise<{ available: boolean; usage: ISmtpDomainUsage }> {
    const usage = await this.getUsageDoc(domain.id);
    const now = new Date();
    const windowStart = usage.window_start;
    const elapsed = now.getTime() - windowStart.getTime();
    // Reset usage if more than an hour has elapsed since window start
    if (elapsed >= 60 * 60 * 1000) {
      usage.window_start = now;
      usage.count = 0;
      await usage.save();
    }
    // Determine if the domain has available quota
    const available = usage.count < domain.limit;
    return { available, usage };
  }

  /**
   * Increments the usage count for the given domain. This should be called
   * immediately after a successful send operation. The update is persisted
   * back to MongoDB so that concurrent requests see the updated state.
   *
   * @param domainId String representation of the domain's ObjectId.
   */
  private async incrementUsage(domainId: string): Promise<void> {
    const usage = await this.getUsageDoc(domainId);
    const now = new Date();
    const elapsed = now.getTime() - usage.window_start.getTime();
    if (elapsed >= 60 * 60 * 1000) {
      // Start a new window if the previous one has expired
      usage.window_start = now;
      usage.count = 1;
    } else {
      usage.count += 1;
    }
    await usage.save();
  }

  /**
   * Returns the next available domain that has remaining quota. Domains are
   * evaluated in order of their `order` property. If no domains have
   * available quota in the current window, undefined is returned.
   */
  async getNextAvailableDomain(): Promise<DomainConfig | undefined> {
    const domains = await this.getDomains();
    for (const domain of domains) {
      const { available } = await this.hasQuota(domain);
      if (available) {
        return domain;
      }
    }
    return undefined;
  }

  /**
   * Called by MailService after a successful send to record usage. This
   * method updates the domain's usage count. Exposing this as public makes
   * testing easier and decouples MailService from usage persistence.
   */
  async recordUsage(domainId: string): Promise<void> {
    await this.incrementUsage(domainId);
  }
}

// Singleton instance and top-level helpers to avoid repeated instantiation
// and simplify consumption from route files.
export const domainService = new DomainService();

export async function listSmtpDomains(): Promise<DomainConfig[]> {
  return domainService.getDomains();
}

export async function getSmtpDomain(id: string): Promise<DomainConfig | null> {
  return domainService.getDomain(id);
}

export async function addSmtpDomain(
  config: Omit<DomainConfig, 'id' | 'created_at' | 'order'> & { order?: number }
): Promise<DomainConfig | null> {
  return domainService.addDomain(config);
}

export async function updateSmtpDomain(
  id: string,
  updates: Partial<Omit<DomainConfig, 'id' | 'created_at'>>
): Promise<DomainConfig | null> {
  return domainService.updateDomain(id, updates);
}

export async function deleteSmtpDomain(id: string): Promise<boolean> {
  return domainService.deleteDomain(id);
}