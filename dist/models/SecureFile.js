"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const secureFileSchema = new mongoose_1.Schema({
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
const SecureFile = (0, mongoose_1.model)('SecureFile', secureFileSchema);
exports.default = SecureFile;
