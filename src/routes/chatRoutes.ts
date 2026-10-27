import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticateToken, requireRole } from '../middleware/authMiddleware';
import { ChatService } from '../services/chatService';
import { CommentServiceError } from '../services/commentService';
import { ParentService } from '../services/parentService';
import { parsePositiveInteger } from '../utils/requestValidation';
import { isDateOnlyInput } from '../utils/dateInput';
import { SESSION_ID_PATTERN } from '../services/jwtService';

const router = Router();
const bodyId=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
router.use(authenticateToken, requireRole(['admin','teacher','parent','user']));
const sending = rateLimit({ windowMs: 60_000, limit: 40, keyGenerator: (req) => String(req.user!.userId), standardHeaders: 'draft-8', legacyHeaders: false });
router.get('/conversations',async(req,res)=>{
  const page=req.query.page===undefined?1:parsePositiveInteger(req.query.page);
  const search=req.query.search??'';
  if(!page||page>10000||typeof search!=='string'||search.length>100||(req.query.unreadOnly!==undefined&&!['true','false'].includes(String(req.query.unreadOnly)))){res.status(400).json({success:false,error:'INVALID_QUERY'});return;}
  try{res.json({success:true,data:await ChatService.conversations(req.user!.userId,req.user!.role,search,(page-1)*50,undefined,req.query.unreadOnly==='true')});}catch{res.status(503).json({success:false,error:'CHAT_UNAVAILABLE'});}
});
router.get('/conversations/:studentId',async(req,res)=>{
  const id=parsePositiveInteger(req.params.studentId);if(!id){res.status(400).json({success:false,error:'INVALID_STUDENT'});return;}
  try{
    const result=await ChatService.conversations(req.user!.userId,req.user!.role,'',0,id);
    if(!result.conversations.length){res.status(404).json({success:false,error:'CONVERSATION_NOT_FOUND'});return;}
    res.json({success:true,data:result.conversations[0]});
  }catch{res.status(503).json({success:false,error:'CHAT_UNAVAILABLE'});}
});
router.patch('/:studentId/read',async(req,res)=>{
  const id=parsePositiveInteger(req.params.studentId),throughId=bodyId(req.body?.throughId);
  if(!id||!throughId){res.status(400).json({success:false,error:'INVALID_MESSAGE'});return;}
  try{
    if(['parent','user'].includes(req.user!.role)&&!await ParentService.isStudentConnectedToParentUser(req.user!.userId,id)){res.status(403).json({success:false,error:'FORBIDDEN'});return;}
    await ChatService.markRead(id,req.user!.userId,throughId);res.json({success:true});
  }catch{res.status(503).json({success:false,error:'CHAT_UNAVAILABLE'});}
});
router.get('/:studentId/messages', async (req, res) => {
  const studentId = parsePositiveInteger(req.params.studentId);
  const limit = req.query.limit === undefined ? 50 : parsePositiveInteger(req.query.limit);
  const before = req.query.before === undefined ? undefined : parsePositiveInteger(req.query.before);
  const date = req.query.date;
  if (!studentId || !limit || limit > 100 || before === null || (date !== undefined && !isDateOnlyInput(date))) { res.status(400).json({ success: false, error: 'INVALID_QUERY' }); return; }
  try {
    if (['parent','user'].includes(req.user!.role) && !await ParentService.isStudentConnectedToParentUser(req.user!.userId, studentId)) { res.status(403).json({ success: false, error: 'FORBIDDEN' }); return; }
    res.json({ success: true, data: await ChatService.messages(studentId, { limit, before: before ?? undefined, date: date as string | undefined }) });
  } catch { res.status(503).json({ success: false, error: 'CHAT_UNAVAILABLE' }); }
});
router.post('/:studentId/messages', sending, async (req, res) => {
  const studentId = parsePositiveInteger(req.params.studentId);
  const { content, date, parentCommentId, clientMessageId } = req.body ?? {};
  const parentId = parentCommentId == null ? undefined : bodyId(parentCommentId);
  if (!studentId || typeof content !== 'string' || !content.trim() || Array.from(content.trim()).length > 2000 || !isDateOnlyInput(date) || parentId === null || typeof clientMessageId !== 'string' || !SESSION_ID_PATTERN.test(clientMessageId)) { res.status(400).json({ success: false, error: 'INVALID_MESSAGE' }); return; }
  try {
    const role = req.user!.role;
    const message = await ChatService.send({ studentId, content: content.trim(), date, clientMessageId, parentCommentId: parentId, authorId: req.user!.userId, authorRole: ['parent','user'].includes(role) ? 'parent' : role as 'admin' | 'teacher' });
    res.status(201).json({ success: true, data: message });
  } catch (error) { res.status(error instanceof CommentServiceError ? error.status : 503).json({ success: false, error: error instanceof CommentServiceError ? error.message : 'CHAT_UNAVAILABLE' }); }
});
export default router;
