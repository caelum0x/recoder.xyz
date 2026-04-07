"use strict";
/**
 * @module scratchpad.routes
 *
 * HTTP routes for the A2A session-scoped scratchpad.
 * Mounted at /api/a2a/scratchpad
 *
 * POST /write         Write a key/value to a session scratchpad
 * POST /read          Read a key from a session scratchpad
 * GET  /list          List all keys in a session scratchpad
 * DELETE /key         Delete a key from a session scratchpad
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scratchpadRouter = void 0;
const express_1 = require("express");
const scratchpad_js_1 = require("./scratchpad.js");
const logger_js_1 = require("../logger.js");
const router = (0, express_1.Router)();
exports.scratchpadRouter = router;
function ok(res, data) {
    res.json({ success: true, data });
}
function fail(res, status, message) {
    res.status(status).json({ success: false, error: message });
}
// POST /api/a2a/scratchpad/write
router.post('/write', (req, res) => {
    const { sessionId, agentId = 'unknown', key, value } = req.body;
    if (!sessionId || !key)
        return fail(res, 400, 'sessionId and key are required');
    try {
        const entry = (0, scratchpad_js_1.scratchpadSet)({ sessionId, agentId, key, value });
        ok(res, entry);
    }
    catch (err) {
        logger_js_1.logger.warn({ err }, '[scratchpad.routes] write failed');
        fail(res, 500, err instanceof Error ? err.message : 'Write failed');
    }
});
// POST /api/a2a/scratchpad/read
router.post('/read', (req, res) => {
    const { sessionId, key } = req.body;
    if (!sessionId || !key)
        return fail(res, 400, 'sessionId and key are required');
    const entry = (0, scratchpad_js_1.scratchpadGet)({ sessionId, key });
    if (!entry)
        return ok(res, null);
    ok(res, entry);
});
// GET /api/a2a/scratchpad/list?sessionId=xxx
router.get('/list', (req, res) => {
    const sessionId = String(req.query.sessionId ?? '');
    if (!sessionId)
        return fail(res, 400, 'sessionId is required');
    const entries = (0, scratchpad_js_1.scratchpadList)({ sessionId });
    ok(res, entries);
});
// DELETE /api/a2a/scratchpad/key
router.delete('/key', (req, res) => {
    const { sessionId, key } = req.body;
    if (!sessionId || !key)
        return fail(res, 400, 'sessionId and key are required');
    const deleted = (0, scratchpad_js_1.scratchpadDelete)({ sessionId, key });
    ok(res, { deleted });
});
