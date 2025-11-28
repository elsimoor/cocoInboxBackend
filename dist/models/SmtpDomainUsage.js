"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const smtpDomainUsageSchema = new mongoose_1.Schema({
    domain_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'SmtpDomain', required: true },
    window_start: { type: Date, required: true },
    count: { type: Number, required: true },
});
const SmtpDomainUsage = (0, mongoose_1.model)('SmtpDomainUsage', smtpDomainUsageSchema, 'smtp_domain_usage');
exports.default = SmtpDomainUsage;
