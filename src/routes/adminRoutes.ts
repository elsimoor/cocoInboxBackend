import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { connectToDatabase } from '../db';
import User from '../models/User';
import EphemeralEmail from '../models/EphemeralEmail';
import SecureNote from '../models/SecureNote';
import SecureFile from '../models/SecureFile';

const router = Router();

async function isAdmin(userId: string): Promise<boolean> {
  await connectToDatabase();
  const user = await User.findById(userId);
  return Array.isArray(user?.roles) && user.roles.includes('admin');
}

router.get('/users', authenticate, async (req, res) => {
  try {
    const authUser = (req as any).user;
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const admin = await isAdmin(authUser.id);
    if (!admin) {
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }

    await connectToDatabase();
    const users = await User.find().select('-password').lean();
    const usersWithCounts = await Promise.all(
      users.map(async (user) => {
        const emailCount = await EphemeralEmail.countDocuments({ userId: user._id, isActive: true });
        const noteCount = await SecureNote.countDocuments({ userId: user._id });
        const fileCount = await SecureFile.countDocuments({ userId: user._id });
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
      })
    );

    return res.json(usersWithCounts);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

router.put('/users/:userId/roles', authenticate, async (req, res) => {
  try {
    const authUser = (req as any).user;
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

    await connectToDatabase();
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.roles.includes('admin') && !roles.includes('admin')) {
      const adminCount = await User.countDocuments({ roles: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove admin role from the last admin user' });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { roles },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: (user as any)._id.toString(),
      email: user.email,
      name: user.name,
      roles: user.roles,
      is_pro: user.is_pro,
      created_at: user.created_at,
    });
  } catch (error: any) {
    console.error('Error updating user roles:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user roles' });
  }
});

router.put('/users/:userId/pro-status', authenticate, async (req, res) => {
  try {
    const authUser = (req as any).user;
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

    await connectToDatabase();
    const user = await User.findByIdAndUpdate(
      userId,
      { is_pro },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: (user as any)._id.toString(),
      email: user.email,
      name: user.name,
      roles: user.roles,
      is_pro: user.is_pro,
      created_at: user.created_at,
    });
  } catch (error: any) {
    console.error('Error updating pro status:', error);
    return res.status(500).json({ error: error.message || 'Failed to update pro status' });
  }
});

router.get('/stats', authenticate, async (req, res) => {
  try {
    const authUser = (req as any).user;
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const admin = await isAdmin(authUser.id);
    if (!admin) {
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }

    await connectToDatabase();
    const totalUsers = await User.countDocuments();
    const proUsers = await User.countDocuments({ is_pro: true });
    const adminUsers = await User.countDocuments({ roles: 'admin' });
    const totalEmails = await EphemeralEmail.countDocuments();
    const activeEmails = await EphemeralEmail.countDocuments({ isActive: true });
    const totalNotes = await SecureNote.countDocuments();
    const totalFiles = await SecureFile.countDocuments();

    const recentUsers = await User.find()
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
      recentUsers: recentUsers.map((u: any) => ({
        id: u._id.toString(),
        email: u.email,
        name: u.name,
        created_at: u.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch stats' });
  }
});

export default router;
