"use strict";
/**
 * @module canvas.routes
 *
 * Unified canvas update broadcast + persistence endpoint for the A2A system.
 *
 * Mounted at /api/a2a/canvas-update (with auth middleware applied by server.ts).
 *
 * POST /
 *   Body: { projectId, threadId?, elements, filePath?, sandboxId? }
 *   Broadcasts update to connected clients AND persists to sandbox file.
 *
 * GET /read
 *   Query: { sandboxId, filePath }
 *   Returns the current .excalidraw file contents from the sandbox.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCanvasRouter = createCanvasRouter;
const express_1 = require("express");
const uuid_1 = require("uuid");
const a2a_event_bus_1 = require("./a2a-event-bus");
const agent_bridge_service_1 = require("./agent-bridge.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-canvas-routes');
const canvasPersistenceQueues = new Map();
function publishCanvasEvent(projectId, threadId, elements) {
    (0, a2a_event_bus_1.getA2AEventBus)().publish({
        id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
        type: a2a_event_bus_1.A2AEventType.CanvasUpdate,
        timestamp: new Date().toISOString(),
        workspaceId: projectId,
        data: {
            projectId,
            threadId,
            elements,
            elementCount: elements.length,
        },
    });
}
function broadcastCanvasUpdate(projectId, threadId, elements) {
    (0, agent_bridge_service_1.getAgentBridgeService)().broadcastToWorkspace(projectId, {
        type: 'canvas_update',
        projectId,
        threadId: threadId ?? '',
        elements,
        timestamp: Date.now(),
    });
}
async function relayCanvasUpdate(options, body) {
    const relayUrl = (options.canvasHandlerUrl || '').trim();
    if (!relayUrl)
        return;
    const relay = options.relayFetch ?? fetch;
    const response = await relay(relayUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.internalServiceKey || ''}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
        throw new Error(`canvas handler relay failed with status ${response.status}`);
    }
}
/**
 * Merge incoming elements into an existing Excalidraw scene.
 * Elements are matched by `id` — existing elements are replaced, new ones appended.
 */
function mergeElements(existing, incoming) {
    const byId = new Map();
    for (const el of existing) {
        const id = el?.id;
        if (id)
            byId.set(id, el);
    }
    for (const el of incoming) {
        const id = el?.id;
        if (id) {
            byId.set(id, el); // replace or insert
        }
        else {
            // Element without id — just append
            byId.set(`_anon_${byId.size}`, el);
        }
    }
    return [...byId.values()];
}
/**
 * Persist elements to the sandbox .excalidraw file.
 * Reads the current file, merges elements, writes back.
 */
async function persistToSandbox(options, sandboxId, filePath, elements) {
    if (!options.writeFile || !options.readFile) {
        return false;
    }
    try {
        // Read current scene
        let scene;
        try {
            const raw = await options.readFile(sandboxId, filePath);
            scene = JSON.parse(raw);
            if (!Array.isArray(scene.elements)) {
                scene.elements = [];
            }
        }
        catch {
            // File doesn't exist or isn't valid JSON — create a new scene
            scene = {
                type: 'excalidraw',
                version: 2,
                source: 'https://agents.recoder.xyz',
                elements: [],
                appState: {},
                files: {},
            };
        }
        // Merge and write back
        scene.elements = mergeElements(scene.elements, elements);
        await options.writeFile(sandboxId, filePath, JSON.stringify(scene, null, 2));
        return true;
    }
    catch (err) {
        logger.warn({ err, sandboxId, filePath }, 'canvas file persistence failed (non-fatal)');
        return false;
    }
}
async function persistToSandboxSerial(options, sandboxId, filePath, elements) {
    const queueKey = JSON.stringify([sandboxId, filePath]);
    const previous = canvasPersistenceQueues.get(queueKey) ?? Promise.resolve();
    let releaseCurrent;
    const current = new Promise((resolve) => {
        releaseCurrent = resolve;
    });
    const queued = previous.catch(() => { }).then(() => current);
    canvasPersistenceQueues.set(queueKey, queued);
    try {
        await previous.catch(() => { });
        return await persistToSandbox(options, sandboxId, filePath, elements);
    }
    finally {
        releaseCurrent?.();
        if (canvasPersistenceQueues.get(queueKey) === queued) {
            canvasPersistenceQueues.delete(queueKey);
        }
    }
}
function createCanvasRouter(options = {}) {
    const router = (0, express_1.Router)();
    // ── POST / — push canvas update (broadcast + persist) ──────────────
    router.post('/', async (req, res) => {
        const { projectId, threadId, elements, filePath, sandboxId } = req.body;
        if (!projectId || typeof projectId !== 'string') {
            res.status(400).json({ success: false, error: 'projectId is required' });
            return;
        }
        if (!Array.isArray(elements)) {
            res.status(400).json({ success: false, error: 'elements must be an array' });
            return;
        }
        const normalizedThreadId = typeof threadId === 'string' && threadId.trim().length > 0 ? threadId.trim() : null;
        // 1. Broadcast to live clients (event bus + bridge + SSE relay)
        publishCanvasEvent(projectId, normalizedThreadId, elements);
        broadcastCanvasUpdate(projectId, normalizedThreadId, elements);
        let relayed = false;
        if (normalizedThreadId) {
            try {
                await relayCanvasUpdate(options, {
                    projectId,
                    threadId: normalizedThreadId,
                    elements,
                });
                relayed = true;
            }
            catch (err) {
                logger.warn({ err, url: options.canvasHandlerUrl, projectId, threadId: normalizedThreadId }, 'canvas handler relay failed (non-fatal)');
            }
        }
        // 2. Persist to sandbox file (if sandboxId + filePath provided)
        let persisted = false;
        if (sandboxId && filePath) {
            persisted = await persistToSandboxSerial(options, sandboxId, filePath, elements);
        }
        logger.info({ projectId, threadId: normalizedThreadId, elementCount: elements.length, persisted }, 'canvas update processed');
        res.json({
            success: true,
            data: {
                projectId,
                threadId: normalizedThreadId,
                elementCount: elements.length,
                relayed,
                persisted,
            },
        });
    });
    // ── GET /read — read current board state from sandbox ──────────────
    router.get('/read', async (req, res) => {
        const sandboxId = req.query.sandboxId;
        const filePath = req.query.filePath;
        if (!sandboxId || !filePath) {
            res.status(400).json({ success: false, error: 'sandboxId and filePath are required' });
            return;
        }
        if (!options.readFile) {
            res.status(501).json({ success: false, error: 'file read not available' });
            return;
        }
        try {
            const raw = await options.readFile(sandboxId, filePath);
            const scene = JSON.parse(raw);
            res.json({
                success: true,
                data: {
                    elements: scene.elements || [],
                    appState: scene.appState || {},
                    elementCount: (scene.elements || []).length,
                },
            });
        }
        catch (err) {
            logger.warn({ err, sandboxId, filePath }, 'canvas read failed');
            res.status(404).json({
                success: false,
                error: err?.message || 'Board file not found or unreadable',
            });
        }
    });
    return router;
}
