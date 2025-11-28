import { Schema, model, Document } from 'mongoose';

interface ISecureFile extends Document {
  user_id: string;
  filename: string;
  encrypted_file_url: string;
  storage_path: string;
  file_size: number;
  password_protected: boolean;
  password_hash?: string;
  // Use Date in DB to support TTL index. API can still expose ISO string.
  expires_at?: Date;
  max_downloads?: number;
  watermark_enabled: boolean;
  download_count: number;
  created_at: string;
  // Client-side encryption metadata (needed to decrypt in browser)
  iv?: string; // base64
  salt?: string; // base64
  algo?: string; // e.g. AES-GCM
  kdf_iterations?: number;
  original_mime_type?: string;
}

const secureFileSchema = new Schema<ISecureFile>({
  user_id: { type: String, required: true },
  filename: { type: String, required: true },
  encrypted_file_url: { type: String, required: true },
  storage_path: { type: String, required: true },
  file_size: { type: Number, required: true },
  password_protected: { type: Boolean, default: false },
  password_hash: { type: String },
  expires_at: { type: Date },
  max_downloads: { type: Number },
  watermark_enabled: { type: Boolean, default: true },
  download_count: { type: Number, default: 0 },
  created_at: { type: String, default: () => new Date().toISOString() },
  iv: { type: String },
  salt: { type: String },
  algo: { type: String },
  kdf_iterations: { type: Number },
  original_mime_type: { type: String },
});

// TTL index: automatically remove documents when expires_at is reached.
// Note: this only deletes the MongoDB document; storage cleanup is handled separately.
secureFileSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const SecureFile = model<ISecureFile>('SecureFile', secureFileSchema);

export default SecureFile;
export { ISecureFile };
