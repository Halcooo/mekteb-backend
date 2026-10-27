"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = require("express-rate-limit");
const authMiddleware_1 = require("../middleware/authMiddleware");
const webPush_1 = require("../config/webPush");
const pushService_1 = require("../services/pushService");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
router.get('/config', (_req, res) => { const config = (0, webPush_1.getPushConfig)(); res.json({ success: true, data: { enabled: Boolean(config), publicKey: config?.publicKey ?? null } }); });
router.post('/subscription', (0, express_rate_limit_1.rateLimit)({ windowMs: 60000, limit: 10, keyGenerator: (req) => String(req.user.userId), standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    if (!(0, webPush_1.getPushConfig)()) {
        res.status(503).json({ success: false, error: 'PUSH_NOT_CONFIGURED' });
        return;
    }
    try {
        (0, webPush_1.validatePushSubscription)(req.body);
    }
    catch {
        res.status(400).json({ success: false, error: 'INVALID_PUSH_SUBSCRIPTION' });
        return;
    }
    try {
        await pushService_1.PushService.subscribe(req.user.userId, req.user.sessionId, req.body);
        res.json({ success: true });
    }
    catch {
        res.status(503).json({ success: false, error: 'PUSH_UNAVAILABLE' });
    }
});
router.delete('/subscription', async (req, res) => {
    try {
        await pushService_1.PushService.unsubscribe(req.user.userId, req.user.sessionId);
        res.json({ success: true });
    }
    catch {
        res.status(503).json({ success: false, error: 'PUSH_UNAVAILABLE' });
    }
});
exports.default = router;
