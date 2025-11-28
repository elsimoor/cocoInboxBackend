import { Router } from 'express';
import { NoteService } from '../services/noteService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePro } from '../middleware/requirePro';

const router = Router();
const noteService = new NoteService();

router.use(authenticate, requirePro);

// Create a secure note (client-side encrypted, authenticated)
router.post('/create', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const {
      encryptedTitle,
      encryptedContent,
      cryptoAlgo,
      kdf = 'PBKDF2',
      kdfIterations = 250000,
      iv,
      salt,
      mac,
      vaultId,
      autoDeleteAfterRead,
      expiresAt,
      expiresInMinutes,
    } = req.body;

    if (!encryptedTitle || !encryptedContent || !cryptoAlgo || !iv || !salt || !vaultId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const note = await noteService.createNote({
      userId,
      encryptedTitle,
      encryptedContent,
      cryptoAlgo,
      kdf,
      kdfIterations,
      iv,
      salt,
      mac,
      vaultId,
      autoDeleteAfterRead: !!autoDeleteAfterRead,
      expiresAt,
      expiresInMinutes,
    });

    if (!note) {
      return res.status(500).json({ error: 'Failed to create note' });
    }

    res.json(note);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List notes by vault (password-derived vaultId). No titles/content decrypted server-side.
router.post('/vault-list', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { cryptoAlgo, vaultId } = req.body as { cryptoAlgo: 'AES-GCM' | 'AES-CBC-HMAC'; vaultId: string };
    if (!cryptoAlgo || !vaultId) return res.status(400).json({ error: 'Missing cryptoAlgo or vaultId' });
    const notes = await noteService.listByVault(userId, cryptoAlgo, vaultId);
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch a note and optionally consume it (auto-delete on read). Returns encrypted payload.
router.get('/:noteId', async (req: AuthRequest, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user!.id;
    const result = await noteService.readNote(noteId, userId);
    if (!result) {
      return res.status(404).json({ error: 'Note not found or expired' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:noteId', async (req: AuthRequest, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user!.id;
    const success = await noteService.deleteNote(noteId, userId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to delete note' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
