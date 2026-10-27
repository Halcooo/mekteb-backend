"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPushConfig = getPushConfig;
exports.validatePushSubscription = validatePushSubscription;
const node_crypto_1 = require("node:crypto");
require("../config/environment");
function getPushConfig() {
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_SUBJECT;
    if (!publicKey && !privateKey && !subject)
        return null;
    if (!publicKey || !privateKey || !subject)
        throw new Error('Configure all three WEB_PUSH_* values together');
    const ecdh = (0, node_crypto_1.createECDH)('prime256v1');
    try {
        if (!/^[\w-]{87}$/.test(publicKey) || !/^[\w-]{43}$/.test(privateKey))
            throw new Error();
        ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
        if (ecdh.getPublicKey().toString('base64url') !== publicKey)
            throw new Error();
        const url = new URL(subject);
        if (!['https:', 'mailto:'].includes(url.protocol) || !url.pathname || url.username || url.password || subject.includes('localhost'))
            throw new Error();
        if (url.protocol === 'mailto:' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname))
            throw new Error();
    }
    catch {
        throw new Error('Invalid Web Push VAPID key pair or subject');
    }
    return { publicKey, privateKey, subject };
}
function validatePushSubscription(input) {
    const value = input;
    if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048)
        throw new Error('Invalid push subscription');
    const url = new URL(value.endpoint);
    const hosts = (process.env.WEB_PUSH_ALLOWED_HOSTS ?? 'fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com').split(',').map((host) => host.trim().toLowerCase());
    // Restrict outbound destinations: arbitrary subscription URLs are an SSRF primitive.
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || !hosts.includes(url.hostname.toLowerCase()))
        throw new Error('Unsupported push service');
    const p256dh = value.keys?.p256dh, auth = value.keys?.auth;
    if (typeof p256dh !== 'string' || !/^[\w-]{87}$/.test(p256dh) || typeof auth !== 'string' || !/^[\w-]{22}$/.test(auth))
        throw new Error('Invalid subscription keys');
    try {
        node_crypto_1.ECDH.convertKey(Buffer.from(p256dh, 'base64url'), 'prime256v1');
    }
    catch {
        throw new Error('Invalid subscription key');
    }
    return { endpoint: url.href, keys: { p256dh, auth } };
}
