"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const EphemeralEmail_1 = __importDefault(require("../models/EphemeralEmail"));
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
    }
    async createEphemeralEmail(userId, aliasName) {
        try {
            await (0, db_1.connectToDatabase)();
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
    async deactivateEmail(emailId, userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const result = await EphemeralEmail_1.default.updateOne({ _id: emailId, user_id: userId }, { $set: { is_active: false } });
            return result.modifiedCount > 0;
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
            await EphemeralEmail_1.default.updateMany({ expires_at: { $lt: now } }, { $set: { is_active: false } });
        }
        catch (error) {
            console.error('Error deleting expired emails:', error);
        }
    }
}
exports.EmailService = EmailService;
