"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const stripe_1 = __importDefault(require("stripe"));
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
function isStripeConfigured() {
    // Consider Stripe configured if a secret key exists; price can be provided or we fallback to price_data
    return !!process.env.STRIPE_SECRET_KEY;
}
router.get('/public', (req, res) => {
    return res.json({ stripeConfigured: isStripeConfigured() });
});
router.post('/checkout', auth_1.authenticate, async (req, res) => {
    if (!isStripeConfigured())
        return res.status(501).json({ error: 'Billing not configured' });
    try {
        if (!req.user?.id)
            return res.status(401).json({ error: 'Unauthorized' });
        const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
        const priceId = process.env.STRIPE_PRICE_ID;
        const origin = req.headers.origin || process.env.APP_BASE_URL || 'http://localhost:3000';
        // Ensure customer linkage
        const user = await User_1.default.findById(req.user.id);
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }
        const lineItems = priceId
            ? [{ price: priceId, quantity: 1 }]
            : [{
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        recurring: { interval: 'month' },
                        unit_amount: 900, // $9.00/month default
                        product_data: { name: 'Cocoinbox Pro' },
                    },
                }];
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: lineItems,
            customer: customerId,
            success_url: `${origin}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/upgrade?canceled=1`,
        });
        return res.json({ url: session.url });
    }
    catch (e) {
        console.error('Stripe checkout error', e);
        return res.status(500).json({ error: e.message || 'Checkout failed' });
    }
});
router.post('/portal', auth_1.authenticate, async (req, res) => {
    if (!isStripeConfigured())
        return res.status(501).json({ error: 'Billing not configured' });
    try {
        if (!req.user?.id)
            return res.status(401).json({ error: 'Unauthorized' });
        const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
        const origin = req.headers.origin || process.env.APP_BASE_URL || 'http://localhost:3000';
        const user = await User_1.default.findById(req.user.id);
        if (!user?.stripeCustomerId)
            return res.status(400).json({ error: 'No Stripe customer' });
        // Choose a portal configuration: env override -> first active config -> friendly error
        let configurationId = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
        if (!configurationId) {
            try {
                const list = await stripe.billingPortal.configurations.list({ active: true, limit: 1 });
                if (list.data && list.data.length > 0) {
                    configurationId = list.data[0].id;
                }
            }
            catch (e) {
                // ignore and fall back to friendly error if none
            }
        }
        if (!configurationId) {
            return res.status(501).json({
                error: 'Stripe Billing Portal is not configured for this mode. Create a default configuration in test mode at https://dashboard.stripe.com/test/settings/billing/portal or set STRIPE_PORTAL_CONFIGURATION_ID.',
            });
        }
        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${origin}/dashboard`,
            configuration: configurationId,
        });
        return res.json({ url: session.url });
    }
    catch (e) {
        console.error('Stripe portal error', e);
        // Friendly message for common Stripe error when no default configuration exists
        if (e && typeof e.message === 'string' && e.message.includes('No configuration provided')) {
            return res.status(501).json({
                error: 'Stripe Billing Portal not configured. Create your default portal configuration in test mode: https://dashboard.stripe.com/test/settings/billing/portal',
            });
        }
        return res.status(500).json({ error: e.message || 'Portal failed' });
    }
});
// Post-checkout confirmation: when redirected from Stripe, the client can
// call this endpoint with the session_id to ensure the user is marked Pro
// without relying solely on webhooks.
router.get('/confirm', async (req, res) => {
    if (!isStripeConfigured())
        return res.status(501).json({ error: 'Billing not configured' });
    try {
        const sessionId = req.query.session_id;
        if (!sessionId)
            return res.status(400).json({ error: 'Missing session_id' });
        const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (!session || session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'Session not paid' });
        }
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (!customerId)
            return res.status(400).json({ error: 'No customer associated' });
        const user = await User_1.default.findOne({ stripeCustomerId: customerId });
        if (!user)
            return res.status(404).json({ error: 'User not found for session' });
        user.is_pro = true;
        user.subscriptionStatus = 'active';
        // Track billing period end if available (for future grace logic)
        if (session.expires_at) {
            // checkout.session has expires_at for the session itself; for period_end use subscription fetch in webhook
        }
        // Create 5-day grace window starting now (covers immediate access if any delay)
        user.proGraceUntil = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
        // Also add 'pro' to roles
        if (!user.roles.includes('pro')) {
            user.roles.push('pro');
        }
        await user.save();
        console.log(`✅ User ${user.email} upgraded to Pro via confirm endpoint`);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('Stripe confirm error', e);
        return res.status(500).json({ error: e.message || 'Confirm failed' });
    }
});
// Webhook endpoint placeholder - to be connected to Stripe events
// Stripe requires raw body to validate signatures
router.post('/webhook', async (req, res) => {
    if (!isStripeConfigured())
        return res.status(501).json({ error: 'Billing not configured' });
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const customerId = sub.customer;
                const status = sub.status;
                const user = await User_1.default.findOne({ stripeCustomerId: customerId });
                if (user) {
                    user.subscriptionStatus = status;
                    // Default: keep pro active until we explicitly downgrade via enforcement
                    user.is_pro = true;
                    // Set the current period end to manage grace windows
                    if (sub.current_period_end) {
                        user.subscriptionCurrentPeriodEnd = new Date(sub.current_period_end * 1000);
                    }
                    if (sub.current_period_start) {
                        user.subscriptionCurrentPeriodStart = new Date(sub.current_period_start * 1000);
                    }
                    if (sub.created) {
                        user.subscriptionCreatedAt = new Date(sub.created * 1000);
                    }
                    // If subscription became past due or unpaid, set grace for 5 days; if active, extend grace accordingly
                    if (status === 'past_due' || status === 'unpaid' || status === 'incomplete' || status === 'incomplete_expired' || status === 'canceled') {
                        // Start/refresh a 5-day grace
                        user.proGraceUntil = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
                    }
                    else if (status === 'active' || status === 'trialing') {
                        // Set grace to 5 days beyond current period end
                        if (user.subscriptionCurrentPeriodEnd) {
                            user.proGraceUntil = new Date(user.subscriptionCurrentPeriodEnd.getTime() + 5 * 24 * 60 * 60 * 1000);
                        }
                        else {
                            user.proGraceUntil = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
                        }
                    }
                    // Also add 'pro' to roles if user becomes Pro
                    if (user.is_pro && !user.roles.includes('pro')) {
                        user.roles.push('pro');
                    }
                    await user.save();
                    console.log(`✅ User ${user.email} subscription updated: ${status}, is_pro: ${user.is_pro}`);
                }
                break;
            }
            case 'checkout.session.completed': {
                const session = event.data.object;
                if (session.customer && typeof session.customer === 'string') {
                    const user = await User_1.default.findOne({ stripeCustomerId: session.customer });
                    if (user) {
                        user.is_pro = true;
                        user.subscriptionStatus = 'active';
                        // Create provisional grace until we get the subscription data
                        user.proGraceUntil = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
                        // Also add 'pro' to roles
                        if (!user.roles.includes('pro')) {
                            user.roles.push('pro');
                        }
                        await user.save();
                        console.log(`✅ User ${user.email} upgraded to Pro via checkout session`);
                    }
                }
                break;
            }
            default:
                // No-op
                break;
        }
        return res.json({ received: true });
    }
    catch (handlerErr) {
        console.error('Webhook handler error:', handlerErr);
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
});
exports.default = router;
