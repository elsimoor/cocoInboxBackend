"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const inboundEmailSchema = new mongoose_1.Schema({
    user_id: { type: String, required: true },
    email_id: { type: String, required: true },
    email_address: { type: String, required: true },
    from: { type: String, required: true },
    subject: { type: String },
    text: { type: String },
    html: { type: String },
    attachments: [
        {
            filename: { type: String },
            size: { type: Number },
            contentType: { type: String },
        },
    ],
    received_at: { type: String, default: () => new Date().toISOString() },
    message_id: { type: String },
    provider: { type: String },
    raw_event: { type: mongoose_1.Schema.Types.Mixed },
});
inboundEmailSchema.index({ message_id: 1, email_id: 1 }, { unique: true, sparse: true });
inboundEmailSchema.index({ email_id: 1, received_at: -1 });
const InboundEmail = (0, mongoose_1.model)('InboundEmail', inboundEmailSchema);
exports.default = InboundEmail;
