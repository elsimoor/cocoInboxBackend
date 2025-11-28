"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const domainService_1 = require("../services/domainService");
const auth_1 = require("../middleware/auth");
const requirePro_1 = require("../middleware/requirePro");
const db_1 = require("../db");
const User_1 = __importDefault(require("../models/User"));
// Routes for managing SMTP domains used by free users. Domains determine
// which SMTP servers are available for sending emails on the free tier. Only
// authenticated administrators may create new domains. Listing domains hides
// sensitive credentials.
const router = (0, express_1.Router)();
const domainService = new domainService_1.DomainService();
// Helper to check whether the authenticated user has the admin role. The
// authenticate middleware attaches a `user` property to the request
// containing the user's id. We fetch the full user document from MongoDB
// and inspect its roles array. Returns true if the user is an admin.
async function isAdmin(userId) {
    await (0, db_1.connectToDatabase)();
    const user = await User_1.default.findById(userId);
    return Array.isArray(user?.roles) && user.roles.includes('admin');
}
// POST /api/domains
// Adds a new SMTP domain configuration. Requires the authenticated user to
// have the 'admin' role. The request body must include host, port,
// secure, username, password, from, and limit fields. The optional order
// field determines priority; lower numbers are tried first.
router.post('/', auth_1.authenticate, requirePro_1.requirePro, async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const admin = await isAdmin(authUser.id);
        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: admin role required' });
        }
        const { host, port, secure, username, password, from, limit, order } = req.body;
        if (!host || !port || !username || !password || !from || !limit) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const parsedPort = parseInt(port, 10);
        if (isNaN(parsedPort)) {
            return res.status(400).json({ error: 'Invalid port value' });
        }
        const parsedLimit = parseInt(limit, 10);
        if (isNaN(parsedLimit) || parsedLimit <= 0) {
            return res.status(400).json({ error: 'Invalid limit value' });
        }
        const domain = await domainService.addDomain({
            host,
            port: parsedPort,
            secure: Boolean(secure),
            username,
            password,
            from,
            limit: parsedLimit,
            order: order !== undefined ? parseInt(order, 10) : undefined,
        });
        if (!domain) {
            return res.status(500).json({ error: 'Failed to add domain' });
        }
        // Hide password in response
        const { password: _, ...safeDomain } = domain;
        return res.json(safeDomain);
    }
    catch (error) {
        console.error('Error adding SMTP domain:', error);
        return res.status(500).json({ error: error.message || 'Failed to add domain' });
    }
});
// GET /api/domains
// Returns a list of all configured SMTP domains, excluding sensitive
// credentials.
router.get('/', auth_1.authenticate, requirePro_1.requirePro, async (req, res) => {
    try {
        const domains = await domainService.getDomains();
        const sanitized = domains.map(({ password, ...rest }) => rest);
        return res.json(sanitized);
    }
    catch (error) {
        console.error('Error fetching SMTP domains:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch domains' });
    }
});
// GET /api/domains/:id
// Returns a single SMTP domain by its ID, excluding sensitive credentials.
router.get('/:id', auth_1.authenticate, requirePro_1.requirePro, async (req, res) => {
    try {
        const domain = await domainService.getDomain(req.params.id);
        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        // Hide password in response
        const { password, ...safeDomain } = domain;
        return res.json(safeDomain);
    }
    catch (error) {
        console.error('Error fetching SMTP domain:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch domain' });
    }
});
// PUT /api/domains/:id
// Updates an existing SMTP domain. Requires the authenticated user to have
// the 'admin' role.
router.put('/:id', auth_1.authenticate, requirePro_1.requirePro, async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const admin = await isAdmin(authUser.id);
        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: admin role required' });
        }
        const { host, port, secure, username, password, from, limit, order } = req.body;
        if (!host || !port || !username || !password || !from || !limit) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const parsedPort = parseInt(port, 10);
        if (isNaN(parsedPort)) {
            return res.status(400).json({ error: 'Invalid port value' });
        }
        const parsedLimit = parseInt(limit, 10);
        if (isNaN(parsedLimit) || parsedLimit <= 0) {
            return res.status(400).json({ error: 'Invalid limit value' });
        }
        const domain = await domainService.updateDomain(req.params.id, {
            host,
            port: parsedPort,
            secure: Boolean(secure),
            username,
            password,
            from,
            limit: parsedLimit,
            order: order !== undefined ? parseInt(order, 10) : undefined,
        });
        if (!domain) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        // Hide password in response
        const { password: _, ...safeDomain } = domain;
        return res.json(safeDomain);
    }
    catch (error) {
        console.error('Error updating SMTP domain:', error);
        return res.status(500).json({ error: error.message || 'Failed to update domain' });
    }
});
// DELETE /api/domains/:id
// Deletes an SMTP domain. Requires the authenticated user to have the
// 'admin' role.
router.delete('/:id', auth_1.authenticate, requirePro_1.requirePro, async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const admin = await isAdmin(authUser.id);
        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: admin role required' });
        }
        const result = await domainService.deleteDomain(req.params.id);
        if (!result) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting SMTP domain:', error);
        return res.status(500).json({ error: error.message || 'Failed to delete domain' });
    }
});
exports.default = router;
