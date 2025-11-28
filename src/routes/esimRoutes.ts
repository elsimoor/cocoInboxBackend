import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePro } from '../middleware/requirePro';

const router = Router();

router.use(authenticate, requirePro);

function isEsimConfigured() {
  return !!(process.env.ESIM_PROVIDER && process.env.ESIM_API_KEY);
}

// Public: list available data plans for a given country code (ISO2)
router.get('/plans', async (req, res) => {
  if (!isEsimConfigured()) {
    return res.status(501).json({
      error: 'eSIM provider not configured',
      code: 'ESIM_PROVIDER_NOT_CONFIGURED',
    });
  }
  // Placeholder implementation - replace with real provider call
  const { country = 'FR' } = req.query;
  return res.json({
    country,
    plans: [
      { id: 'mock-1', name: 'Local 1GB', dataGB: 1, validityDays: 7, priceUSD: 4.99 },
      { id: 'mock-3', name: 'Local 3GB', dataGB: 3, validityDays: 15, priceUSD: 9.99 },
      { id: 'mock-5', name: 'Local 5GB', dataGB: 5, validityDays: 30, priceUSD: 14.99 },
    ],
  });
});

// Auth: purchase a plan -> returns activation details
router.post('/purchase', async (req: AuthRequest, res) => {
  if (!isEsimConfigured()) {
    return res.status(501).json({
      error: 'eSIM provider not configured',
      code: 'ESIM_PROVIDER_NOT_CONFIGURED',
    });
  }
  const { planId } = req.body || {};
  if (!planId) return res.status(400).json({ error: 'Missing planId' });
  // Placeholder: normally would call provider and store a profile linked to user
  return res.json({
    profile: {
      id: 'profile_' + planId,
      name: 'eSIM ' + planId,
      status: 'pending',
      activationCode: 'LPA:1$MOCK$' + planId,
    },
  });
});

// Auth: list user's eSIM profiles
router.get('/profiles', async (req: AuthRequest, res) => {
  if (!isEsimConfigured()) {
    return res.status(501).json({
      error: 'eSIM provider not configured',
      code: 'ESIM_PROVIDER_NOT_CONFIGURED',
    });
  }
  // Placeholder - return empty list for now
  return res.json({ profiles: [] });
});

// Auth: activate a purchased profile
router.post('/activate', async (req: AuthRequest, res) => {
  if (!isEsimConfigured()) {
    return res.status(501).json({
      error: 'eSIM provider not configured',
      code: 'ESIM_PROVIDER_NOT_CONFIGURED',
    });
  }
  const { profileId } = req.body || {};
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  // Placeholder: pretend activation succeeded
  return res.json({ success: true });
});

// Auth: delete an eSIM profile
router.delete('/profiles/:id', async (req: AuthRequest, res) => {
  if (!isEsimConfigured()) {
    return res.status(501).json({
      error: 'eSIM provider not configured',
      code: 'ESIM_PROVIDER_NOT_CONFIGURED',
    });
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  // Placeholder delete
  return res.json({ success: true });
});

export default router;
