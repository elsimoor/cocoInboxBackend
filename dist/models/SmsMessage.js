"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const smsMessageSchema = new mongoose_1.Schema({
    to: { type: String, required: true },
    from: { type: String, required: true },
    body: { type: String, required: true },
    message_sid: { type: String },
    user_id: { type: String },
    received_at: { type: String, default: () => new Date().toISOString() },
    expires_at: { type: Date },
});
// TTL for messages (default 24h if set). We'll set expires_at when creating.
smsMessageSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
const SmsMessage = (0, mongoose_1.model)('SmsMessage', smsMessageSchema);
exports.default = SmsMessage;
