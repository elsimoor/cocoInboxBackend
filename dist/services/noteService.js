"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoteService = void 0;
const SecureNote_1 = __importDefault(require("../models/SecureNote"));
const db_1 = require("../db");
function computeExpiry(expiresAt, expiresInMinutes) {
    if (expiresInMinutes && expiresInMinutes > 0) {
        const t = new Date(Date.now() + expiresInMinutes * 60 * 1000);
        return t.toISOString();
    }
    if (expiresAt)
        return new Date(expiresAt).toISOString();
    return undefined;
}
class NoteService {
    async createNote(params) {
        try {
            const { userId, encryptedTitle, encryptedContent, cryptoAlgo, kdf = 'PBKDF2', kdfIterations = 250000, iv, salt, mac, vaultId, autoDeleteAfterRead, expiresAt, expiresInMinutes, } = params;
            await (0, db_1.connectToDatabase)();
            const exp = computeExpiry(expiresAt, expiresInMinutes);
            const doc = {
                user_id: userId,
                encrypted_title: encryptedTitle,
                encrypted_content: encryptedContent,
                crypto_algo: cryptoAlgo,
                kdf,
                kdf_iterations: kdfIterations,
                iv,
                salt,
                mac,
                vault_id: vaultId,
                auto_delete_after_read: autoDeleteAfterRead,
                has_been_read: false,
                expires_at: exp,
            };
            const createdNote = await SecureNote_1.default.create(doc);
            const { _id, __v, ...noteFields } = createdNote.toObject();
            return { id: createdNote.id, ...noteFields };
        }
        catch (error) {
            console.error('Error creating note:', error);
            return null;
        }
    }
    async getUserNotes(userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const notes = await SecureNote_1.default.find({ user_id: userId })
                .sort({ created_at: -1 })
                .lean();
            return notes.map((n) => {
                const { _id, __v, ...rest } = n;
                return { id: _id.toString(), ...rest };
            });
        }
        catch (error) {
            console.error('Error fetching user notes:', error);
            return [];
        }
    }
    async listByVault(userId, cryptoAlgo, vaultId) {
        try {
            await (0, db_1.connectToDatabase)();
            const notes = await SecureNote_1.default.find({ user_id: userId, crypto_algo: cryptoAlgo, vault_id: vaultId })
                .sort({ created_at: -1 })
                .lean();
            return notes.map((n) => ({ id: n._id.toString(), ...n }));
        }
        catch (error) {
            console.error('Error listing notes by vault:', error);
            return [];
        }
    }
    async readNote(noteId, userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const note = await SecureNote_1.default.findOne({ _id: noteId, user_id: userId });
            if (!note)
                return null;
            // Check expiry
            if (note.expires_at) {
                const nowIso = new Date().toISOString();
                if (note.expires_at <= nowIso) {
                    await SecureNote_1.default.deleteOne({ _id: note._id });
                    return null;
                }
            }
            const result = note.toObject();
            if (note.auto_delete_after_read) {
                // Delete immediately after first read
                await SecureNote_1.default.deleteOne({ _id: note._id });
            }
            else if (!note.has_been_read) {
                note.has_been_read = true;
                await note.save();
            }
            const { _id, __v, ...rest } = result;
            return { id: note.id, ...rest };
        }
        catch (error) {
            console.error('Error fetching note:', error);
            return null;
        }
    }
    async deleteNote(noteId, userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const result = await SecureNote_1.default.deleteOne({ _id: noteId, user_id: userId });
            return result.deletedCount > 0;
        }
        catch (error) {
            console.error('Error deleting note:', error);
            return false;
        }
    }
}
exports.NoteService = NoteService;
