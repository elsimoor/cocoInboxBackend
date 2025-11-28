"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const secureNoteSchema = new mongoose_1.Schema({
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
const SecureNote = (0, mongoose_1.model)('SecureNote', secureNoteSchema);
exports.default = SecureNote;
