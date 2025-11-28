"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const tempPhoneNumberSchema = new mongoose_1.Schema({
    user_id: { type: String, required: true },
    phone_number: { type: String, required: true, unique: true },
    provider: { type: String, enum: ['twilio', 'vonage'], default: 'twilio' },
    expires_at: { type: Date },
    is_active: { type: Boolean, default: true },
    assigned_at: { type: String, default: () => new Date().toISOString() },
    country: { type: String },
});
// TTL index: auto-remove when expires_at reached
tempPhoneNumberSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
const TempPhoneNumber = (0, mongoose_1.model)('TempPhoneNumber', tempPhoneNumberSchema);
exports.default = TempPhoneNumber;
