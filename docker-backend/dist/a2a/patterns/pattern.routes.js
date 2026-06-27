"use strict";
/**
 * @module patterns/pattern.routes
 *
 * Express routes for executing collaboration patterns.
 *
 * | Method | Path      | Description                     |
 * |--------|-----------|---------------------------------|
 * | GET    | /         | List available patterns         |
 * | GET    | /:type    | Get pattern details             |
 * | POST   | /execute  | Execute a collaboration pattern |
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.patternRouter = void 0;
const express_1 = require("express");
const pattern_registry_1 = require("./pattern-registry");
const logger_1 = require("../../logger");
const logger = (0, logger_1.createLogger)('a2a-pattern-routes');
exports.patternRouter = (0, express_1.Router)();
// Parse JSON text body
exports.patternRouter.use((req, _res, next) => {
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        }
        catch {
            // leave as-is
        }
    }
    next();
});
// GET / -- List available patterns
exports.patternRouter.get('/', (_req, res) => {
    try {
        const registry = (0, pattern_registry_1.getPatternRegistry)();
        res.status(200).json({
            success: true,
            data: {
                patterns: registry.getDetails(),
                count: registry.list().length,
            },
        });
    }
    catch (err) {
        logger.error({ err }, 'Error listing patterns');
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
});
// GET /:type -- Get pattern details
exports.patternRouter.get('/:type', (req, res) => {
    try {
        const { type } = req.params;
        const registry = (0, pattern_registry_1.getPatternRegistry)();
        const pattern = registry.get(type);
        if (!pattern) {
            res.status(404).json({
                success: false,
                error: { message: `Pattern not found: ${type}`, available: registry.list() },
            });
            return;
        }
        const details = registry.getDetails().find((d) => d.type === type);
        res.status(200).json({
            success: true,
            data: {
                type: pattern.patternType,
                description: details?.description || '',
            },
        });
    }
    catch (err) {
        logger.error({ err }, 'Error getting pattern details');
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
});
// POST /execute -- Execute a collaboration pattern
exports.patternRouter.post('/execute', async (req, res) => {
    try {
        const { patternType, config, input } = req.body || {};
        if (!patternType || typeof patternType !== 'string') {
            res.status(400).json({
                success: false,
                error: { message: 'Missing required field: patternType' },
            });
            return;
        }
        const registry = (0, pattern_registry_1.getPatternRegistry)();
        const pattern = registry.get(patternType);
        if (!pattern) {
            res.status(404).json({
                success: false,
                error: { message: `Pattern not found: ${patternType}`, available: registry.list() },
            });
            return;
        }
        if (!config || !input) {
            res.status(400).json({
                success: false,
                error: { message: 'Missing required fields: config, input' },
            });
            return;
        }
        const patternConfig = {
            patternType: patternType,
            workspaceId: config.workspaceId || 'default',
            threadId: config.threadId || `thr-${Date.now()}`,
            requester: config.requester || { agent_id: 'api-caller', platform: 'recoder_app', name: 'API Caller' },
        };
        const result = await pattern.execute(patternConfig, input);
        res.status(result.success ? 200 : 500).json({
            success: result.success,
            data: result,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Error executing pattern');
        res.status(500).json({
            success: false,
            error: { message: `Pattern execution failed: ${message}` },
        });
    }
});
