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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const auth_1 = require("../middleware/auth");
const requirePro_1 = require("../middleware/requirePro");
const smsService_1 = require("../services/smsService");
const router = (0, express_1.Router)();
const sms = new smsService_1.SmsService();
router.use(auth_1.authenticate, requirePro_1.requirePro);
// Assign a temporary number for the authenticated user
router.post('/assign', async (req, res) => {
    try {
        if (!sms.isConfigured() && !(process.env.TWILIO_PREALLOCATED_NUMBERS || '').trim()) {
            return res.status(400).json({ error: 'Twilio is not configured and no preallocated numbers set. Provide TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN or TWILIO_PREALLOCATED_NUMBERS.' });
        }
        const { expiresInMinutes, country } = req.body || {};
        const out = await sms.assignNumber(req.user.id, expiresInMinutes, country);
        if (!out)
            return res.status(400).json({ error: 'No available numbers' });
        return res.json(out);
    }
    catch (e) {
        console.error('assign error', e);
        if (e && e.reason === 'TWILIO_TEST') {
            return res.status(400).json({ error: 'Twilio test credentials cannot list or buy numbers. Either switch to live Auth Token (left panel in console) or set TWILIO_PREALLOCATED_NUMBERS with a number you already own.' });
        }
        return res.status(500).json({ error: 'Failed to assign number' });
    }
});
// List user numbers
router.get('/numbers', async (req, res) => {
    try {
        const list = await sms.listUserNumbers(req.user.id);
        return res.json(list);
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to list numbers' });
    }
});
// Release a number
router.delete('/numbers/:id', async (req, res) => {
    try {
        const ok = await sms.releaseNumber(req.params.id, req.user.id);
        return res.json({ success: ok });
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to release number' });
    }
});
// List messages (optionally for a specific number)
router.get('/messages', async (req, res) => {
    try {
        const number = req.query.number || undefined;
        const msgs = await sms.listMessages(req.user.id, number);
        return res.json(msgs);
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to list messages' });
    }
});
// Public webhook for Twilio to deliver inbound SMS
router.post('/webhook/twilio', express_1.default.urlencoded({ extended: true }), async (req, res) => {
    try {
        // Optional: verify Twilio signature
        try {
            const token = process.env.TWILIO_AUTH_TOKEN;
            const signature = req.header('X-Twilio-Signature');
            const url = (process.env.PUBLIC_BASE_URL || '') + '/api/sms/webhook/twilio';
            if (token && signature) {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const twilio = require('twilio');
                const valid = twilio.validateRequest(token, signature, url, req.body);
                if (!valid) {
                    console.warn('Invalid Twilio signature');
                }
            }
        }
        catch { }
        await sms.handleTwilioWebhook(req);
        return res.type('text/xml').send('<Response></Response>');
    }
    catch (e) {
        console.error('webhook error', e);
        return res.status(200).type('text/xml').send('<Response></Response>');
    }
});
exports.default = router;
