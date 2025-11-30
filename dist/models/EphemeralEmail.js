"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const ephemeralEmailSchema = new mongoose_1.Schema({
    user_id: { type: String, required: true },
    email_address: { type: String, required: true, unique: true },
    alias_name: { type: String },
    expires_at: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    provider: { type: String, enum: ['freemium', 'mailchimp'], default: 'freemium' },
    provider_metadata: { type: mongoose_1.Schema.Types.Mixed, default: null },
});
const EphemeralEmail = (0, mongoose_1.model)('EphemeralEmail', ephemeralEmailSchema);
exports.default = EphemeralEmail;
