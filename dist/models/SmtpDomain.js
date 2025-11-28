"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const smtpDomainSchema = new mongoose_1.Schema({
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    from: { type: String, required: true },
    limit: { type: Number, required: true },
    order: { type: Number, required: true },
    created_at: { type: String, default: () => new Date().toISOString() },
});
const SmtpDomain = (0, mongoose_1.model)('SmtpDomain', smtpDomainSchema, 'smtp_domains');
exports.default = SmtpDomain;
