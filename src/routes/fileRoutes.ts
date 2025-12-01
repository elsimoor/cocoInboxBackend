import { Router } from 'express';
import axios from 'axios';
import { FileService } from '../services/fileService';
import { StorageService } from '../services/storageService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePro } from '../middleware/requirePro';

const router = Router();
const fileService = new FileService();
const storageService = new StorageService();

// NOTE: Public endpoints must be declared BEFORE auth middleware is applied
// so that shared links work without Authorization headers.

// Public: fetch file metadata (password-validated) without auth
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { password } = req.query;
    const file = await fileService.getFile(fileId, password as string);

    if (!file) {
      return res.status(404).json({ error: 'File not found or invalid password' });
    }

    res.json(file);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public: get short-lived signed download URL after validating password/expiry
router.get('/:fileId/download-url', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { password } = req.query;
    const file = await fileService.getFile(fileId, (password as string) || undefined);
    if (!file) {
      return res.status(404).json({ error: 'File not available' });
    }
    // Generate signed GCS URL (for non-browser clients)
    const gcsUrl = await storageService.getDownloadUrl(file.storage_path, 60);
    // Also provide a backend-proxied URL for browsers (avoids CORS)
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const proxyUrl = `${proto}://${host}/api/files/${fileId}/blob?password=${encodeURIComponent((password as string) || '')}`;
    // best-effort increment
    try { await fileService.incrementDownloadCount(fileId); } catch {}
    return res.json({
      url: proxyUrl,
      gcsUrl,
      filename: file.filename,
      mimeType: file.original_mime_type || 'application/octet-stream',
      iv: file.iv,
      salt: file.salt,
      algo: file.algo,
      kdfIterations: file.kdf_iterations,
    });
  } catch (error) {
    console.error('download-url error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public: proxy encrypted blob to avoid frontend CORS issues
router.get('/:fileId/blob', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { password } = req.query;
    const file = await fileService.getFile(fileId, (password as string) || undefined);
    if (!file) {
      return res.status(404).json({ error: 'File not available' });
    }
    const url = await storageService.getDownloadUrl(file.storage_path, 60);
    const resp = await axios.get(url, { responseType: 'stream', validateStatus: () => true });
    if (resp.status < 200 || resp.status >= 300) {
      return res.status(502).json({ error: 'Failed to fetch blob', status: resp.status });
    }
    res.setHeader('Content-Type', file.original_mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    if (resp.headers['content-length']) {
      res.setHeader('Content-Length', resp.headers['content-length']);
    }
    resp.data.pipe(res);
  } catch (error: any) {
    console.error('blob proxy error:', error?.message || error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public: increment download counter (best-effort)
router.post('/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;
    const success = await fileService.incrementDownloadCount(fileId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to update download count' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apply auth for all routes below (creator-only operations)
router.use(authenticate, requirePro);

// Create a signed upload URL for direct-to-Firebase upload
router.post('/upload-url', async (req: AuthRequest, res) => {
  try {
    const { filename, contentType } = req.body;
    const userId = req.user!.id;
    if (!userId || !filename) {
      return res.status(400).json({ error: 'Missing userId or filename' });
    }
    const storagePath = storageService.generateStoragePath(userId, filename);
    const { uploadUrl } = await storageService.getUploadUrl(storagePath, contentType || 'application/octet-stream');
    res.json({ storagePath, uploadUrl });
  } catch (error) {
    console.error('upload-url error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/create', async (req: AuthRequest, res) => {
  try {
    const {
      filename,
      storagePath,
      fileSize,
      passwordProtected,
      password,
      expiresAt,
      maxDownloads,
      watermarkEnabled,
      iv,
      salt,
      algo,
      kdfIterations,
      originalMimeType
    } = req.body;
    const userId = req.user!.id;

    const file = await fileService.createFile(
      userId,
      filename,
      storagePath,
      fileSize,
      passwordProtected,
      password,
      expiresAt,
      maxDownloads,
      watermarkEnabled,
      iv,
      salt,
      algo,
      kdfIterations,
      originalMimeType
    );

    if (!file) {
      return res.status(500).json({ error: 'Failed to create file' });
    }

    res.json(file);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/user/:userId', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    // Ensure the authenticated user is requesting their own files
    if (req.user!.id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const files = await fileService.getUserFiles(userId);
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.delete('/:fileId', async (req: AuthRequest, res) => {
  try {
    const { fileId } = req.params;
    const success = await fileService.deleteFile(fileId, req.user!.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
