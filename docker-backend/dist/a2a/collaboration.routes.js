"use strict";
/**
 * @module collaboration.routes
 *
 * Express route handlers for the Agent Messaging Bus (AMB) collaboration API.
 *
 * Provides the following endpoints under the `/api/a2a/channels` prefix:
 *
 * | Method | Path                                                | Description                     |
 * |--------|-----------------------------------------------------|---------------------------------|
 * | POST   | /                                                   | Create a channel                |
 * | GET    | /                                                   | List channels (opt. scope)      |
 * | GET    | /:channelId                                         | Get channel details             |
 * | POST   | /:channelId/threads                                 | Create a thread in channel      |
 * | GET    | /:channelId/threads                                 | List threads in channel         |
 * | POST   | /:channelId/threads/:threadId/messages               | Send a message                  |
 * | GET    | /:channelId/threads/:threadId/messages               | List messages (limit/offset)    |
 *
 * All error responses use the canonical A2A error taxonomy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.collaborationRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const collaboration_service_1 = require("./collaboration.service");
const collaboration_middleware_1 = require("./collaboration.middleware");
const task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
const a2a_event_bridge_1 = require("./a2a-event-bridge");
const search_proxy_1 = require("./search-proxy");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-collaboration-routes');
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
exports.collaborationRouter = (0, express_1.Router)();
// Parse JSON text bodies (same pattern as task-lifecycle routes -- the
// parent `/api/a2a` mount uses express.text() for raw verification).
exports.collaborationRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST / -- Create a channel
// ---------------------------------------------------------------------------
exports.collaborationRouter.post('/', collaboration_middleware_1.validateCreateChannelBody, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const channel = svc.createChannel({
            name: req.body.name,
            scope: req.body.scope,
            memberAgentIds: req.body.memberAgentIds,
        });
        sendSuccess(res, channel, 201);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in POST /api/a2a/channels');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while creating channel',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET / -- List channels (optional scope filter)
// ---------------------------------------------------------------------------
exports.collaborationRouter.get('/', (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const scopeFilter = typeof req.query.scope === 'string'
            ? req.query.scope
            : undefined;
        // Validate scope filter if provided
        if (scopeFilter && scopeFilter !== 'channel' && scopeFilter !== 'dm') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: `Invalid scope filter: '${scopeFilter}'. Must be 'channel' or 'dm'.`,
            }));
            return;
        }
        const channels = svc.listChannels(scopeFilter);
        sendSuccess(res, { channels, count: channels.length });
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in GET /api/a2a/channels');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while listing channels',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:channelId -- Get channel details
// ---------------------------------------------------------------------------
exports.collaborationRouter.get('/:channelId', collaboration_middleware_1.validateChannelIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const channel = svc.getChannel(req.params.channelId);
        if (!channel) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: `Channel not found: ${req.params.channelId}`,
            }));
            return;
        }
        sendSuccess(res, channel);
    }
    catch (err) {
        logger.error({ err, channelId: req.params.channelId }, 'unhandled error in GET /api/a2a/channels/:channelId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching channel',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:channelId/members -- Add a member to a channel
// ---------------------------------------------------------------------------
exports.collaborationRouter.post('/:channelId/members', collaboration_middleware_1.validateChannelIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const { agentId } = req.body ?? {};
        if (!agentId || typeof agentId !== 'string' || agentId.trim().length === 0) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'agentId must be a non-empty string',
            }));
            return;
        }
        const channel = svc.addMember(req.params.channelId, agentId);
        (0, a2a_event_bridge_1.publishMemberJoined)(req.params.channelId, { agentId });
        sendSuccess(res, channel, 201);
    }
    catch (err) {
        if (err?.message?.includes('Channel not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: err.message,
            }));
            return;
        }
        if (err?.message?.includes('already a member')) {
            sendError(res, 409, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: err.message,
            }));
            return;
        }
        logger.error({ err, channelId: req.params.channelId }, 'unhandled error in POST /api/a2a/channels/:channelId/members');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while adding member',
        }));
    }
});
// ---------------------------------------------------------------------------
// DELETE /:channelId/members/:agentId -- Remove a member from a channel
// ---------------------------------------------------------------------------
exports.collaborationRouter.delete('/:channelId/members/:agentId', collaboration_middleware_1.validateChannelIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const channel = svc.removeMember(req.params.channelId, req.params.agentId);
        (0, a2a_event_bridge_1.publishMemberLeft)(req.params.channelId, { agentId: req.params.agentId });
        sendSuccess(res, channel);
    }
    catch (err) {
        if (err?.message?.includes('Channel not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: err.message,
            }));
            return;
        }
        if (err?.message?.includes('is not a member')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.NotChannelMember,
                message: err.message,
            }));
            return;
        }
        logger.error({ err, channelId: req.params.channelId }, 'unhandled error in DELETE /api/a2a/channels/:channelId/members/:agentId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while removing member',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:channelId/members -- List members of a channel
// ---------------------------------------------------------------------------
exports.collaborationRouter.get('/:channelId/members', collaboration_middleware_1.validateChannelIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const members = svc.getMembers(req.params.channelId);
        sendSuccess(res, { members, count: members.length });
    }
    catch (err) {
        if (err?.message?.includes('Channel not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: err.message,
            }));
            return;
        }
        logger.error({ err, channelId: req.params.channelId }, 'unhandled error in GET /api/a2a/channels/:channelId/members');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while listing members',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:channelId/threads -- Create a thread
// ---------------------------------------------------------------------------
exports.collaborationRouter.post('/:channelId/threads', collaboration_middleware_1.validateChannelIdParam, collaboration_middleware_1.validateCreateThreadBody, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        // Verify channel exists
        const channel = svc.getChannel(req.params.channelId);
        if (!channel) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: `Channel not found: ${req.params.channelId}`,
            }));
            return;
        }
        const thread = svc.createThread(req.params.channelId, req.body.title);
        // Publish thread.created event to the SSE event bus
        (0, a2a_event_bridge_1.publishThreadCreated)(req.params.channelId, {
            id: thread.id,
            channelId: req.params.channelId,
            title: thread.title,
            createdAt: thread.createdAt,
        });
        // Index in Meilisearch for cross-platform search — fire-and-forget
        void (0, search_proxy_1.indexThread)({
            id: thread.id,
            title: thread.title,
            projectId: req.params.channelId,
            createdAt: thread.createdAt,
        });
        sendSuccess(res, thread, 201);
    }
    catch (err) {
        if (err?.message?.includes('Channel not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: err.message,
            }));
            return;
        }
        logger.error({ err, channelId: req.params.channelId }, 'unhandled error in POST /api/a2a/channels/:channelId/threads');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while creating thread',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:channelId/threads -- List threads in channel
// ---------------------------------------------------------------------------
exports.collaborationRouter.get('/:channelId/threads', collaboration_middleware_1.validateChannelIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        // Verify channel exists
        const channel = svc.getChannel(req.params.channelId);
        if (!channel) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: `Channel not found: ${req.params.channelId}`,
            }));
            return;
        }
        const threads = svc.listThreads(req.params.channelId);
        sendSuccess(res, { threads, count: threads.length });
    }
    catch (err) {
        logger.error({ err, channelId: req.params.channelId }, 'unhandled error in GET /api/a2a/channels/:channelId/threads');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while listing threads',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:channelId/threads/:threadId/messages -- Send a message
// ---------------------------------------------------------------------------
exports.collaborationRouter.post('/:channelId/threads/:threadId/messages', collaboration_middleware_1.validateChannelIdParam, collaboration_middleware_1.validateThreadIdParam, collaboration_middleware_1.validateSendMessageBody, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        // Verify channel exists
        const channel = svc.getChannel(req.params.channelId);
        if (!channel) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: `Channel not found: ${req.params.channelId}`,
            }));
            return;
        }
        const message = svc.sendMessage({
            threadId: req.params.threadId,
            senderAgentId: req.body.senderAgentId,
            text: req.body.text,
        });
        // Publish message.new event to the SSE event bus
        (0, a2a_event_bridge_1.publishChannelMessage)(req.params.channelId, {
            id: message.id,
            threadId: req.params.threadId,
            senderAgentId: message.senderAgentId,
            text: message.text,
            createdAt: message.createdAt,
            mentions: message.mentions,
        });
        sendSuccess(res, message, 201);
    }
    catch (err) {
        // Map service-level errors to appropriate HTTP codes
        if (err?.message?.includes('Thread not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ThreadNotFound,
                message: err.message,
            }));
            return;
        }
        if (err?.message?.includes('Channel not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: err.message,
            }));
            return;
        }
        if (err?.message?.includes('is not a member of channel')) {
            sendError(res, 403, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.NotChannelMember,
                message: err.message,
            }));
            return;
        }
        logger.error({ err, channelId: req.params.channelId, threadId: req.params.threadId }, 'unhandled error in POST /api/a2a/channels/:channelId/threads/:threadId/messages');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while sending message',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:channelId/threads/:threadId/messages -- List messages
// ---------------------------------------------------------------------------
exports.collaborationRouter.get('/:channelId/threads/:threadId/messages', collaboration_middleware_1.validateChannelIdParam, collaboration_middleware_1.validateThreadIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        // Verify channel exists
        const channel = svc.getChannel(req.params.channelId);
        if (!channel) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ChannelNotFound,
                message: `Channel not found: ${req.params.channelId}`,
            }));
            return;
        }
        // Parse pagination query params
        let limit;
        let offset;
        if (typeof req.query.limit === 'string') {
            const parsed = parseInt(req.query.limit, 10);
            if (!isNaN(parsed) && parsed > 0) {
                limit = Math.min(parsed, 1000);
            }
        }
        if (typeof req.query.offset === 'string') {
            const parsed = parseInt(req.query.offset, 10);
            if (!isNaN(parsed) && parsed >= 0) {
                offset = parsed;
            }
        }
        const messages = svc.listMessages(req.params.threadId, { limit, offset });
        sendSuccess(res, {
            messages,
            count: messages.length,
            threadId: req.params.threadId,
            channelId: req.params.channelId,
        });
    }
    catch (err) {
        logger.error({ err, channelId: req.params.channelId, threadId: req.params.threadId }, 'unhandled error in GET /api/a2a/channels/:channelId/threads/:threadId/messages');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while listing messages',
        }));
    }
});
// ---------------------------------------------------------------------------
// PATCH /:channelId/threads/:threadId/messages/:messageId -- Update message
// ---------------------------------------------------------------------------
exports.collaborationRouter.patch('/:channelId/threads/:threadId/messages/:messageId', collaboration_middleware_1.validateChannelIdParam, collaboration_middleware_1.validateThreadIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const { messageId } = req.params;
        const { text } = req.body ?? {};
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'text must be a non-empty string',
            }));
            return;
        }
        const updated = svc.updateMessage({ messageId, text });
        (0, a2a_event_bridge_1.publishMessageUpdated)(req.params.channelId, {
            id: updated.id,
            threadId: updated.threadId,
            text: updated.text,
            editedAt: updated.editedAt,
            mentions: updated.mentions,
        });
        sendSuccess(res, updated);
    }
    catch (err) {
        if (err?.message?.includes('not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MessageNotFound,
                message: err.message,
            }));
            return;
        }
        if (err?.message?.includes('deleted')) {
            sendError(res, 410, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MessageNotFound,
                message: err.message,
            }));
            return;
        }
        logger.error({ err, messageId: req.params.messageId }, 'unhandled error in PATCH message');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while updating message',
        }));
    }
});
// ---------------------------------------------------------------------------
// DELETE /:channelId/threads/:threadId/messages/:messageId -- Soft-delete
// ---------------------------------------------------------------------------
exports.collaborationRouter.delete('/:channelId/threads/:threadId/messages/:messageId', collaboration_middleware_1.validateChannelIdParam, collaboration_middleware_1.validateThreadIdParam, (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const result = svc.deleteMessage(req.params.messageId);
        (0, a2a_event_bridge_1.publishMessageDeleted)(req.params.channelId, req.params.messageId);
        sendSuccess(res, result);
    }
    catch (err) {
        if (err?.message?.includes('not found')) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MessageNotFound,
                message: err.message,
            }));
            return;
        }
        if (err?.message?.includes('already deleted')) {
            sendError(res, 410, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MessageNotFound,
                message: err.message,
            }));
            return;
        }
        logger.error({ err, messageId: req.params.messageId }, 'unhandled error in DELETE message');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while deleting message',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /search -- Search messages across channels
// ---------------------------------------------------------------------------
exports.collaborationRouter.get('/search', (req, res) => {
    try {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const query = typeof req.query.q === 'string' ? req.query.q : '';
        if (!query || query.trim().length === 0) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'Query parameter "q" is required and must be non-empty',
            }));
            return;
        }
        let limit;
        if (typeof req.query.limit === 'string') {
            const parsed = parseInt(req.query.limit, 10);
            if (!isNaN(parsed) && parsed > 0) {
                limit = Math.min(parsed, 100);
            }
        }
        const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : undefined;
        const threadId = typeof req.query.threadId === 'string' ? req.query.threadId : undefined;
        const results = svc.searchMessages(query, { limit, channelId, threadId });
        sendSuccess(res, results);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in GET /api/a2a/channels/search');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while searching messages',
        }));
    }
});
