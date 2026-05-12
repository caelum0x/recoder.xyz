"use strict";
/**
 * @module code-search.routes
 *
 * HTTP routes for semantic code search.
 * Mounted at /api/a2a/code-search
 *
 * POST /search        semantic search within a project
 * POST /index         manually trigger file indexing
 * DELETE /project/:id drop entire project index
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeSearchRouter = void 0;
const express_1 = require("express");
const code_search_js_1 = require("./code-search.js");
const logger_js_1 = require("../logger.js");
const router = (0, express_1.Router)();
exports.codeSearchRouter = router;
function ok(res, data) {
    res.json({ success: true, data });
}
function err(res, status, message) {
    res.status(status).json({ success: false, error: message });
}
// POST /api/a2a/code-search/search
router.post('/search', async (req, res) => {
    const { projectId, query, limit = 10 } = req.body;
    if (!projectId || !query) {
        return err(res, 400, 'projectId and query are required');
    }
    try {
        const results = await (0, code_search_js_1.searchCode)({ projectId, query, limit, userId: req.userId });
        ok(res, results);
    }
    catch (e) {
        logger_js_1.logger.warn({ e }, '[code-search.routes] search failed');
        err(res, 500, e instanceof Error ? e.message : 'Search failed');
    }
});
// POST /api/a2a/code-search/index — index or re-index a file
router.post('/index', async (req, res) => {
    const { projectId, filePath, content, debounce = true } = req.body;
    if (!projectId || !filePath || content == null) {
        return err(res, 400, 'projectId, filePath, and content are required');
    }
    try {
        await (0, code_search_js_1.indexFile)({ projectId, filePath, content, debounce, userId: req.userId });
        ok(res, { queued: debounce, filePath });
    }
    catch (e) {
        logger_js_1.logger.warn({ e }, '[code-search.routes] index failed');
        err(res, 500, e instanceof Error ? e.message : 'Index failed');
    }
});
// DELETE /api/a2a/code-search/project/:projectId
router.delete('/project/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        await (0, code_search_js_1.dropProjectIndex)(projectId);
        ok(res, { dropped: projectId });
    }
    catch (e) {
        logger_js_1.logger.warn({ e }, '[code-search.routes] drop failed');
        err(res, 500, e instanceof Error ? e.message : 'Drop failed');
    }
});
