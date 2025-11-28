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
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptText = encryptText;
exports.decryptText = decryptText;
const crypto_1 = __importStar(require("crypto"));
// AES-256-GCM encryption helpers for secure notes
// Uses a master key provided via env: NOTES_ENCRYPTION_KEY (base64 or hex), 32 bytes required
function getMasterKey() {
    const keyRaw = process.env.NOTES_ENCRYPTION_KEY || '';
    let key = null;
    if (keyRaw) {
        if (/^[A-Fa-f0-9]+$/.test(keyRaw) && keyRaw.length === 64) {
            key = Buffer.from(keyRaw, 'hex');
        }
        else {
            try {
                const b64 = Buffer.from(keyRaw, 'base64');
                if (b64.length === 32)
                    key = b64;
            }
            catch { }
            if (!key) {
                const raw = Buffer.from(keyRaw);
                if (raw.length === 32)
                    key = raw;
            }
        }
    }
    // Fallback: derive from JWT_SECRET (dev convenience). Uses SHA-256 to obtain 32 bytes.
    if (!key) {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('NOTES_ENCRYPTION_KEY not set and JWT_SECRET unavailable to derive key');
        }
        console.warn('[secure-notes] NOTES_ENCRYPTION_KEY missing. Deriving encryption key from JWT_SECRET (dev only).');
        key = (0, crypto_1.createHash)('sha256').update(jwtSecret).digest();
    }
    if (key.length !== 32) {
        throw new Error('Derived encryption key must be 32 bytes (256-bit)');
    }
    return key;
}
function encryptText(plaintext) {
    const key = getMasterKey();
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Store as compact string: v1|b64(iv)|b64(ct)|b64(tag)
    return [
        'v1',
        iv.toString('base64'),
        ciphertext.toString('base64'),
        tag.toString('base64'),
    ].join('|');
}
function decryptText(encrypted) {
    const key = getMasterKey();
    const parts = encrypted.split('|');
    if (parts.length !== 4 || parts[0] !== 'v1') {
        throw new Error('Unsupported or invalid encrypted note format');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plaintext;
}
