"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
router.get('/public', (req, res) => {
    const mailchimpConfigured = !!(process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_SERVER_PREFIX);
    const smtpDevConfigured = !!(process.env.SMTPDEV_API_KEY && process.env.SMTPDEV_ACCOUNT_ID && process.env.SMTPDEV_MAILBOX_ID);
    const imapConfigured = !!((process.env.IMAP_HOST && process.env.IMAP_USERNAME && process.env.IMAP_PASSWORD) ||
        (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS));
    const firebaseConfigured = !!(process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY &&
        process.env.FIREBASE_STORAGE_BUCKET);
    const twilioConfigured = !!((process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ||
        (process.env.TWILIO_ACCOUNT_SID && (process.env.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY) && (process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_SECRET)));
    const esimConfigured = !!(process.env.ESIM_PROVIDER && process.env.ESIM_API_KEY);
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    return res.json({
        mailchimpConfigured,
        smtpDevConfigured,
        imapConfigured,
        firebaseConfigured,
        twilioConfigured,
        esimConfigured,
        stripeConfigured,
    });
});
exports.default = router;
