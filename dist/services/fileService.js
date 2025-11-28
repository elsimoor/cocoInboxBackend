"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const SecureFile_1 = __importDefault(require("../models/SecureFile"));
const bcrypt = __importStar(require("bcrypt"));
const db_1 = require("../db");
const storageService_1 = require("./storageService");
const storage = new storageService_1.StorageService();
class FileService {
    /**
     * Create a new secure file record in MongoDB. Passwords will be hashed with
     * bcrypt if provided and the document will include a created timestamp.
     */
    async createFile(userId, filename, storagePath, fileSize, passwordProtected, password, expiresAt, maxDownloads, watermarkEnabled = true, iv, salt, algo = 'AES-GCM', kdfIterations, originalMimeType) {
        try {
            await (0, db_1.connectToDatabase)();
            let passwordHash;
            if (passwordProtected && password) {
                passwordHash = await bcrypt.hash(password, 10);
            }
            const bucket = 'nails-fed39.appspot.com';
            const encryptedFileUrl = bucket
                ? `https://storage.googleapis.com/${bucket}/${storagePath}`
                : storagePath;
            const doc = {
                user_id: userId,
                filename,
                encrypted_file_url: encryptedFileUrl,
                storage_path: storagePath,
                file_size: fileSize,
                password_protected: passwordProtected,
                password_hash: passwordHash,
                expires_at: expiresAt ? new Date(expiresAt) : undefined,
                max_downloads: maxDownloads,
                watermark_enabled: watermarkEnabled,
                iv,
                salt,
                algo,
                kdf_iterations: kdfIterations,
                original_mime_type: originalMimeType,
            };
            const createdFile = await SecureFile_1.default.create(doc);
            const { _id, __v, ...fileFields } = createdFile.toObject();
            return { id: createdFile.id, ...fileFields };
        }
        catch (error) {
            console.error('Error creating file:', error);
            return null;
        }
    }
    /**
     * Retrieve all secure files belonging to a given user sorted by most recent.
     */
    async getUserFiles(userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const files = await SecureFile_1.default.find({ user_id: userId })
                .sort({ _id: -1 })
                .lean();
            return files.map((f) => {
                const { _id, __v, ...rest } = f;
                return { id: _id.toString(), ...rest };
            });
        }
        catch (error) {
            console.error('Error fetching user files:', error);
            return [];
        }
    }
    /**
     * Retrieve a single secure file by its ID. Optionally validate a password if
     * the file is password protected. Returns null if not found or password is
     * invalid.
     */
    async getFile(fileId, password) {
        try {
            await (0, db_1.connectToDatabase)();
            const file = await SecureFile_1.default.findById(fileId);
            if (!file) {
                return null;
            }
            // expiration / max downloads validation
            if (file.expires_at && new Date(file.expires_at) <= new Date()) {
                return null;
            }
            if (file.max_downloads != null && file.download_count >= file.max_downloads) {
                return null;
            }
            // password validation
            if (file.password_protected) {
                if (!password || !file.password_hash) {
                    return null;
                }
                const isValid = await bcrypt.compare(password, file.password_hash);
                if (!isValid) {
                    return null;
                }
            }
            const { _id, __v, ...fileFields } = file.toObject();
            return { id: file.id, ...fileFields };
        }
        catch (error) {
            console.error('Error fetching file:', error);
            return null;
        }
    }
    /**
     * Increment the download count for a file. Returns false if the file does
     * not exist or the update fails.
     */
    async incrementDownloadCount(fileId) {
        try {
            await (0, db_1.connectToDatabase)();
            const file = await SecureFile_1.default.findById(fileId);
            if (!file) {
                return false;
            }
            file.download_count = (file.download_count || 0) + 1;
            await file.save();
            return true;
        }
        catch (error) {
            console.error('Error incrementing download count:', error);
            return false;
        }
    }
    /**
     * Delete a secure file if it belongs to the specified user.
     */
    async deleteFile(fileId, userId) {
        try {
            await (0, db_1.connectToDatabase)();
            const file = await SecureFile_1.default.findOne({ _id: fileId, user_id: userId });
            if (!file)
                return false;
            try {
                if (file.storage_path) {
                    await storage.delete(file.storage_path);
                }
            }
            catch (e) {
                console.warn('Failed to delete storage object for file', fileId, e);
            }
            const result = await SecureFile_1.default.deleteOne({ _id: fileId, user_id: userId });
            return result.deletedCount > 0;
        }
        catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }
}
exports.FileService = FileService;
