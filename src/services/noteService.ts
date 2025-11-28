import { SecureNote as SecureNoteType } from '../types';
import SecureNote from '../models/SecureNote';
import { connectToDatabase } from '../db';

function computeExpiry(expiresAt?: string, expiresInMinutes?: number): string | undefined {
  if (expiresInMinutes && expiresInMinutes > 0) {
    const t = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    return t.toISOString();
  }
  if (expiresAt) return new Date(expiresAt).toISOString();
  return undefined;
}

export class NoteService {
  async createNote(params: {
    userId: string;
    encryptedTitle: string;
    encryptedContent: string;
    cryptoAlgo: 'AES-GCM' | 'AES-CBC-HMAC';
    kdf?: 'PBKDF2';
    kdfIterations?: number;
    iv: string;
    salt: string;
    mac?: string;
    vaultId: string;
    autoDeleteAfterRead: boolean;
    expiresAt?: string;
    expiresInMinutes?: number;
  }): Promise<SecureNoteType | null> {
    try {
      const {
        userId,
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
      } = params;
      await connectToDatabase();
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
      const createdNote = await SecureNote.create(doc);
      const { _id, __v, ...noteFields } = createdNote.toObject();
      return { id: createdNote.id, ...noteFields } as SecureNoteType;
    } catch (error) {
      console.error('Error creating note:', error);
      return null;
    }
  }

  async getUserNotes(userId: string): Promise<SecureNoteType[]> {
    try {
      await connectToDatabase();
      const notes = await SecureNote.find({ user_id: userId })
        .sort({ created_at: -1 })
        .lean();

      return notes.map((n) => {
        const { _id, __v, ...rest } = n;
        return { id: _id.toString(), ...rest };
      }) as SecureNoteType[];
    } catch (error) {
      console.error('Error fetching user notes:', error);
      return [];
    }
  }

  async listByVault(userId: string, cryptoAlgo: 'AES-GCM' | 'AES-CBC-HMAC', vaultId: string): Promise<SecureNoteType[]> {
    try {
      await connectToDatabase();
      const notes = await SecureNote.find({ user_id: userId, crypto_algo: cryptoAlgo, vault_id: vaultId })
        .sort({ created_at: -1 })
        .lean();
      return notes.map((n: any) => ({ id: n._id.toString(), ...n })) as SecureNoteType[];
    } catch (error) {
      console.error('Error listing notes by vault:', error);
      return [];
    }
  }

  async readNote(noteId: string, userId: string): Promise<SecureNoteType | null> {
    try {
      await connectToDatabase();
      const note = await SecureNote.findOne({ _id: noteId, user_id: userId });
      if (!note) return null;
      // Check expiry
      if (note.expires_at) {
        const nowIso = new Date().toISOString();
        if (note.expires_at <= nowIso) {
          await SecureNote.deleteOne({ _id: note._id });
          return null;
        }
      }
      const result = note.toObject();
      if (note.auto_delete_after_read) {
        // Delete immediately after first read
        await SecureNote.deleteOne({ _id: note._id });
      } else if (!note.has_been_read) {
        note.has_been_read = true;
        await note.save();
      }
      const { _id, __v, ...rest } = result as any;
      return { id: note.id, ...rest } as SecureNoteType;
    } catch (error) {
      console.error('Error fetching note:', error);
      return null;
    }
  }

  async deleteNote(noteId: string, userId: string): Promise<boolean> {
    try {
      await connectToDatabase();
      const result = await SecureNote.deleteOne({ _id: noteId, user_id: userId });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting note:', error);
      return false;
    }
  }
}
