import { Schema, model, Document } from 'mongoose';

interface ISecureNote extends Document {
  user_id: string;
  // Client-side encrypted payload and metadata
  encrypted_title: string; // base64 or serialized
  encrypted_content: string; // base64 or serialized
  crypto_algo: 'AES-GCM' | 'AES-CBC-HMAC';
  kdf: 'PBKDF2';
  kdf_iterations: number;
  iv: string; // base64
  salt: string; // base64
  mac?: string; // base64 (for AES-CBC-HMAC)
  // Vault grouping (derived on client from password + user + algo)
  vault_id: string; // base64 or hex
  // Controls
  auto_delete_after_read: boolean;
  has_been_read: boolean;
  expires_at?: string;
  created_at: string;
}

const secureNoteSchema = new Schema<ISecureNote>({
  user_id: { type: String, required: true },
  encrypted_title: { type: String, required: true },
  encrypted_content: { type: String, required: true },
  crypto_algo: { type: String, enum: ['AES-GCM', 'AES-CBC-HMAC'], required: true },
  kdf: { type: String, enum: ['PBKDF2'], default: 'PBKDF2' },
  kdf_iterations: { type: Number, default: 250000 },
  iv: { type: String, required: true },
  salt: { type: String, required: true },
  mac: { type: String },
  vault_id: { type: String, required: true, index: true },
  auto_delete_after_read: { type: Boolean, default: false },
  has_been_read: { type: Boolean, default: false },
  expires_at: { type: String },
  created_at: { type: String, default: () => new Date().toISOString() },
});

const SecureNote = model<ISecureNote>('SecureNote', secureNoteSchema);

export default SecureNote;
export { ISecureNote };
