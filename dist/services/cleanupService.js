"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredFiles = cleanupExpiredFiles;
exports.startFileCleanupJob = startFileCleanupJob;
exports.cleanupExpiredNotes = cleanupExpiredNotes;
exports.startNoteCleanupJob = startNoteCleanupJob;
exports.cleanupExpiredSms = cleanupExpiredSms;
exports.startSmsCleanupJob = startSmsCleanupJob;
exports.enforceSubscriptionStatus = enforceSubscriptionStatus;
exports.startSubscriptionEnforcementJob = startSubscriptionEnforcementJob;
const SecureFile_1 = __importDefault(require("../models/SecureFile"));
const SecureNote_1 = __importDefault(require("../models/SecureNote"));
const TempPhoneNumber_1 = __importDefault(require("../models/TempPhoneNumber"));
const db_1 = require("../db");
const storageService_1 = require("./storageService");
const User_1 = __importDefault(require("../models/User"));
const storage = new storageService_1.StorageService();
async function cleanupExpiredFiles() {
    await (0, db_1.connectToDatabase)();
    const now = new Date();
    const candidates = await SecureFile_1.default.find({
        $or: [
            { expires_at: { $lte: now } },
            { $expr: { $and: [{ $ifNull: ['$max_downloads', false] }, { $gte: ['$download_count', '$max_downloads'] }] } },
        ],
    }).lean();
    for (const f of candidates) {
        try {
            if (f.storage_path) {
                await storage.delete(f.storage_path);
            }
            await SecureFile_1.default.deleteOne({ _id: f._id });
        }
        catch (err) {
            console.error('Failed to cleanup file', f._id?.toString(), err);
        }
    }
}
function startFileCleanupJob(intervalMs = 5 * 60 * 1000) {
    // Run periodically
    setInterval(() => {
        cleanupExpiredFiles().catch((e) => console.error('Cleanup job failed', e));
    }, intervalMs);
}
async function cleanupExpiredNotes() {
    await (0, db_1.connectToDatabase)();
    const nowIso = new Date().toISOString();
    // Fetch candidates by basic predicates, then filter in app for string-time compare
    const candidates = await SecureNote_1.default.find({
        $or: [
            { expires_at: { $exists: true } },
            { auto_delete_after_read: true, has_been_read: true },
        ],
    }).lean();
    for (const n of candidates) {
        try {
            const expired = !!(n.expires_at && n.expires_at <= nowIso);
            const consumed = !!(n.auto_delete_after_read && n.has_been_read);
            if (expired || consumed) {
                await SecureNote_1.default.deleteOne({ _id: n._id });
            }
        }
        catch (err) {
            console.error('Failed to cleanup note', n._id?.toString(), err);
        }
    }
}
function startNoteCleanupJob(intervalMs = 5 * 60 * 1000) {
    setInterval(() => {
        cleanupExpiredNotes().catch((e) => console.error('Note cleanup job failed', e));
    }, intervalMs);
}
async function cleanupExpiredSms() {
    // TempPhoneNumber and SmsMessage have TTL indexes; this is a no-op placeholder
    // but can be used to perform extra cleanup if needed (e.g., releasing providers)
    try {
        await (0, db_1.connectToDatabase)();
        // Ensure is_active flipped for expired numbers
        const now = new Date();
        await TempPhoneNumber_1.default.updateMany({ expires_at: { $lte: now }, is_active: true }, { $set: { is_active: false } });
        // SmsMessage TTL handles document deletion
    }
    catch (e) {
        console.error('Failed SMS cleanup', e);
    }
}
function startSmsCleanupJob(intervalMs = 10 * 60 * 1000) {
    setInterval(() => {
        cleanupExpiredSms().catch((e) => console.error('SMS cleanup job failed', e));
    }, intervalMs);
}
// Downgrade users whose grace window expired or subscription is not active
async function enforceSubscriptionStatus() {
    try {
        await (0, db_1.connectToDatabase)();
        const now = new Date();
        // Find users whose pro grace has expired or subscription inactive without grace
        const candidates = await User_1.default.find({
            is_pro: true,
            $or: [
                // Primary rule: grace expired, regardless of stripe status/period
                { proGraceUntil: { $exists: true, $ne: null, $lte: now } },
                // Fallback rule: no grace recorded and subscription inactive
                { $and: [{ proGraceUntil: null }, { subscriptionStatus: { $nin: ['active', 'trialing'] } }] },
            ],
        });
        for (const u of candidates) {
            try {
                u.is_pro = false;
                u.subscriptionStatus = u.subscriptionStatus || 'canceled';
                // Remove pro role
                if (Array.isArray(u.roles)) {
                    u.roles = u.roles.filter((r) => r !== 'pro');
                }
                await u.save();
                console.log(`Downgraded user ${u.email} due to expired grace or inactive subscription`);
            }
            catch (e) {
                console.error('Failed to downgrade user', u._id?.toString(), e);
            }
        }
    }
    catch (e) {
        console.error('enforceSubscriptionStatus failed', e);
    }
}
function startSubscriptionEnforcementJob(intervalMs = 5 * 60 * 1000) {
    setInterval(() => {
        enforceSubscriptionStatus().catch((e) => console.error('Subscription enforcement job failed', e));
    }, intervalMs);
}
