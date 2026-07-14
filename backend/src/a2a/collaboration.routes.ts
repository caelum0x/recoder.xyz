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

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
  type CollaborationScope,
} from '@recoder/shared/a2a';
import { getCollaborationSvc } from './collaboration.service';
import {
  validateCreateChannelBody,
  validateCreateThreadBody,
  validateSendMessageBody,
  validateChannelIdParam,
  validateThreadIdParam,
} from './collaboration.middleware';
import { parseJsonTextBody } from './task-lifecycle.middleware';
import {
  publishChannelMessage,
  publishThreadCreated,
  publishMessageUpdated,
  publishMessageDeleted,
  publishMemberJoined,
  publishMemberLeft,
} from './a2a-event-bridge';
import { indexThread as meiliIndexThread } from './search-proxy';
import { createLogger } from '../logger';

const logger = createLogger('a2a-collaboration-routes');

// ---------------------------------------------------------------------------
// Response helpers (matching task-lifecycle.routes.ts pattern)
// ---------------------------------------------------------------------------

interface AMBSuccessResponse<T> {
  success: true;
  data: T;
}

interface AMBErrorResponse {
  success: false;
  error: A2AError;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: AMBSuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, error: A2AError): void {
  const response: AMBErrorResponse = { success: false, error };
  res.status(httpStatus).json(response);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const collaborationRouter = Router();

// Parse JSON text bodies (same pattern as task-lifecycle routes -- the
// parent `/api/a2a` mount uses express.text() for raw verification).
collaborationRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST / -- Create a channel
// ---------------------------------------------------------------------------

collaborationRouter.post(
  '/',
  validateCreateChannelBody,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const channel = svc.createChannel({
        name: req.body.name,
        scope: req.body.scope as CollaborationScope,
        memberAgentIds: req.body.memberAgentIds,
      });
      sendSuccess(res, channel, 201);
    } catch (err) {
      logger.error({ err }, 'unhandled error in POST /api/a2a/channels');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while creating channel',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET / -- List channels (optional scope filter)
// ---------------------------------------------------------------------------

collaborationRouter.get(
  '/',
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const scopeFilter = typeof req.query.scope === 'string'
        ? (req.query.scope as CollaborationScope)
        : undefined;

      // Validate scope filter if provided
      if (scopeFilter && scopeFilter !== 'channel' && scopeFilter !== 'dm') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: `Invalid scope filter: '${scopeFilter}'. Must be 'channel' or 'dm'.`,
        }));
        return;
      }

      const channels = svc.listChannels(scopeFilter);
      sendSuccess(res, { channels, count: channels.length });
    } catch (err) {
      logger.error({ err }, 'unhandled error in GET /api/a2a/channels');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing channels',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:channelId -- Get channel details
// ---------------------------------------------------------------------------

collaborationRouter.get(
  '/:channelId',
  validateChannelIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const channel = svc.getChannel(req.params.channelId);

      if (!channel) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: `Channel not found: ${req.params.channelId}`,
        }));
        return;
      }

      sendSuccess(res, channel);
    } catch (err) {
      logger.error({ err, channelId: req.params.channelId }, 'unhandled error in GET /api/a2a/channels/:channelId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching channel',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:channelId/members -- Add a member to a channel
// ---------------------------------------------------------------------------

collaborationRouter.post(
  '/:channelId/members',
  validateChannelIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const { agentId } = req.body ?? {};

      if (!agentId || typeof agentId !== 'string' || agentId.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'agentId must be a non-empty string',
        }));
        return;
      }

      const channel = svc.addMember(req.params.channelId, agentId);

      publishMemberJoined(req.params.channelId, { agentId });

      sendSuccess(res, channel, 201);
    } catch (err: any) {
      if (err?.message?.includes('Channel not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: err.message,
        }));
        return;
      }
      if (err?.message?.includes('already a member')) {
        sendError(res, 409, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: err.message,
        }));
        return;
      }
      logger.error({ err, channelId: req.params.channelId }, 'unhandled error in POST /api/a2a/channels/:channelId/members');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while adding member',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:channelId/members/:agentId -- Remove a member from a channel
// ---------------------------------------------------------------------------

collaborationRouter.delete(
  '/:channelId/members/:agentId',
  validateChannelIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const channel = svc.removeMember(req.params.channelId, req.params.agentId);

      publishMemberLeft(req.params.channelId, { agentId: req.params.agentId });

      sendSuccess(res, channel);
    } catch (err: any) {
      if (err?.message?.includes('Channel not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: err.message,
        }));
        return;
      }
      if (err?.message?.includes('is not a member')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.NotChannelMember,
          message: err.message,
        }));
        return;
      }
      logger.error({ err, channelId: req.params.channelId }, 'unhandled error in DELETE /api/a2a/channels/:channelId/members/:agentId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while removing member',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:channelId/members -- List members of a channel
// ---------------------------------------------------------------------------

collaborationRouter.get(
  '/:channelId/members',
  validateChannelIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const members = svc.getMembers(req.params.channelId);
      sendSuccess(res, { members, count: members.length });
    } catch (err: any) {
      if (err?.message?.includes('Channel not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: err.message,
        }));
        return;
      }
      logger.error({ err, channelId: req.params.channelId }, 'unhandled error in GET /api/a2a/channels/:channelId/members');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing members',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:channelId/threads -- Create a thread
// ---------------------------------------------------------------------------

collaborationRouter.post(
  '/:channelId/threads',
  validateChannelIdParam,
  validateCreateThreadBody,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();

      // Verify channel exists
      const channel = svc.getChannel(req.params.channelId);
      if (!channel) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: `Channel not found: ${req.params.channelId}`,
        }));
        return;
      }

      const thread = svc.createThread(req.params.channelId, req.body.title);

      // Publish thread.created event to the SSE event bus
      publishThreadCreated(req.params.channelId, {
        id: thread.id,
        channelId: req.params.channelId,
        title: thread.title,
        createdAt: thread.createdAt,
      });

      // Index in Meilisearch for cross-platform search — fire-and-forget
      void meiliIndexThread({
        id: thread.id,
        title: thread.title,
        projectId: req.params.channelId,
        createdAt: thread.createdAt,
      });

      sendSuccess(res, thread, 201);
    } catch (err: any) {
      if (err?.message?.includes('Channel not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: err.message,
        }));
        return;
      }
      logger.error({ err, channelId: req.params.channelId }, 'unhandled error in POST /api/a2a/channels/:channelId/threads');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while creating thread',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:channelId/threads -- List threads in channel
// ---------------------------------------------------------------------------

collaborationRouter.get(
  '/:channelId/threads',
  validateChannelIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();

      // Verify channel exists
      const channel = svc.getChannel(req.params.channelId);
      if (!channel) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: `Channel not found: ${req.params.channelId}`,
        }));
        return;
      }

      const threads = svc.listThreads(req.params.channelId);
      sendSuccess(res, { threads, count: threads.length });
    } catch (err) {
      logger.error({ err, channelId: req.params.channelId }, 'unhandled error in GET /api/a2a/channels/:channelId/threads');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing threads',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:channelId/threads/:threadId/messages -- Send a message
// ---------------------------------------------------------------------------

collaborationRouter.post(
  '/:channelId/threads/:threadId/messages',
  validateChannelIdParam,
  validateThreadIdParam,
  validateSendMessageBody,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();

      // Verify channel exists
      const channel = svc.getChannel(req.params.channelId);
      if (!channel) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
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
      publishChannelMessage(req.params.channelId, {
        id: (message as any).id,
        threadId: req.params.threadId,
        senderAgentId: (message as any).senderAgentId,
        text: (message as any).text,
        createdAt: (message as any).createdAt,
        mentions: message.mentions,
      });

      sendSuccess(res, message, 201);
    } catch (err: any) {
      // Map service-level errors to appropriate HTTP codes
      if (err?.message?.includes('Thread not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ThreadNotFound,
          message: err.message,
        }));
        return;
      }
      if (err?.message?.includes('Channel not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: err.message,
        }));
        return;
      }
      if (err?.message?.includes('is not a member of channel')) {
        sendError(res, 403, buildA2AError({
          code: A2AErrorCodeEnum.NotChannelMember,
          message: err.message,
        }));
        return;
      }

      logger.error(
        { err, channelId: req.params.channelId, threadId: req.params.threadId },
        'unhandled error in POST /api/a2a/channels/:channelId/threads/:threadId/messages',
      );
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while sending message',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:channelId/threads/:threadId/messages -- List messages
// ---------------------------------------------------------------------------

collaborationRouter.get(
  '/:channelId/threads/:threadId/messages',
  validateChannelIdParam,
  validateThreadIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();

      // Verify channel exists
      const channel = svc.getChannel(req.params.channelId);
      if (!channel) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ChannelNotFound,
          message: `Channel not found: ${req.params.channelId}`,
        }));
        return;
      }

      // Parse pagination query params
      let limit: number | undefined;
      let offset: number | undefined;

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
    } catch (err) {
      logger.error(
        { err, channelId: req.params.channelId, threadId: req.params.threadId },
        'unhandled error in GET /api/a2a/channels/:channelId/threads/:threadId/messages',
      );
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing messages',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /:channelId/threads/:threadId/messages/:messageId -- Update message
// ---------------------------------------------------------------------------

collaborationRouter.patch(
  '/:channelId/threads/:threadId/messages/:messageId',
  validateChannelIdParam,
  validateThreadIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const { messageId } = req.params;
      const { text } = req.body ?? {};

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'text must be a non-empty string',
        }));
        return;
      }

      const updated = svc.updateMessage({ messageId, text });
      publishMessageUpdated(req.params.channelId, {
        id: updated.id,
        threadId: updated.threadId,
        text: updated.text,
        editedAt: updated.editedAt,
        mentions: updated.mentions,
      });
      sendSuccess(res, updated);
    } catch (err: any) {
      if (err?.message?.includes('not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.MessageNotFound,
          message: err.message,
        }));
        return;
      }
      if (err?.message?.includes('deleted')) {
        sendError(res, 410, buildA2AError({
          code: A2AErrorCodeEnum.MessageNotFound,
          message: err.message,
        }));
        return;
      }
      logger.error({ err, messageId: req.params.messageId }, 'unhandled error in PATCH message');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while updating message',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:channelId/threads/:threadId/messages/:messageId -- Soft-delete
// ---------------------------------------------------------------------------

collaborationRouter.delete(
  '/:channelId/threads/:threadId/messages/:messageId',
  validateChannelIdParam,
  validateThreadIdParam,
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const result = svc.deleteMessage(req.params.messageId);
      publishMessageDeleted(req.params.channelId, req.params.messageId);
      sendSuccess(res, result);
    } catch (err: any) {
      if (err?.message?.includes('not found')) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.MessageNotFound,
          message: err.message,
        }));
        return;
      }
      if (err?.message?.includes('already deleted')) {
        sendError(res, 410, buildA2AError({
          code: A2AErrorCodeEnum.MessageNotFound,
          message: err.message,
        }));
        return;
      }
      logger.error({ err, messageId: req.params.messageId }, 'unhandled error in DELETE message');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while deleting message',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /search -- Search messages across channels
// ---------------------------------------------------------------------------

collaborationRouter.get(
  '/search',
  (req: Request, res: Response) => {
    try {
      const svc = getCollaborationSvc();
      const query = typeof req.query.q === 'string' ? req.query.q : '';

      if (!query || query.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'Query parameter "q" is required and must be non-empty',
        }));
        return;
      }

      let limit: number | undefined;
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
    } catch (err) {
      logger.error({ err }, 'unhandled error in GET /api/a2a/channels/search');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while searching messages',
      }));
    }
  },
);
