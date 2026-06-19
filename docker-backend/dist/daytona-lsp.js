"use strict";
/**
 * Daytona LSP Integration
 *
 * Provides code intelligence (completions, symbols, diagnostics) for
 * Spaces using Daytona's LSP server capabilities.
 *
 * Architecture:
 * - LSP endpoints are served by the main Daytona API at port 3900:
 *   POST/GET /api/toolbox/{sandboxId}/toolbox/lsp/*
 * - Auth uses either DAYTONA_API_KEY or DAYTONA_JWT_TOKEN + DAYTONA_ORGANIZATION_ID
 * - Request bodies use camelCase: languageId, pathToProject, uri, position
 * - document-symbols and workspace-symbols are GET with query params
 * - All other LSP ops (start, stop, completions, did-open, did-close) are POST
 *
 * Verified working against Daytona v0.152.1 on 2026-03-21.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.daytonaLspRouter = void 0;
const express_1 = require("express");
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('daytona-lsp');
const router = (0, express_1.Router)();
exports.daytonaLspRouter = router;
// ── Daytona API helpers ──────────────────────────────────────────
const DAYTONA_API_URL = process.env.DAYTONA_API_URL || process.env.DAYTONA_SERVER_URL || 'http://localhost:3900/api';
const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY || '';
const DAYTONA_JWT_TOKEN = process.env.DAYTONA_JWT_TOKEN || '';
const DAYTONA_ORGANIZATION_ID = process.env.DAYTONA_ORGANIZATION_ID || '';
function isDaytonaConfigured() {
    return !!(DAYTONA_API_KEY || (DAYTONA_JWT_TOKEN && DAYTONA_ORGANIZATION_ID));
}
/**
 * Call a Daytona toolbox LSP endpoint via the main API.
 * URL pattern: POST|GET /api/toolbox/{sandboxId}/toolbox/lsp/{endpoint}
 */
async function callDaytonaLsp(sandboxId, endpoint, method, body, queryParams, timeoutMs = 15000) {
    let url = `${DAYTONA_API_URL}/toolbox/${sandboxId}/toolbox/lsp/${endpoint}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
        const qs = new URLSearchParams(queryParams).toString();
        url = `${url}?${qs}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${DAYTONA_API_KEY || DAYTONA_JWT_TOKEN}`,
                ...(!DAYTONA_API_KEY && DAYTONA_JWT_TOKEN && DAYTONA_ORGANIZATION_ID
                    ? { 'X-Daytona-Organization-ID': DAYTONA_ORGANIZATION_ID }
                    : {}),
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Daytona LSP ${method} ${endpoint} failed: ${response.status} — ${text}`);
        }
        // 204 / empty body — success with no content
        const contentLength = response.headers.get('content-length');
        if (response.status === 204 || contentLength === '0') {
            return null;
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    }
    finally {
        clearTimeout(timer);
    }
}
// ── Route helpers ────────────────────────────────────────────────
function notConfigured(res) {
    res.status(503).json({ ok: false, error: 'Daytona not configured — set DAYTONA_API_KEY or DAYTONA_JWT_TOKEN + DAYTONA_ORGANIZATION_ID' });
}
// ── Routes ───────────────────────────────────────────────────────
/**
 * POST /api/daytona/lsp/:sandboxId/start
 * Start an LSP server for a language in the sandbox.
 *
 * Body: { languageId: string, pathToProject: string }
 * languageId values: "typescript", "python", "go", "rust", "javascript", etc.
 */
router.post('/:sandboxId/start', async (req, res) => {
    if (!isDaytonaConfigured())
        return notConfigured(res);
    const { sandboxId } = req.params;
    const { languageId = 'typescript', pathToProject = '/home/daytona' } = req.body;
    try {
        await callDaytonaLsp(sandboxId, 'start', 'POST', { languageId, pathToProject });
        logger.info({ sandboxId, languageId, pathToProject }, 'LSP server started');
        res.json({ ok: true, sandboxId, languageId, pathToProject });
    }
    catch (err) {
        logger.error({ sandboxId, languageId, err }, 'Failed to start LSP');
        res.status(500).json({ ok: false, error: err.message });
    }
});
/**
 * POST /api/daytona/lsp/:sandboxId/stop
 * Stop an LSP server in the sandbox.
 *
 * Body: { languageId: string, pathToProject: string }
 */
router.post('/:sandboxId/stop', async (req, res) => {
    if (!isDaytonaConfigured())
        return notConfigured(res);
    const { sandboxId } = req.params;
    const { languageId = 'typescript', pathToProject = '/home/daytona' } = req.body;
    try {
        await callDaytonaLsp(sandboxId, 'stop', 'POST', { languageId, pathToProject });
        logger.info({ sandboxId, languageId }, 'LSP server stopped');
        res.json({ ok: true, sandboxId, languageId });
    }
    catch (err) {
        logger.warn({ sandboxId, languageId, err }, 'Failed to stop LSP (may not have been running)');
        // Stop errors are non-fatal — return ok so callers can proceed
        res.json({ ok: true, sandboxId, languageId, warning: err.message });
    }
});
/**
 * POST /api/daytona/lsp/:sandboxId/did-open
 * Notify LSP that a file was opened. Required before completions/symbols work.
 *
 * Body: { languageId: string, pathToProject: string, uri: string }
 * uri format: "file:///home/daytona/src/App.tsx"
 */
router.post('/:sandboxId/did-open', async (req, res) => {
    if (!isDaytonaConfigured())
        return notConfigured(res);
    const { sandboxId } = req.params;
    const { languageId = 'typescript', pathToProject = '/home/daytona', uri } = req.body;
    if (!uri) {
        return res.status(400).json({ ok: false, error: 'uri is required' });
    }
    try {
        await callDaytonaLsp(sandboxId, 'did-open', 'POST', { languageId, pathToProject, uri });
        logger.debug({ sandboxId, uri }, 'LSP did-open');
        res.json({ ok: true, sandboxId, uri });
    }
    catch (err) {
        logger.error({ sandboxId, uri, err }, 'LSP did-open failed');
        res.status(500).json({ ok: false, error: err.message });
    }
});
/**
 * POST /api/daytona/lsp/:sandboxId/did-close
 * Notify LSP that a file was closed.
 *
 * Body: { languageId: string, pathToProject: string, uri: string }
 */
router.post('/:sandboxId/did-close', async (req, res) => {
    if (!isDaytonaConfigured())
        return notConfigured(res);
    const { sandboxId } = req.params;
    const { languageId = 'typescript', pathToProject = '/home/daytona', uri } = req.body;
    if (!uri) {
        return res.status(400).json({ ok: false, error: 'uri is required' });
    }
    try {
        await callDaytonaLsp(sandboxId, 'did-close', 'POST', { languageId, pathToProject, uri });
        res.json({ ok: true, sandboxId, uri });
    }
    catch (err) {
        res.json({ ok: true, sandboxId, uri, warning: err.message });
    }
});
/**
 * POST /api/daytona/lsp/:sandboxId/completions
 * Get code completions at a cursor position.
 *
 * Body: {
 *   languageId: string,
 *   pathToProject: string,
 *   uri: string,
 *   position: { line: number, character: number },
 *   context?: { triggerKind: number, triggerCharacter?: string }
 * }
 *
 * Returns: { ok, isIncomplete, items[] } where items are LSP CompletionItem:
 *   { label, kind, sortText, filterText, insertText, detail, documentation }
 */
router.post('/:sandboxId/completions', async (req, res) => {
    if (!isDaytonaConfigured())
        return notConfigured(res);
    const { sandboxId } = req.params;
    const { languageId = 'typescript', pathToProject = '/home/daytona', uri, position, context } = req.body;
    if (!uri)
        return res.status(400).json({ ok: false, error: 'uri is required' });
    if (!position || position.line === undefined || position.character === undefined) {
        return res.status(400).json({ ok: false, error: 'position.line and position.character are required' });
    }
    try {
        const body = { languageId, pathToProject, uri, position };
        if (context)
            body.context = context;
        // Daytona returns { isIncomplete: boolean, items: CompletionItem[] }
        const result = await callDaytonaLsp(sandboxId, 'completions', 'POST', body, undefined, 10000);
        const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result) ? result : []);
        const isIncomplete = result?.isIncomplete ?? false;
        logger.debug({ sandboxId, uri, line: position.line, character: position.character, count: items.length }, 'LSP completions');
        res.json({ ok: true, isIncomplete, items });
    }
    catch (err) {
        // Return empty completions gracefully — LSP might not be fully initialized
        logger.warn({ sandboxId, uri, err }, 'LSP completions failed, returning empty');
        res.json({ ok: true, isIncomplete: false, items: [], warning: err.message });
    }
});
/**
 * POST /api/daytona/lsp/:sandboxId/diagnostics
 * Get diagnostics (errors, warnings) for a file.
 *
 * NOTE: Daytona's LSP API does not expose a standalone diagnostics endpoint.
 * Diagnostics are pushed by the LSP server after did-open and file changes.
 * This endpoint returns empty diagnostics and is kept for API compatibility
 * with useLSPDiagnostics hook. Future work: implement via WebSocket notifications.
 *
 * Body: { file: string, language?: string }
 */
router.post('/:sandboxId/diagnostics', async (_req, res) => {
    // Daytona doesn't expose a pull-based diagnostics endpoint.
    // The LSP server pushes diagnostics via notifications after did-open.
    // Return empty array — the useLSPDiagnostics hook handles empty gracefully.
    res.json({ ok: true, diagnostics: [] });
});
/**
 * GET /api/daytona/lsp/:sandboxId/document-symbols?languageId=&pathToProject=&uri=
 * Get symbols (functions, classes, variables) in a document.
 *
 * Query params: languageId, pathToProject, uri (all URL-encoded)
 *
 * Returns: array of LspSymbol { name: string, kind: number, location: { uri, range } }
 * kind values (LSP SymbolKind): 1=File, 2=Module, 5=Class, 6=Method, 12=Function, 13=Variable, 14=Constant, etc.
 */
router.get('/:sandboxId/document-symbols', async (req, res) => {
    if (!isDaytonaConfigured())
        return notConfigured(res);
    const { sandboxId } = req.params;
    const { languageId = 'typescript', pathToProject = '/home/daytona', uri } = req.query;
    if (!uri)
        return res.status(400).json({ ok: false, error: 'uri query param is required' });
    try {
        const result = await callDaytonaLsp(sandboxId, 'document-symbols', 'GET', undefined, { languageId, pathToProject, uri }, 10000);
        const symbols = Array.isArray(result) ? result : [];
        res.json({ ok: true, symbols });
    }
    catch (err) {
        res.json({ ok: true, symbols: [], warning: err.message });
    }
});
/**
 * GET /api/daytona/lsp/:sandboxId/workspace-symbols?languageId=&pathToProject=&query=
 * Search for symbols across the entire workspace.
 *
 * Query params: languageId, pathToProject, query (search term)
 *
 * Returns: array of LspSymbol matching the query.
 */
router.get('/:sandboxId/workspace-symbols', async (req, res) => {
    if (!isDaytonaConfigured())
        return notConfigured(res);
    const { sandboxId } = req.params;
    const { languageId = 'typescript', pathToProject = '/home/daytona', query = '' } = req.query;
    try {
        const result = await callDaytonaLsp(sandboxId, 'workspace-symbols', 'GET', undefined, { languageId, pathToProject, query }, 10000);
        const symbols = Array.isArray(result) ? result : [];
        res.json({ ok: true, symbols });
    }
    catch (err) {
        res.json({ ok: true, symbols: [], warning: err.message });
    }
});
