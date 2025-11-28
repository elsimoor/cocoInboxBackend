import { getStorageBucket } from './firebaseAdmin';
import { v4 as uuidv4 } from 'uuid';

export interface UploadUrlResponse {
  storagePath: string;
  uploadUrl: string;
}

export class StorageService {
  /**
   * Generate a unique storage path for a user's file.
   */
  generateStoragePath(userId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ts = Date.now();
    const id = uuidv4();
    return `secure_files/${userId}/${ts}-${id}-${safe}`;
  }

  /**
   * Create a V4 signed URL to upload a blob directly to Firebase Storage.
   */
  async getUploadUrl(storagePath: string, contentType = 'application/octet-stream', expiresInSeconds = 15 * 60): Promise<UploadUrlResponse> {
    const bucket = getStorageBucket();
    const file = bucket.file(storagePath);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresInSeconds * 1000,
      contentType,
    });
    return { storagePath, uploadUrl: url };
  }

  /**
   * Create a V4 signed URL to download a blob from Firebase Storage.
   */
  async getDownloadUrl(storagePath: string, expiresInSeconds = 60): Promise<string> {
    const bucket = getStorageBucket();
    const file = bucket.file(storagePath);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInSeconds * 1000,
    });
    return url;
  }

  /**
   * Delete a blob from Firebase Storage.
   */
  async delete(storagePath: string): Promise<void> {
    const bucket = getStorageBucket();
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
  }
}

