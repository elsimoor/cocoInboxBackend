"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const db_1 = require("../db");
const EphemeralEmail_1 = __importDefault(require("../models/EphemeralEmail"));
const InboundEmail_1 = __importDefault(require("../models/InboundEmail"));
const router = (0, express_1.Router)();
// Mailchimp transactional (Mandrill) sends inbound events as
// application/x-www-form-urlencoded with the payload stored in
// `mandrill_events`. Enable urlencoded parsing for this router only so the
// global JSON body parser remains unaffected.
router.use(express_1.default.urlencoded({ extended: true }));
const normalizeAddresses = (msg) => {
    const recipients = [];
    if (msg?.email) {
        recipients.push(String(msg.email));
    }
    if (Array.isArray(msg?.to)) {
        for (const entry of msg.to) {
            if (Array.isArray(entry) && entry.length > 0) {
                recipients.push(String(entry[0]));
            }
            else if (typeof entry === 'string') {
                recipients.push(entry);
            }
        }
    }
    return [...new Set(recipients.filter(Boolean).map((addr) => addr.toLowerCase()))];
};
const extractAttachments = (msg) => {
    if (!msg || typeof msg.attachments !== 'object') {
        return [];
    }
    return Object.values(msg.attachments).map((attachment) => ({
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
        let events = [];
        try {
            events = JSON.parse(rawEvents);
            if (!Array.isArray(events)) {
                events = [];
            }
        }
        catch (parseErr) {
            console.error('Failed to parse Mailchimp inbound events:', parseErr);
            return res.json({ ok: false });
        }
        if (events.length === 0) {
            return res.json({ ok: true });
        }
        await (0, db_1.connectToDatabase)();
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
            const matching = await EphemeralEmail_1.default.find({
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
                    await InboundEmail_1.default.updateOne({ message_id: messageId, email_id: emailDoc._id.toString() }, {
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
                    }, { upsert: true });
                    processed += 1;
                }
                catch (err) {
                    console.error('Failed to persist inbound email:', err);
                }
            }
        }
        res.json({ ok: true, processed });
    }
    catch (error) {
        console.error('Mailchimp inbound handler error:', error);
        res.status(500).json({ error: 'Failed to process inbound events' });
    }
});
exports.default = router;
