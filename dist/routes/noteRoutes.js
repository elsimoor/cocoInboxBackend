"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const noteService_1 = require("../services/noteService");
const auth_1 = require("../middleware/auth");
const requirePro_1 = require("../middleware/requirePro");
const router = (0, express_1.Router)();
const noteService = new noteService_1.NoteService();
router.use(auth_1.authenticate, requirePro_1.requirePro);
// Create a secure note (client-side encrypted, authenticated)
router.post('/create', async (req, res) => {
    try {
        const userId = req.user.id;
        const { encryptedTitle, encryptedContent, cryptoAlgo, kdf = 'PBKDF2', kdfIterations = 250000, iv, salt, mac, vaultId, autoDeleteAfterRead, expiresAt, expiresInMinutes, } = req.body;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// List notes by vault (password-derived vaultId). No titles/content decrypted server-side.
router.post('/vault-list', async (req, res) => {
    try {
        const userId = req.user.id;
        const { cryptoAlgo, vaultId } = req.body;
        if (!cryptoAlgo || !vaultId)
            return res.status(400).json({ error: 'Missing cryptoAlgo or vaultId' });
        const notes = await noteService.listByVault(userId, cryptoAlgo, vaultId);
        res.json(notes);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Fetch a note and optionally consume it (auto-delete on read). Returns encrypted payload.
router.get('/:noteId', async (req, res) => {
    try {
        const { noteId } = req.params;
        const userId = req.user.id;
        const result = await noteService.readNote(noteId, userId);
        if (!result) {
            return res.status(404).json({ error: 'Note not found or expired' });
        }
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:noteId', async (req, res) => {
    try {
        const { noteId } = req.params;
        const userId = req.user.id;
        const success = await noteService.deleteNote(noteId, userId);
        if (!success) {
            return res.status(500).json({ error: 'Failed to delete note' });
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
