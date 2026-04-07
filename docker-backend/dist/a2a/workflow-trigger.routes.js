"use strict";
/**
 * @module workflow-trigger.routes
 *
 * HTTP routes for triggering Hatchet workflows via A2A.
 * Mounted at /api/a2a/workflows
 *
 * POST /run           Trigger a workflow by ID with input context
 * POST /run-steps     Execute a list of workflow steps directly (ad-hoc)
 * GET  /health        Check Hatchet connectivity
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowTriggerRouter = void 0;
const express_1 = require("express");
const logger_js_1 = require("../logger.js");
const HATCHET_HOST = process.env.HATCHET_CLIENT_HOST ?? 'localhost:7077';
const HATCHET_API = process.env.HATCHET_API_URL ?? 'http://hatchet-api:8080';
const router = (0, express_1.Router)();
exports.workflowTriggerRouter = router;
function ok(res, data) {
    res.json({ success: true, data });
}
function fail(res, status, message) {
    res.status(status).json({ success: false, error: message });
}
// POST /api/a2a/workflows/run
// Trigger a Hatchet workflow run with input context.
// If Hatchet is not available, returns an error with instructions.
router.post('/run', async (req, res) => {
    const { workflowId, input = {} } = req.body;
    if (!workflowId)
        return fail(res, 400, 'workflowId is required');
    try {
        // Try to trigger via Hatchet API
        const triggerRes = await fetch(`${HATCHET_API}/api/v1/workflows/${workflowId}/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!triggerRes.ok) {
            const text = await triggerRes.text().catch(() => '');
            throw new Error(`Hatchet trigger failed ${triggerRes.status}: ${text.slice(0, 200)}`);
        }
        const data = (await triggerRes.json());
        ok(res, { workflowRunId: data.workflowRunId ?? 'unknown', workflowId, status: 'triggered' });
    }
    catch (err) {
        logger_js_1.logger.warn({ err, workflowId }, '[workflow-trigger] Hatchet trigger failed');
        fail(res, 503, err instanceof Error ? err.message : 'Hatchet not available');
    }
});
// POST /api/a2a/workflows/run-steps
// Execute a list of workflow steps directly (bypass Hatchet for ad-hoc runs).
// Each step type has a concrete executor: llm, http, code, branch, trigger.
router.post('/run-steps', async (req, res) => {
    const { steps, context = {} } = req.body;
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
        return fail(res, 400, 'steps[] is required');
    }
    const durable = req.query.durable === 'true' || req.body.durable === true;
    try {
        if (durable) {
            // Durable execution via Upstash Workflow — survives crashes, auto-resumes
            const { executeDurableWorkflow } = await Promise.resolve().then(() => __importStar(require('./durable-workflow.js')));
            const result = await executeDurableWorkflow(steps, context);
            ok(res, result);
        }
        else {
            // Direct execution — faster, no durability guarantees
            const { executeWorkflowSteps } = await Promise.resolve().then(() => __importStar(require('./workflow-step-executor.js')));
            const result = await executeWorkflowSteps(steps, context);
            ok(res, result);
        }
    }
    catch (err) {
        logger_js_1.logger.warn({ err }, '[workflow-trigger] run-steps failed');
        fail(res, 500, err instanceof Error ? err.message : 'Step execution failed');
    }
});
// GET /api/a2a/workflows/health
router.get('/health', async (_req, res) => {
    try {
        const hatchetRes = await fetch(`${HATCHET_API}/api/v1/meta`, {
            signal: AbortSignal.timeout(5_000),
        });
        ok(res, {
            hatchet: hatchetRes.ok ? 'connected' : 'unreachable',
            host: HATCHET_HOST,
        });
    }
    catch {
        ok(res, { hatchet: 'disconnected', host: HATCHET_HOST });
    }
});
