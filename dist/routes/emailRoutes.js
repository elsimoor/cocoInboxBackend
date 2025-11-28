"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
const emailService = new emailService_1.EmailService();
router.post('/create', async (req, res) => {
    try {
        const { userId, aliasName } = req.body;
        const email = await emailService.createEphemeralEmail(userId, aliasName);
        if (!email) {
            // When the service returns null it typically means there were no
            // available freemium addresses to allocate. Respond with a 400
            // status so the client can display an appropriate message.
            return res.status(400).json({ error: 'No available email addresses. Please try again later.' });
        }
        res.json(email);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const emails = await emailService.getUserEmails(userId);
        res.json(emails);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:emailId', async (req, res) => {
    try {
        const { emailId } = req.params;
        const { userId } = req.body;
        const success = await emailService.deactivateEmail(emailId, userId);
        if (!success) {
            return res.status(500).json({ error: 'Failed to deactivate email' });
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
