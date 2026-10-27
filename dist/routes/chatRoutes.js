"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = require("express-rate-limit");
const authMiddleware_1 = require("../middleware/authMiddleware");
const chatService_1 = require("../services/chatService");
const commentService_1 = require("../services/commentService");
const parentService_1 = require("../services/parentService");
const requestValidation_1 = require("../utils/requestValidation");
const dateInput_1 = require("../utils/dateInput");
const jwtService_1 = require("../services/jwtService");
const router = (0, express_1.Router)();
const bodyId = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
router.use(authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)(['admin', 'teacher', 'parent', 'user']));
const sending = (0, express_rate_limit_1.rateLimit)({ windowMs: 60000, limit: 40, keyGenerator: (req) => String(req.user.userId), standardHeaders: 'draft-8', legacyHeaders: false });
router.get('/conversations', async (req, res) => {
    const page = req.query.page === undefined ? 1 : (0, requestValidation_1.parsePositiveInteger)(req.query.page);
    const search = req.query.search ?? '';
    if (!page || page > 10000 || typeof search !== 'string' || search.length > 100 || (req.query.unreadOnly !== undefined && !['true', 'false'].includes(String(req.query.unreadOnly)))) {
        res.status(400).json({ success: false, error: 'INVALID_QUERY' });
        return;
    }
    try {
        res.json({ success: true, data: await chatService_1.ChatService.conversations(req.user.userId, req.user.role, search, (page - 1) * 50, undefined, req.query.unreadOnly === 'true') });
    }
    catch {
        res.status(503).json({ success: false, error: 'CHAT_UNAVAILABLE' });
    }
});
router.get('/conversations/:studentId', async (req, res) => {
    const id = (0, requestValidation_1.parsePositiveInteger)(req.params.studentId);
    if (!id) {
        res.status(400).json({ success: false, error: 'INVALID_STUDENT' });
        return;
    }
    try {
        const result = await chatService_1.ChatService.conversations(req.user.userId, req.user.role, '', 0, id);
        if (!result.conversations.length) {
            res.status(404).json({ success: false, error: 'CONVERSATION_NOT_FOUND' });
            return;
        }
        res.json({ success: true, data: result.conversations[0] });
    }
    catch {
        res.status(503).json({ success: false, error: 'CHAT_UNAVAILABLE' });
    }
});
router.patch('/:studentId/read', async (req, res) => {
    const id = (0, requestValidation_1.parsePositiveInteger)(req.params.studentId), throughId = bodyId(req.body?.throughId);
    if (!id || !throughId) {
        res.status(400).json({ success: false, error: 'INVALID_MESSAGE' });
        return;
    }
    try {
        if (['parent', 'user'].includes(req.user.role) && !await parentService_1.ParentService.isStudentConnectedToParentUser(req.user.userId, id)) {
            res.status(403).json({ success: false, error: 'FORBIDDEN' });
            return;
        }
        await chatService_1.ChatService.markRead(id, req.user.userId, throughId);
        res.json({ success: true });
    }
    catch {
        res.status(503).json({ success: false, error: 'CHAT_UNAVAILABLE' });
    }
});
router.get('/:studentId/messages', async (req, res) => {
    const studentId = (0, requestValidation_1.parsePositiveInteger)(req.params.studentId);
    const limit = req.query.limit === undefined ? 50 : (0, requestValidation_1.parsePositiveInteger)(req.query.limit);
    const before = req.query.before === undefined ? undefined : (0, requestValidation_1.parsePositiveInteger)(req.query.before);
    const date = req.query.date;
    if (!studentId || !limit || limit > 100 || before === null || (date !== undefined && !(0, dateInput_1.isDateOnlyInput)(date))) {
        res.status(400).json({ success: false, error: 'INVALID_QUERY' });
        return;
    }
    try {
        if (['parent', 'user'].includes(req.user.role) && !await parentService_1.ParentService.isStudentConnectedToParentUser(req.user.userId, studentId)) {
            res.status(403).json({ success: false, error: 'FORBIDDEN' });
            return;
        }
        res.json({ success: true, data: await chatService_1.ChatService.messages(studentId, { limit, before: before ?? undefined, date: date }) });
    }
    catch {
        res.status(503).json({ success: false, error: 'CHAT_UNAVAILABLE' });
    }
});
router.post('/:studentId/messages', sending, async (req, res) => {
    const studentId = (0, requestValidation_1.parsePositiveInteger)(req.params.studentId);
    const { content, date, parentCommentId, clientMessageId } = req.body ?? {};
    const parentId = parentCommentId == null ? undefined : bodyId(parentCommentId);
    if (!studentId || typeof content !== 'string' || !content.trim() || Array.from(content.trim()).length > 2000 || !(0, dateInput_1.isDateOnlyInput)(date) || parentId === null || typeof clientMessageId !== 'string' || !jwtService_1.SESSION_ID_PATTERN.test(clientMessageId)) {
        res.status(400).json({ success: false, error: 'INVALID_MESSAGE' });
        return;
    }
    try {
        const role = req.user.role;
        const message = await chatService_1.ChatService.send({ studentId, content: content.trim(), date, clientMessageId, parentCommentId: parentId, authorId: req.user.userId, authorRole: ['parent', 'user'].includes(role) ? 'parent' : role });
        res.status(201).json({ success: true, data: message });
    }
    catch (error) {
        res.status(error instanceof commentService_1.CommentServiceError ? error.status : 503).json({ success: false, error: error instanceof commentService_1.CommentServiceError ? error.message : 'CHAT_UNAVAILABLE' });
    }
});
exports.default = router;
