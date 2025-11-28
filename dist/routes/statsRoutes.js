"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const EphemeralEmail_1 = __importDefault(require("../models/EphemeralEmail"));
const SecureNote_1 = __importDefault(require("../models/SecureNote"));
const SecureFile_1 = __importDefault(require("../models/SecureFile"));
const TempPhoneNumber_1 = __importDefault(require("../models/TempPhoneNumber"));
const router = (0, express_1.Router)();
router.get('/user', auth_1.authenticate, async (req, res) => {
    try {
        await (0, db_1.connectToDatabase)();
        const userId = req.user.id;
        const nowIso = new Date().toISOString();
        const now = new Date();
        const [activeEmails, notesCount, filesCount, activeNumbers] = await Promise.all([
            EphemeralEmail_1.default.countDocuments({ user_id: userId, is_active: true, expires_at: { $gt: nowIso } }),
            SecureNote_1.default.countDocuments({
                user_id: userId,
                $and: [
                    { $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: nowIso } }] },
                    { $or: [{ auto_delete_after_read: { $ne: true } }, { has_been_read: { $ne: true } }] },
                ],
            }),
            SecureFile_1.default.countDocuments({ user_id: userId, $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: now } }] }),
            TempPhoneNumber_1.default.countDocuments({ user_id: userId, is_active: true, $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: now } }] }),
        ]);
        return res.json({
            ephemeralEmails: { activeCount: activeEmails },
            secureNotes: { activeCount: notesCount },
            secureFiles: { activeCount: filesCount },
            sms: { activeNumbers },
        });
    }
    catch (err) {
        console.error('stats error', err);
        return res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
exports.default = router;
