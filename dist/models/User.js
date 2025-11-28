"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String },
    roles: { type: [String], default: ['user'] },
    is_pro: { type: Boolean, default: false },
    stripeCustomerId: { type: String },
    subscriptionStatus: { type: String, default: null },
    subscriptionCurrentPeriodEnd: { type: Date, default: null },
    proGraceUntil: { type: Date, default: null },
    subscriptionCurrentPeriodStart: { type: Date, default: null },
    subscriptionCreatedAt: { type: Date, default: null },
    // @ts-ignore
    created_at: { type: Date, default: Date.now },
});
const User = (0, mongoose_1.model)('User', userSchema);
exports.default = User;
