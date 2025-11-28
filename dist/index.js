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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const emailRoutes_1 = __importDefault(require("./routes/emailRoutes"));
const noteRoutes_1 = __importDefault(require("./routes/noteRoutes"));
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const mailRoutes_1 = __importDefault(require("./routes/mailRoutes"));
const statsRoutes_1 = __importDefault(require("./routes/statsRoutes"));
const configRoutes_1 = __importDefault(require("./routes/configRoutes"));
const db_1 = require("./db");
const cleanupService_1 = require("./services/cleanupService");
const auth_1 = require("./middleware/auth");
const requirePro_1 = require("./middleware/requirePro");
dotenv_1.default.config();
async function start() {
    const app = (0, express_1.default)();
    const db = await (0, db_1.connectToDatabase)();
    app.use((0, cors_1.default)());
    // Stripe webhook must receive the raw body for signature verification
    app.use('/api/billing/webhook', express_1.default.raw({ type: 'application/json' }));
    // JSON parser for the rest of the API (be sure raw is mounted BEFORE json)
    app.use(express_1.default.json());
    // Pro-gated services
    app.use('/api/emails', auth_1.authenticate, requirePro_1.requirePro, emailRoutes_1.default);
    app.use('/api/notes', auth_1.authenticate, requirePro_1.requirePro, noteRoutes_1.default);
    app.use('/api/files', auth_1.authenticate, requirePro_1.requirePro, fileRoutes_1.default);
    app.use('/api/auth', authRoutes_1.default);
    app.use('/api/mail', mailRoutes_1.default);
    const smsRoutes = (await Promise.resolve().then(() => __importStar(require('./routes/smsRoutes')))).default;
    app.use('/api/sms', auth_1.authenticate, requirePro_1.requirePro, smsRoutes);
    const esimRoutes = (await Promise.resolve().then(() => __importStar(require('./routes/esimRoutes')))).default;
    app.use('/api/esim', auth_1.authenticate, requirePro_1.requirePro, esimRoutes);
    app.use('/api/stats', statsRoutes_1.default);
    app.use('/api/config', configRoutes_1.default);
    // Mount IMAP routes for reading messages from a configured mailbox. These
    // endpoints replicate the behaviour of Hi.zip and allow clients to fetch
    // inbound messages via `/api/get-all`. They use the imap-simple package
    // and environment variables MAIL_USER, MAIL_PASS, MAIL_HOST, MAIL_PORT
    // and MAIL_TLS. See src/routes/imapRoutes.ts for implementation.
    const imapRoutes = (await Promise.resolve().then(() => __importStar(require('./routes/imapRoutes')))).default;
    app.use('/api', imapRoutes);
    // Mount domain management routes. These endpoints allow administrators
    // to configure SMTP domains used for free email sending. See
    // backend/src/routes/domainRoutes.ts for implementation details.
    const domainRoutes = (await Promise.resolve().then(() => __importStar(require('./routes/domainRoutes')))).default;
    app.use('/api/domains', domainRoutes);
    // Mount admin routes for user management and system statistics
    const adminRoutes = (await Promise.resolve().then(() => __importStar(require('./routes/adminRoutes')))).default;
    app.use('/api/admin', adminRoutes);
    const billingRoutes = (await Promise.resolve().then(() => __importStar(require('./routes/billingRoutes')))).default;
    app.use('/api/billing', billingRoutes);
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    const port = Number(process.env.PORT) || 4000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server ready at http://0.0.0.0:${port}`);
    });
    // Start background job to remove expired / over-downloaded files
    try {
        (0, cleanupService_1.startFileCleanupJob)();
        (0, cleanupService_1.startNoteCleanupJob)();
        (0, cleanupService_1.startSmsCleanupJob)();
        // Periodically enforce subscription state (downgrade after grace)
        (0, cleanupService_1.startSubscriptionEnforcementJob)();
        // Run once immediately at startup to catch already-expired accounts
        (0, cleanupService_1.enforceSubscriptionStatus)().catch((e) => console.error('Initial subscription enforcement failed', e));
    }
    catch (e) {
        console.error('Failed to start cleanup job', e);
    }
}
start().catch((err) => {
    console.error('Failed to start server:', err);
});
