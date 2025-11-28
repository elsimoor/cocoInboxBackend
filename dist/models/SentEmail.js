"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const sentEmailSchema = new mongoose_1.Schema({
    user_id: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String },
    html: { type: String },
    sent_at: { type: String, default: () => new Date().toISOString() },
});
const SentEmail = (0, mongoose_1.model)('SentEmail', sentEmailSchema);
exports.default = SentEmail;
