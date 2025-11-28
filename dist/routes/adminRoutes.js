"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const User_1 = __importDefault(require("../models/User"));
const EphemeralEmail_1 = __importDefault(require("../models/EphemeralEmail"));
const SecureNote_1 = __importDefault(require("../models/SecureNote"));
const SecureFile_1 = __importDefault(require("../models/SecureFile"));
const router = (0, express_1.Router)();
async function isAdmin(userId) {
    await (0, db_1.connectToDatabase)();
    const user = await User_1.default.findById(userId);
    return Array.isArray(user?.roles) && user.roles.includes('admin');
}
router.get('/users', auth_1.authenticate, async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const admin = await isAdmin(authUser.id);
        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: admin role required' });
        }
        await (0, db_1.connectToDatabase)();
        const users = await User_1.default.find().select('-password').lean();
        const usersWithCounts = await Promise.all(users.map(async (user) => {
            const emailCount = await EphemeralEmail_1.default.countDocuments({ userId: user._id, isActive: true });
            const noteCount = await SecureNote_1.default.countDocuments({ userId: user._id });
            const fileCount = await SecureFile_1.default.countDocuments({ userId: user._id });
            return {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                roles: user.roles,
                is_pro: user.is_pro,
                created_at: user.created_at,
                emailCount,
                noteCount,
                fileCount,
            };
        }));
        return res.json(usersWithCounts);
    }
    catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch users' });
    }
});
router.put('/users/:userId/roles', auth_1.authenticate, async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const admin = await isAdmin(authUser.id);
        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: admin role required' });
        }
        const { userId } = req.params;
        const { roles } = req.body;
        if (!Array.isArray(roles)) {
            return res.status(400).json({ error: 'Roles must be an array' });
        }
        await (0, db_1.connectToDatabase)();
        const targetUser = await User_1.default.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (targetUser.roles.includes('admin') && !roles.includes('admin')) {
            const adminCount = await User_1.default.countDocuments({ roles: 'admin' });
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove admin role from the last admin user' });
            }
        }
        const user = await User_1.default.findByIdAndUpdate(userId, { roles }, { new: true }).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            roles: user.roles,
            is_pro: user.is_pro,
            created_at: user.created_at,
        });
    }
    catch (error) {
        console.error('Error updating user roles:', error);
        return res.status(500).json({ error: error.message || 'Failed to update user roles' });
    }
});
router.put('/users/:userId/pro-status', auth_1.authenticate, async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const admin = await isAdmin(authUser.id);
        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: admin role required' });
        }
        const { userId } = req.params;
        const { is_pro } = req.body;
        if (typeof is_pro !== 'boolean') {
            return res.status(400).json({ error: 'is_pro must be a boolean' });
        }
        await (0, db_1.connectToDatabase)();
        const user = await User_1.default.findByIdAndUpdate(userId, { is_pro }, { new: true }).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            roles: user.roles,
            is_pro: user.is_pro,
            created_at: user.created_at,
        });
    }
    catch (error) {
        console.error('Error updating pro status:', error);
        return res.status(500).json({ error: error.message || 'Failed to update pro status' });
    }
});
router.get('/stats', auth_1.authenticate, async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const admin = await isAdmin(authUser.id);
        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: admin role required' });
        }
        await (0, db_1.connectToDatabase)();
        const totalUsers = await User_1.default.countDocuments();
        const proUsers = await User_1.default.countDocuments({ is_pro: true });
        const adminUsers = await User_1.default.countDocuments({ roles: 'admin' });
        const totalEmails = await EphemeralEmail_1.default.countDocuments();
        const activeEmails = await EphemeralEmail_1.default.countDocuments({ isActive: true });
        const totalNotes = await SecureNote_1.default.countDocuments();
        const totalFiles = await SecureFile_1.default.countDocuments();
        const recentUsers = await User_1.default.find()
            .sort({ created_at: -1 })
            .limit(5)
            .select('-password')
            .lean();
        return res.json({
            users: {
                total: totalUsers,
                pro: proUsers,
                admin: adminUsers,
                free: totalUsers - proUsers,
            },
            content: {
                emails: totalEmails,
                activeEmails,
                notes: totalNotes,
                files: totalFiles,
            },
            recentUsers: recentUsers.map((u) => ({
                id: u._id.toString(),
                email: u.email,
                name: u.name,
                created_at: u.created_at,
            })),
        });
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch stats' });
    }
});
exports.default = router;
