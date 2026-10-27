"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
exports.startPushWorker = startPushWorker;
const node_crypto_1 = require("node:crypto");
const web_push_1 = __importDefault(require("web-push"));
const db_1 = __importDefault(require("../db"));
const webPush_1 = require("../config/webPush");
class PushService {
    static async subscribe(userId, sessionId, input) {
        const config = (0, webPush_1.getPushConfig)();
        if (!config)
            throw new Error('Push is not configured');
        const subscription = (0, webPush_1.validatePushSubscription)(input);
        await db_1.default.execute(`INSERT INTO push_subscriptions (id,user_id,session_id,endpoint,endpoint_hash,p256dh,auth,vapid_public_key)
       VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),session_id=VALUES(session_id),
       p256dh=VALUES(p256dh),auth=VALUES(auth),vapid_public_key=VALUES(vapid_public_key),updated_at=CURRENT_TIMESTAMP`, [(0, node_crypto_1.randomUUID)(), userId, sessionId, subscription.endpoint, (0, node_crypto_1.createHash)('sha256').update(subscription.endpoint).digest('hex'), subscription.keys.p256dh, subscription.keys.auth, config.publicKey]);
    }
    static async unsubscribe(userId, sessionId) {
        await db_1.default.execute('DELETE FROM push_subscriptions WHERE user_id=? AND session_id=?', [userId, sessionId]);
    }
    static async processBatch() {
        const config = (0, webPush_1.getPushConfig)();
        if (!config)
            return 0;
        const connection = await db_1.default.getConnection();
        const claim = (0, node_crypto_1.randomUUID)();
        let ids = [];
        try {
            await connection.beginTransaction();
            const [rows] = await connection.query(`SELECT id FROM push_deliveries WHERE
         (status='pending' AND available_at<=CURRENT_TIMESTAMP(3)) OR
         (status='processing' AND locked_at<DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 5 MINUTE))
         ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED`);
            ids = rows.map((row) => Number(row.id));
            for (const id of ids)
                await connection.execute("UPDATE push_deliveries SET status='processing', attempts=attempts+1,locked_at=CURRENT_TIMESTAMP(3),lock_token=? WHERE id=?", [claim, id]);
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
        // A cron pass must not spend 10 sequential provider timeouts on one batch.
        // Wait for every claimed delivery before returning/closing the database.
        const delivered = await Promise.allSettled(ids.map(id => this.deliver(id, claim, config)));
        if (delivered.some(result => result.status === 'rejected'))
            throw new Error('Push batch storage unavailable; leased jobs retained');
        return ids.length;
    }
    static async deliver(id, claim, config) {
        const [rows] = await db_1.default.execute(`SELECT d.attempts,p.id AS subscription_id,p.endpoint,p.p256dh,p.auth,p.session_id,n.id AS notification_id
       FROM push_deliveries d JOIN push_subscriptions p ON p.id=d.subscription_id AND p.session_id=d.session_id
       JOIN auth_sessions a ON a.id=p.session_id AND a.user_id=p.user_id
       JOIN notifications n ON n.id=d.notification_id AND n.recipient_user_id=p.user_id
       JOIN student_comments c ON c.id=n.comment_id
       JOIN users u ON u.id=p.user_id
       WHERE d.id=? AND d.lock_token=? AND d.status='processing' AND n.is_read=0 AND c.deleted_at IS NULL
       AND a.revoked_at IS NULL AND a.expires_at>CURRENT_TIMESTAMP(3) AND p.vapid_public_key=?
       AND d.created_at>DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)
       AND (u.role IN ('admin','teacher') OR EXISTS (SELECT 1 FROM parent_students ps WHERE ps.user_id=p.user_id AND ps.student_id=n.student_id))`, [id, claim, config.publicKey]);
        const row = rows[0];
        const finish = (status, error = null, delay = 0) => db_1.default.execute(`UPDATE push_deliveries SET status=?,last_error=?,lock_token=NULL,locked_at=NULL,
       available_at=TIMESTAMPADD(SECOND,?,CURRENT_TIMESTAMP(3)) WHERE id=? AND lock_token=?`, [status, error, delay, id, claim]);
        if (!row) {
            await finish('cancelled');
            return;
        }
        try {
            const subscription = (0, webPush_1.validatePushSubscription)({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
            await this.sendNotification(subscription, JSON.stringify({ title: 'Mekteb E-dnevnik', body: 'Imate novu poruku u aplikaciji.', notificationId: row.notification_id, binding: row.session_id }), {
                vapidDetails: config, TTL: 3600, urgency: 'normal', timeout: 10000,
                topic: (0, node_crypto_1.createHash)('sha256').update(`notification:${row.notification_id}`).digest('base64url').slice(0, 32),
            });
            await finish('sent');
        }
        catch (error) {
            const status = Number(error.statusCode ?? 0);
            if (status === 404 || status === 410) {
                await db_1.default.execute('DELETE FROM push_subscriptions WHERE id=? AND session_id=?', [row.subscription_id, row.session_id]);
            }
            else {
                const retry = (status === 0 || status === 429 || status >= 500) && row.attempts < 8;
                await finish(retry ? 'pending' : 'failed', status ? `HTTP_${status}` : 'DELIVERY_ERROR', Math.min(3600, 15 * 2 ** row.attempts));
            }
        }
    }
}
exports.PushService = PushService;
// The library handles encryption/VAPID; injecting this boundary makes retries
// testable without contacting a real user's push provider.
PushService.sendNotification = web_push_1.default.sendNotification.bind(web_push_1.default);
function startPushWorker() {
    const mode = process.env.PUSH_WORKER_MODE ?? 'inline';
    if (!['inline', 'external'].includes(mode))
        throw new Error('Invalid PUSH_WORKER_MODE');
    if (mode === 'external')
        return async () => { };
    if (!(0, webPush_1.getPushConfig)())
        return async () => { };
    let running = null, lastError = 0, stopped = false;
    const tick = () => {
        if (running || stopped)
            return;
        running = PushService.processBatch().catch(() => {
            if (Date.now() - lastError > 60000) {
                console.error('[Push] Queue processing failed; jobs retained for retry');
                lastError = Date.now();
            }
        }).finally(() => { running = null; });
    };
    const timer = setInterval(tick, 2000);
    timer.unref();
    tick();
    return async () => { stopped = true; clearInterval(timer); await running; };
}
