import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export async function requirePro(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // @ts-ignore
    const isPro = !!(req.user.is_pro || (Array.isArray(req.user.roles) && req.user.roles.includes('pro')));

    if (!isPro) {
      return res.status(403).json({ error: 'Pro subscription required' });
    }

    return next();
  } catch (e) {
    return res.status(500).json({ error: 'Authorization failed' });
  }
}
