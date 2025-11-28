"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const firebaseAdmin_1 = require("./firebaseAdmin");
const uuid_1 = require("uuid");
class StorageService {
    /**
     * Generate a unique storage path for a user's file.
     */
    generateStoragePath(userId, filename) {
        const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const ts = Date.now();
        const id = (0, uuid_1.v4)();
        return `secure_files/${userId}/${ts}-${id}-${safe}`;
    }
    /**
     * Create a V4 signed URL to upload a blob directly to Firebase Storage.
     */
    async getUploadUrl(storagePath, contentType = 'application/octet-stream', expiresInSeconds = 15 * 60) {
        const bucket = (0, firebaseAdmin_1.getStorageBucket)();
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
    async getDownloadUrl(storagePath, expiresInSeconds = 60) {
        const bucket = (0, firebaseAdmin_1.getStorageBucket)();
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
    async delete(storagePath) {
        const bucket = (0, firebaseAdmin_1.getStorageBucket)();
        await bucket.file(storagePath).delete({ ignoreNotFound: true });
    }
}
exports.StorageService = StorageService;
