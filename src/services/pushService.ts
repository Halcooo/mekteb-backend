import { createHash, randomUUID } from 'node:crypto';
import webPush from 'web-push';
import type { RowDataPacket } from 'mysql2/promise';
import pool from '../db';
import { getPushConfig, validatePushSubscription } from '../config/webPush';

export class PushService {
  static async subscribe(userId: number, sessionId: string, input: unknown): Promise<void> {
    const config = getPushConfig();
    if (!config) throw new Error('Push is not configured');
    const subscription = validatePushSubscription(input);
    await pool.execute(
      `INSERT INTO push_subscriptions (id,user_id,session_id,endpoint,endpoint_hash,p256dh,auth,vapid_public_key)
       VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),session_id=VALUES(session_id),
       p256dh=VALUES(p256dh),auth=VALUES(auth),vapid_public_key=VALUES(vapid_public_key),updated_at=CURRENT_TIMESTAMP`,
      [randomUUID(),userId,sessionId,subscription.endpoint,createHash('sha256').update(subscription.endpoint).digest('hex'),subscription.keys.p256dh,subscription.keys.auth,config.publicKey]);
  }

  static async unsubscribe(userId: number, sessionId: string): Promise<void> {
    await pool.execute('DELETE FROM push_subscriptions WHERE user_id=? AND session_id=?', [userId,sessionId]);
  }

  // The library handles encryption/VAPID; injecting this boundary makes retries
  // testable without contacting a real user's push provider.
  static sendNotification = webPush.sendNotification.bind(webPush);

  static async processBatch(): Promise<number> {
    const config = getPushConfig();
    if (!config) return 0;
    const connection = await pool.getConnection();
    const claim = randomUUID();
    let ids: number[] = [];
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM push_deliveries WHERE
         (status='pending' AND available_at<=CURRENT_TIMESTAMP(3)) OR
         (status='processing' AND locked_at<DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 5 MINUTE))
         ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED`);
      ids = rows.map((row) => Number(row.id));
      for (const id of ids) await connection.execute("UPDATE push_deliveries SET status='processing', attempts=attempts+1,locked_at=CURRENT_TIMESTAMP(3),lock_token=? WHERE id=?", [claim,id]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    // A cron pass must not spend 10 sequential provider timeouts on one batch.
    // Wait for every claimed delivery before returning/closing the database.
    const delivered=await Promise.allSettled(ids.map(id=>this.deliver(id,claim,config)));
    if(delivered.some(result=>result.status==='rejected'))throw new Error('Push batch storage unavailable; leased jobs retained');
    return ids.length;
  }

  private static async deliver(id: number, claim: string, config: NonNullable<ReturnType<typeof getPushConfig>>): Promise<void> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT d.attempts,p.id AS subscription_id,p.endpoint,p.p256dh,p.auth,p.session_id,n.id AS notification_id
       FROM push_deliveries d JOIN push_subscriptions p ON p.id=d.subscription_id AND p.session_id=d.session_id
       JOIN auth_sessions a ON a.id=p.session_id AND a.user_id=p.user_id
       JOIN notifications n ON n.id=d.notification_id AND n.recipient_user_id=p.user_id
       JOIN student_comments c ON c.id=n.comment_id
       JOIN users u ON u.id=p.user_id
       WHERE d.id=? AND d.lock_token=? AND d.status='processing' AND n.is_read=0 AND c.deleted_at IS NULL
       AND a.revoked_at IS NULL AND a.expires_at>CURRENT_TIMESTAMP(3) AND p.vapid_public_key=?
       AND d.created_at>DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)
       AND (u.role IN ('admin','teacher') OR EXISTS (SELECT 1 FROM parent_students ps WHERE ps.user_id=p.user_id AND ps.student_id=n.student_id))`, [id,claim,config.publicKey]);
    const row = rows[0];
    const finish = (status: string, error: string | null = null, delay = 0) => pool.execute(
      `UPDATE push_deliveries SET status=?,last_error=?,lock_token=NULL,locked_at=NULL,
       available_at=TIMESTAMPADD(SECOND,?,CURRENT_TIMESTAMP(3)) WHERE id=? AND lock_token=?`, [status,error,delay,id,claim]);
    if (!row) { await finish('cancelled'); return; }
    try {
      const subscription = validatePushSubscription({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
      await this.sendNotification(subscription, JSON.stringify({ title: 'Mekteb E-dnevnik', body: 'Imate novu poruku u aplikaciji.', notificationId: row.notification_id, binding: row.session_id }), {
        vapidDetails: config, TTL: 3600, urgency: 'normal', timeout: 10_000,
        topic: createHash('sha256').update(`notification:${row.notification_id}`).digest('base64url').slice(0,32),
      });
      await finish('sent');
    } catch (error) {
      const status = Number((error as { statusCode?: number }).statusCode ?? 0);
      if (status === 404 || status === 410) {
        await pool.execute('DELETE FROM push_subscriptions WHERE id=? AND session_id=?', [row.subscription_id,row.session_id]);
      } else {
        const retry = (status === 0 || status === 429 || status >= 500) && row.attempts < 8;
        await finish(retry ? 'pending' : 'failed', status ? `HTTP_${status}` : 'DELIVERY_ERROR', Math.min(3600, 15 * 2 ** row.attempts));
      }
    }
  }
}

export function startPushWorker() {
  const mode=process.env.PUSH_WORKER_MODE??'inline';
  if(!['inline','external'].includes(mode))throw new Error('Invalid PUSH_WORKER_MODE');
  if(mode==='external')return async()=>{};
  if (!getPushConfig()) return async () => {};
  let running: Promise<unknown> | null = null, lastError = 0, stopped = false;
  const tick = () => {
    if (running || stopped) return;
    running = PushService.processBatch().catch(() => {
      if (Date.now() - lastError > 60_000) { console.error('[Push] Queue processing failed; jobs retained for retry'); lastError = Date.now(); }
    }).finally(() => { running = null; });
  };
  const timer = setInterval(tick, 2000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
