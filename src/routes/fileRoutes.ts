import { Router } from 'express';
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
    const url = await storageService.getDownloadUrl(file.storage_path, 60);
    // best-effort increment
    try { await fileService.incrementDownloadCount(fileId); } catch {}
    return res.json({
      url,
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
