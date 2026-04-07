"use strict";
/**
 * @module search.routes
 *
 * HTTP routes for cross-platform Meilisearch queries.
 * Mounted at /api/a2a/search
 *
 * POST /          search across selected sources
 * POST /index     manually trigger content indexing (threads, pm, agency, files)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchRouter = void 0;
const express_1 = require("express");
const search_proxy_js_1 = require("./search-proxy.js");
const logger_js_1 = require("../logger.js");
const router = (0, express_1.Router)();
exports.searchRouter = router;
function ok(res, data) {
    res.json({ success: true, data });
}
function fail(res, status, message) {
    res.status(status).json({ success: false, error: message });
}
// POST /api/a2a/search
router.post('/', async (req, res) => {
    const { q, sources, limit = 10 } = req.body;
    if (!q || typeof q !== 'string' || !q.trim()) {
        return fail(res, 400, 'q (query) is required');
    }
    try {
        const results = await (0, search_proxy_js_1.searchAll)({
            query: q.trim(),
            sources,
            limit: Math.min(Number(limit) || 10, 50),
            sessionId: req.sessionId,
        });
        ok(res, results);
    }
    catch (err) {
        logger_js_1.logger.warn({ err }, '[search.routes] searchAll failed');
        fail(res, 500, err instanceof Error ? err.message : 'Search failed');
    }
});
// POST /api/a2a/search/index — manual index push
router.post('/index', async (req, res) => {
    const { type, document } = req.body;
    if (!type || !document) {
        return fail(res, 400, 'type and document are required');
    }
    try {
        switch (type) {
            case 'thread':
                await (0, search_proxy_js_1.indexThread)(document);
                break;
            case 'pm_feature':
                await (0, search_proxy_js_1.indexPmFeature)(document);
                break;
            case 'agency_item':
                await (0, search_proxy_js_1.indexAgencyItem)(document);
                break;
            case 'file':
                await (0, search_proxy_js_1.indexFile)(document);
                break;
            default:
                return fail(res, 400, `Unknown index type: ${type}. Use thread | pm_feature | agency_item | file`);
        }
        ok(res, { indexed: type });
    }
    catch (err) {
        logger_js_1.logger.warn({ err, type }, '[search.routes] index failed');
        fail(res, 500, err instanceof Error ? err.message : 'Index failed');
    }
});
