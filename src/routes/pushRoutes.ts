import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateToken } from '../middleware/authMiddleware';
import { getPushConfig, validatePushSubscription } from '../config/webPush';
import { PushService } from '../services/pushService';
const router = Router();
router.use(authenticateToken);
router.get('/config', (_req,res) => { const config=getPushConfig(); res.json({ success:true, data:{ enabled:Boolean(config), publicKey:config?.publicKey ?? null } }); });
router.post('/subscription', rateLimit({ windowMs:60_000,limit:10,keyGenerator:(req)=>String(req.user!.userId),standardHeaders:'draft-8',legacyHeaders:false }), async (req,res) => {
  if (!getPushConfig()) { res.status(503).json({ success:false,error:'PUSH_NOT_CONFIGURED' }); return; }
  try { validatePushSubscription(req.body); } catch { res.status(400).json({success:false,error:'INVALID_PUSH_SUBSCRIPTION'}); return; }
  try { await PushService.subscribe(req.user!.userId,req.user!.sessionId!,req.body); res.json({success:true}); }
  catch { res.status(503).json({success:false,error:'PUSH_UNAVAILABLE'}); }
});
router.delete('/subscription', async (req,res) => {
  try { await PushService.unsubscribe(req.user!.userId,req.user!.sessionId!); res.json({success:true}); }
  catch { res.status(503).json({success:false,error:'PUSH_UNAVAILABLE'}); }
});
export default router;
