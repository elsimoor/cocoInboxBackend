import { Router } from 'express';
import bcrypt from 'bcrypt';
import { connectToDatabase } from '../db';
import { createHmac } from 'crypto';
import dotenv from 'dotenv';
import User from '../models/User';

// Load environment variables early so that JWT_SECRET is available when
// this module is evaluated. Without calling dotenv.config() here,
// process.env.JWT_SECRET may be undefined because index.ts calls
// dotenv.config() after importing this file. This ensures consistent
// configuration across the application.
dotenv.config();

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Helper to create a simple JWT-like token using HMAC SHA256
function signToken(payload: any): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not defined');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const base64url = (input: string) => {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };
  const headerEncoded = base64url(JSON.stringify(header));
  const payloadEncoded = base64url(JSON.stringify(payload));
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;
  const signature = createHmac('sha256', JWT_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

// Register new user
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    await connectToDatabase();
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      email,
      password: hashedPassword,
      name,
    };
    const user = await User.create(newUser);
    return res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error('Error registering user:', err);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    await connectToDatabase();
    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.password) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const payload = {
      userId: user._id,
      roles: user.roles,
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };
    const token = signToken(payload);
    return res.json({ token, roles: user.roles });
  } catch (err) {
    console.error('Error logging in user:', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current authenticated user (requires token)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const token = authHeader.substring(7);
    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration' });
    }
    // Verify token (same logic as middleware)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const [headerEncoded, payloadEncoded, signature] = parts;
    const dataToSign = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(dataToSign)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const payloadJson = Buffer.from(payloadEncoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const decoded: any = JSON.parse(payloadJson);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Token expired' });
    }
    await connectToDatabase();
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    // Immediate downgrade if grace ended
    try {
      const now = new Date();
      const grace = user.proGraceUntil ? new Date(user.proGraceUntil) : null;
      const graceExpired = grace ? grace.getTime() <= now.getTime() : false;
      if (user.is_pro) {
        if (graceExpired) {
          user.is_pro = false;
          if (Array.isArray(user.roles)) {
            user.roles = user.roles.filter((r) => r !== 'pro');
          }
          await user.save();
        }
      }
    } catch (e) {
      console.error('Immediate downgrade check (me) failed:', e);
      // continue without blocking response
    }
  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    is_pro: user.is_pro,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
    subscriptionCurrentPeriodStart: user.subscriptionCurrentPeriodStart,
    subscriptionCreatedAt: user.subscriptionCreatedAt,
    proGraceUntil: user.proGraceUntil,
  });
  } catch (err) {
    console.error('Error fetching current user:', err);
    return res.status(500).json({ error: 'Failed to get current user' });
  }
});

export default router;