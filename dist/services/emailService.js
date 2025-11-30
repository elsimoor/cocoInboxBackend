"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const mailchimp_transactional_1 = __importDefault(require("@mailchimp/mailchimp_transactional"));
const EphemeralEmail_1 = __importDefault(require("../models/EphemeralEmail"));
const InboundEmail_1 = __importDefault(require("../models/InboundEmail"));
const SentEmail_1 = __importDefault(require("../models/SentEmail"));
const db_1 = require("../db");
const domainService_1 = require("./domainService");
const crypto_1 = require("crypto");
class EmailService {
    constructor() {
        /**
         * The DomainService instance used to lookup configured SMTP domains. This is
         * lazily constructed so that the DomainService and its underlying MongoDB
         * connection are only initialized if needed. Since this service is only
         * required when generating a new temporary address, instantiating it here
         * avoids adding a dependency on DomainService in places that only fetch
         * existing emails.
         */
        this.domainService = null;
        this.mailchimpClient = null;
        this.mailchimpInboundDomain = process.env.MAILCHIMP_INBOUND_DOMAIN || null;
        if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_SERVER_PREFIX) {
            this.mailchimpClient = (0, mailchimp_transactional_1.default)(process.env.MAILCHIMP_API_KEY);
        }
    }
    async createEphemeralEmail(userId, aliasName) {
        try {
            await (0, db_1.connectToDatabase)();
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
                const usedDocs = await EphemeralEmail_1.default.find({
                    email_address: { $in: configured },
                    is_active: true,
                }).lean();
                const usedSet = new Set(usedDocs.map((doc) => doc.email_address.toLowerCase()));
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
                const createdEmail = await EphemeralEmail_1.default.create(doc);
                const { _id, __v, ...emailFields } = createdEmail.toObject();
                return { id: createdEmail.id, ...emailFields };
            }
            // If no freemium list is configured, fall back to the existing random
            // address logic. Select a domain for the free tier. If SMTP domains are
            // configured in the database, derive the domain portion from the
            // `from` address on one of those entries. If no domains exist, derive
            // from SENDER_EMAIL or default to temmail.me.
            let domain = 'temmail.me';
            const isValidDomain = (d) => {
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
                    this.domainService = new domainService_1.DomainService();
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
            }
            catch (err) {
                console.error('Error selecting domain for temporary email:', err);
            }
            const localPart = (0, crypto_1.randomBytes)(6).toString('hex');
            const emailAddress = `${localPart}@${domain}`;
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const doc = {
                user_id: userId,
                email_address: emailAddress,
                alias_name: aliasName,
                expires_at: expiresAt,
            };
            const createdEmail = await EphemeralEmail_1.default.create(doc);
            const { _id, __v, ...emailFields } = createdEmail.toObject();
            return { id: createdEmail.id, ...emailFields };
        }
        catch (error) {
            console.error('Error creating ephemeral email:', error);
            return null;
        }
    }
    async getUserEmails(userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const emails = await EphemeralEmail_1.default.find({ user_id: userId, is_active: true })
                .sort({ created_at: -1 })
                .lean();
            return emails.map((e) => {
                const { _id, __v, ...rest } = e;
                return { id: _id.toString(), ...rest };
            });
        }
        catch (error) {
            console.error('Error fetching user emails:', error);
            return [];
        }
    }
    async getEmailThread(emailId, userId, options) {
        try {
            await (0, db_1.connectToDatabase)();
            const emailDoc = await EphemeralEmail_1.default.findOne({ _id: emailId, user_id: userId, is_active: true });
            if (!emailDoc) {
                return null;
            }
            const inboundPage = Math.max(1, options?.inboundPage || 1);
            const inboundLimit = Math.min(50, Math.max(1, options?.inboundLimit || 10));
            const sentPage = Math.max(1, options?.sentPage || 1);
            const sentLimit = Math.min(50, Math.max(1, options?.sentLimit || 10));
            const [inboundTotal, sentTotal, inboundMessages, sentMessages] = await Promise.all([
                InboundEmail_1.default.countDocuments({ email_id: emailId }),
                SentEmail_1.default.countDocuments({ email_id: emailId }),
                InboundEmail_1.default.find({ email_id: emailId })
                    .sort({ received_at: -1 })
                    .skip((inboundPage - 1) * inboundLimit)
                    .limit(inboundLimit)
                    .lean(),
                SentEmail_1.default.find({ email_id: emailId })
                    .sort({ sent_at: -1 })
                    .skip((sentPage - 1) * sentLimit)
                    .limit(sentLimit)
                    .lean(),
            ]);
            const emailObject = emailDoc.toObject();
            const { _id, __v, ...emailFields } = emailObject;
            return {
                email: { id: emailDoc.id, ...emailFields },
                inbound: inboundMessages.map((msg) => {
                    const { _id: inboundId, __v: inboundV, raw_event, ...rest } = msg;
                    return { id: inboundId.toString(), ...rest };
                }),
                sent: sentMessages.map((msg) => {
                    const { _id: sentId, __v: sentV, ...rest } = msg;
                    return { id: sentId.toString(), ...rest };
                }),
                meta: {
                    inboundPage,
                    inboundLimit,
                    inboundTotal,
                    sentPage,
                    sentLimit,
                    sentTotal,
                },
            };
        }
        catch (error) {
            console.error('Error fetching email thread:', error);
            return null;
        }
    }
    async deactivateEmail(emailId, userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const emailDoc = await EphemeralEmail_1.default.findOne({ _id: emailId, user_id: userId });
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
        }
        catch (error) {
            console.error('Error deactivating email:', error);
            return false;
        }
    }
    async deleteExpiredEmails() {
        try {
            await (0, db_1.connectToDatabase)();
            const now = new Date().toISOString();
            const expired = await EphemeralEmail_1.default.find({ expires_at: { $lt: now }, is_active: true }).lean();
            if (expired.length === 0) {
                return;
            }
            const expiredIds = expired.map((doc) => doc._id);
            await EphemeralEmail_1.default.updateMany({ _id: { $in: expiredIds } }, { $set: { is_active: false } });
            await Promise.all(expired.map((doc) => {
                return this.removeMailchimpRoute(doc);
            }));
        }
        catch (error) {
            console.error('Error deleting expired emails:', error);
        }
    }
    sanitizeLocalPart(aliasName) {
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
    buildMailchimpWebhookTarget() {
        if (process.env.MAILCHIMP_INBOUND_WEBHOOK_URL) {
            return process.env.MAILCHIMP_INBOUND_WEBHOOK_URL.trim();
        }
        const base = process.env.PUBLIC_BASE_URL;
        if (!base) {
            return null;
        }
        return `${base.replace(/\/$/, '')}/api/mailchimp/inbound`;
    }
    async ensureMailchimpInboundDomain() {
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
                const active = domains.find((d) => Boolean(d.valid_mx) && Boolean(d.active)) || domains[0];
                if (active && active.domain) {
                    this.mailchimpInboundDomain = active.domain;
                    return active.domain;
                }
            }
        }
        catch (error) {
            console.error('Failed to fetch Mailchimp inbound domains:', error);
        }
        return null;
    }
    async createMailchimpEphemeralEmail(userId, aliasName) {
        if (!this.mailchimpClient) {
            return null;
        }
        const inboundDomain = await this.ensureMailchimpInboundDomain();
        if (!inboundDomain) {
            return null;
        }
        const alias = this.sanitizeLocalPart(aliasName);
        const localPart = alias ? `${alias}-${(0, crypto_1.randomBytes)(3).toString('hex')}` : (0, crypto_1.randomBytes)(6).toString('hex');
        const normalizedDomain = inboundDomain.toLowerCase();
        const emailAddress = `${localPart}@${normalizedDomain}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const webhookUrl = this.buildMailchimpWebhookTarget();
        let providerMetadata = { inboundDomain, pattern: localPart };
        if (webhookUrl) {
            try {
                const route = await this.mailchimpClient.inbound.addRoute({
                    domain: inboundDomain,
                    pattern: localPart,
                    url: webhookUrl,
                    description: `cocoinbox:${userId}`,
                });
                providerMetadata = { inboundDomain, pattern: localPart, route_id: route.id, webhook_url: webhookUrl };
            }
            catch (error) {
                console.error('Failed to register Mailchimp inbound route:', error);
            }
        }
        else {
            console.warn('Mailchimp inbound webhook URL is not configured; inbound messages will not be delivered.');
        }
        const createdEmail = await EphemeralEmail_1.default.create({
            user_id: userId,
            email_address: emailAddress.toLowerCase(),
            alias_name: aliasName,
            expires_at: expiresAt,
            provider: 'mailchimp',
            provider_metadata: providerMetadata,
        });
        const { _id, __v, ...emailFields } = createdEmail.toObject();
        return { id: createdEmail.id, ...emailFields };
    }
    async removeMailchimpRoute(email) {
        if (!email || email.provider !== 'mailchimp' || !this.mailchimpClient) {
            return;
        }
        const routeId = email.provider_metadata?.route_id;
        if (!routeId) {
            return;
        }
        try {
            await this.mailchimpClient.inbound.deleteRoute({ id: routeId });
        }
        catch (error) {
            console.error(`Failed to remove Mailchimp route ${routeId}:`, error);
        }
    }
}
exports.EmailService = EmailService;
