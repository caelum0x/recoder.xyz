"use strict";
/**
 * @module agent-registry.routes
 *
 * Express route handlers for the Agent Registry REST API.
 *
 * Provides the following endpoints under the `/api/a2a/agents` prefix:
 *
 * | Method | Path                 | Description                                        |
 * |--------|----------------------|----------------------------------------------------|
 * | POST   | /                    | Register agent (body: identity, card, protocol, tier, tags) |
 * | DELETE | /:agentId            | Unregister agent                                   |
 * | GET    | /                    | Discover agents (query: protocol, platform, tier, status, skillTag) |
 * | GET    | /:agentId            | Get agent card and status                          |
 * | GET    | /:agentId/health     | Get agent health (last heartbeat, online/offline)  |
 * | POST   | /self-register       | Convenience self-registration with platform defaults |
 * | POST   | /:agentId/heartbeat  | Record agent heartbeat                             |
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentRegistryRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const agent_registry_service_1 = require("./agent-registry.service");
const agent_registry_middleware_1 = require("./agent-registry.middleware");
const a2a_event_bridge_1 = require("./a2a-event-bridge");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-agent-registry-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.agentRegistryRouter = (0, express_1.Router)();
// Parse JSON text body (since /api/a2a uses express.text())
exports.agentRegistryRouter.use(agent_registry_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST /self-register -- Self-register with platform defaults
// (Must be before /:agentId to avoid route collision)
// ---------------------------------------------------------------------------
exports.agentRegistryRouter.post('/self-register', agent_registry_middleware_1.validateSelfRegisterBody, (req, res) => {
    try {
        const service = (0, agent_registry_service_1.getAgentRegistryService)();
        const input = {
            agentId: req.body.agentId,
            name: req.body.name,
            platform: req.body.platform,
            url: req.body.url,
            description: req.body.description,
            version: req.body.version,
            tags: req.body.tags,
            skills: req.body.skills,
        };
        const agent = service.selfRegister(input);
        // Publish agent.registered event to the SSE event bus
        (0, a2a_event_bridge_1.publishAgentRegistered)({
            agent_id: agent.identity.id,
            name: agent.identity.name,
            platform: agent.identity.platform,
        });
        sendSuccess(res, agent, 201);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in POST /api/a2a/agents/self-register');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error during self-registration',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST / -- Register an agent
// ---------------------------------------------------------------------------
exports.agentRegistryRouter.post('/', agent_registry_middleware_1.validateRegisterBody, (req, res) => {
    try {
        const service = (0, agent_registry_service_1.getAgentRegistryService)();
        const input = {
            identity: {
                id: req.body.identity.id,
                name: req.body.identity.name,
                platform: req.body.identity.platform,
                instanceId: req.body.identity.instanceId,
                team: req.body.identity.team,
                version: req.body.identity.version,
            },
            card: {
                name: req.body.card.name,
                description: req.body.card.description,
                protocolVersion: req.body.card.protocolVersion || '0.3.0',
                version: req.body.card.version,
                url: req.body.card.url || '',
                skills: req.body.card.skills,
                capabilities: req.body.card.capabilities,
                defaultInputModes: req.body.card.defaultInputModes || ['text'],
                defaultOutputModes: req.body.card.defaultOutputModes || ['text'],
            },
            protocol: req.body.protocol,
            tier: req.body.tier,
            tags: req.body.tags,
        };
        const agent = service.register(input);
        // Publish agent.registered event to the SSE event bus
        (0, a2a_event_bridge_1.publishAgentRegistered)({
            agent_id: agent.identity.id,
            name: agent.identity.name,
            platform: agent.identity.platform,
        });
        sendSuccess(res, agent, 201);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in POST /api/a2a/agents');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error during agent registration',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET / -- Discover agents (with optional query filters)
// ---------------------------------------------------------------------------
exports.agentRegistryRouter.get('/', agent_registry_middleware_1.validateDiscoveryQuery, (req, res) => {
    try {
        const service = (0, agent_registry_service_1.getAgentRegistryService)();
        const query = {};
        if (typeof req.query.protocol === 'string')
            query.protocol = req.query.protocol;
        if (typeof req.query.platform === 'string')
            query.platform = req.query.platform;
        if (typeof req.query.tier === 'string')
            query.tier = req.query.tier;
        if (typeof req.query.status === 'string')
            query.status = req.query.status;
        if (typeof req.query.skillTag === 'string')
            query.skillTag = req.query.skillTag;
        const agents = service.discover(query);
        sendSuccess(res, {
            agents,
            count: agents.length,
            query,
        });
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in GET /api/a2a/agents');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error during agent discovery',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:agentId/health -- Get agent health
// (Must be before GET /:agentId to avoid route collision)
// ---------------------------------------------------------------------------
exports.agentRegistryRouter.get('/:agentId/health', (req, res) => {
    try {
        const { agentId } = req.params;
        if (!agentId || agentId === 'undefined') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'agentId parameter is required',
            }));
            return;
        }
        const service = (0, agent_registry_service_1.getAgentRegistryService)();
        const agent = service.get(agentId);
        if (!agent) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Agent not found: ${agentId}`,
            }));
            return;
        }
        const health = service.getHealth(agentId);
        sendSuccess(res, {
            agentId,
            ...health,
        });
    }
    catch (err) {
        logger.error({ err, agentId: req.params.agentId }, 'unhandled error in GET /api/a2a/agents/:agentId/health');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching agent health',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:agentId/heartbeat -- Record heartbeat
// ---------------------------------------------------------------------------
exports.agentRegistryRouter.post('/:agentId/heartbeat', (req, res) => {
    try {
        const { agentId } = req.params;
        if (!agentId || agentId === 'undefined') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'agentId parameter is required',
            }));
            return;
        }
        const service = (0, agent_registry_service_1.getAgentRegistryService)();
        const recorded = service.recordHeartbeat(agentId);
        if (!recorded) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Agent not found: ${agentId}`,
            }));
            return;
        }
        const health = service.getHealth(agentId);
        sendSuccess(res, {
            agentId,
            ...health,
        });
    }
    catch (err) {
        logger.error({ err, agentId: req.params.agentId }, 'unhandled error in POST /api/a2a/agents/:agentId/heartbeat');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while recording heartbeat',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:agentId -- Get a specific agent
// ---------------------------------------------------------------------------
exports.agentRegistryRouter.get('/:agentId', (req, res) => {
    try {
        const { agentId } = req.params;
        if (!agentId || agentId === 'undefined') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'agentId parameter is required',
            }));
            return;
        }
        const service = (0, agent_registry_service_1.getAgentRegistryService)();
        const agent = service.getWithHealth(agentId);
        if (!agent) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Agent not found: ${agentId}`,
            }));
            return;
        }
        sendSuccess(res, agent);
    }
    catch (err) {
        logger.error({ err, agentId: req.params.agentId }, 'unhandled error in GET /api/a2a/agents/:agentId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching agent',
        }));
    }
});
// ---------------------------------------------------------------------------
// DELETE /:agentId -- Unregister an agent
// ---------------------------------------------------------------------------
exports.agentRegistryRouter.delete('/:agentId', (req, res) => {
    try {
        const { agentId } = req.params;
        if (!agentId || agentId === 'undefined') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'agentId parameter is required',
            }));
            return;
        }
        const service = (0, agent_registry_service_1.getAgentRegistryService)();
        const deleted = service.unregister(agentId);
        if (!deleted) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Agent not found: ${agentId}`,
            }));
            return;
        }
        // Publish agent.deregistered event to the SSE event bus
        (0, a2a_event_bridge_1.publishAgentDeregistered)(agentId);
        sendSuccess(res, { agentId, deleted: true });
    }
    catch (err) {
        logger.error({ err, agentId: req.params.agentId }, 'unhandled error in DELETE /api/a2a/agents/:agentId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while unregistering agent',
        }));
    }
});
