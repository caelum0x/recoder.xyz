/**
 * Platform Integration API Routes
 * Handles cross-platform communication and session management
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { APIResponse } from '../types';
import { WebSocketServer } from 'ws';
import * as crypto from 'crypto';

const router = Router();

// Require authentication for all platform routes
router.use(authenticate);

// Store active sessions
const activeSessions = new Map<string, any>();
const platformConnections = new Map<string, any>();

/**
 * POST /api/platform/sessions
 * Register a new platform session
 */
router.post('/sessions', [
  body('platform').isIn(['cli', 'web', 'chat', 'mobile', 'desktop']).withMessage('Invalid platform'),
  body('capabilities').isArray().withMessage('Capabilities must be an array'),
  body('deviceInfo').optional().isObject().withMessage('Device info must be an object'),
  body('version').optional().isString().withMessage('Version must be a string')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const { platform, capabilities, deviceInfo, version, environment } = req.body;
    const userId = req.user!.id;

    // Generate session ID
    const sessionId = `session_${platform}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Create session record
    const session = {
      id: sessionId,
      platform,
      userId,
      capabilities,
      deviceInfo: deviceInfo || {},
      version: version || 'unknown',
      environment: environment || 'unknown',
      isActive: true,
      lastActivity: new Date(),
      createdAt: new Date()
    };

    // Store session in audit log for tracking
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'platform_session_created',
        resource: 'platform_session',
        resourceId: sessionId,
        metadata: {
          platform,
          capabilities,
          deviceInfo: deviceInfo || {},
          version: version || 'unknown',
          environment: environment || 'unknown',
          sessionId
        }
      }
    });

    // Store in memory for quick access
    activeSessions.set(sessionId, session);

    // Log session creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'platform_session_created',
        resource: 'platform_session',
        resourceId: sessionId,
        metadata: {
          platform,
          capabilities: capabilities.length,
          version,
          environment
        }
      }
    });

    logger.info('Platform session created', {
      sessionId,
      platform,
      userId,
      capabilities
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        platform,
        capabilities,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        websocketUrl: process.env.WEBSOCKET_URL || 'wss://api.recoder.xyz/ws'
      },
      message: 'Platform session created successfully'
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to create platform session', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to create platform session'
    } as APIResponse);
  }
});

/**
 * GET /api/platform/sessions
 * Get active sessions for the user
 */
router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get user's active sessions from audit logs
    const sessions = await prisma.auditLog.findMany({
      where: {
        userId,
        action: 'platform_session_created',
        resource: 'platform_session',
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    // Enrich with real-time connection status
    const enrichedSessions = sessions.map(session => ({
      id: session.resourceId,
      platform: (session.metadata as any)?.platform,
      capabilities: (session.metadata as any)?.capabilities || [],
      connected: platformConnections.has(session.resourceId || ''),
      lastSeen: session.timestamp,
      createdAt: session.timestamp
    }));

    res.json({
      success: true,
      data: {
        sessions: enrichedSessions,
        total: sessions.length,
        platforms: [...new Set(enrichedSessions.map(s => s.platform).filter(Boolean))]
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to get platform sessions', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get platform sessions'
    } as APIResponse);
  }
});

/**
 * DELETE /api/platform/sessions/:sessionId
 * Deactivate a platform session
 */
router.delete('/sessions/:sessionId', [
  param('sessionId').isString().notEmpty().withMessage('Session ID is required')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    // Mark session as deactivated in audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'platform_session_deactivated',
        resource: 'platform_session',
        resourceId: sessionId,
        metadata: {
          deactivatedAt: new Date()
        }
      }
    });

    const updatedSession = { count: 1 }; // Simulate successful update

    if (updatedSession.count === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as APIResponse);
      return;
    }

    // Remove from active sessions
    activeSessions.delete(sessionId);
    platformConnections.delete(sessionId);

    logger.info('Platform session deactivated', { sessionId, userId });

    res.json({
      success: true,
      message: 'Session deactivated successfully'
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to deactivate session', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: req.params.sessionId,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to deactivate session'
    } as APIResponse);
  }
});

/**
 * GET /api/platform/usage-stats
 * Get cross-platform usage statistics
 */
router.get('/usage-stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get usage stats by platform
    const platformUsage = await prisma.usageRecord.groupBy({
      by: ['type'],
      where: {
        userId,
        timestamp: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      _count: true,
      _sum: {
        tokens: true,
        cost: true
      }
    });

    // Process platform usage data
    const platformStats = platformUsage.reduce((acc, record) => {
      const platform = record.type || 'unknown';
      
      if (!acc[platform]) {
        acc[platform] = {
          requests: 0,
          tokens: 0,
          cost: 0
        };
      }

      acc[platform].requests += record._count;
      acc[platform].tokens += record._sum.tokens || 0;
      acc[platform].cost += record._sum.cost || 0;

      return acc;
    }, {} as Record<string, any>);

    // Get session statistics from audit logs
    const sessionLogs = await prisma.auditLog.findMany({
      where: {
        userId,
        action: 'platform_session_created',
        resource: 'platform_session',
        timestamp: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        metadata: true
      }
    });

    const sessions = sessionLogs.reduce((acc, log) => {
      const platform = (log.metadata as any)?.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        platformUsage: platformStats,
        sessionCount: sessions,
        totalPlatforms: Object.keys(platformStats).length,
        period: 'last_30_days'
      }
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to get usage stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get usage stats'
    } as APIResponse);
  }
});

/**
 * POST /api/platform/share-project
 * Share project across platforms
 */
router.post('/share-project', [
  body('projectId').isString().notEmpty().withMessage('Project ID is required'),
  body('platforms').isArray().withMessage('Platforms must be an array'),
  body('source').isString().notEmpty().withMessage('Source platform is required')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const { projectId, platforms, source } = req.body;
    const userId = req.user!.id;

    // Verify project ownership using regular project model
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId
      }
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found'
      } as APIResponse);
      return;
    }

    // Create audit log for sharing
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'project_shared',
        resource: 'ai_generated_project',
        resourceId: projectId,
        metadata: {
          platforms,
          source
        }
      }
    });

    // Notify other platforms via WebSocket
    broadcastToUserSessions(userId, {
      type: 'project_shared',
      data: {
        projectId,
        project: {
          id: project.id,
          name: project.name,
          framework: project.framework
        },
        platforms,
        source
      }
    });

    logger.info('Project shared across platforms', {
      projectId,
      platforms,
      source,
      userId
    });

    res.json({
      success: true,
      data: {
        projectId,
        sharedWith: platforms,
        shareUrl: `${process.env.FRONTEND_URL}/projects/${projectId}`
      },
      message: 'Project shared successfully'
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to share project', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to share project'
    } as APIResponse);
  }
});

/**
 * POST /api/platform/remote-assistance
 * Request remote assistance from web platform
 */
router.post('/remote-assistance', [
  body('sessionData').isObject().withMessage('Session data is required'),
  body('source').isString().notEmpty().withMessage('Source platform is required')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionData, source } = req.body;
    const userId = req.user!.id;

    // Generate assistance session
    const assistanceId = `assist_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const assistanceUrl = `${process.env.FRONTEND_URL}/remote-assistance/${assistanceId}`;

    // Store assistance request in audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'remote_assistance_requested',
        resource: 'assistance_session',
        resourceId: assistanceId,
        metadata: {
          source,
          sessionData,
          url: assistanceUrl,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      }
    });

    // Notify web platform
    broadcastToUserSessions(userId, {
      type: 'remote_assistance_requested',
      data: {
        assistanceId,
        source,
        url: assistanceUrl,
        sessionData
      }
    });

    logger.info('Remote assistance requested', {
      assistanceId,
      source,
      userId
    });

    res.json({
      success: true,
      data: {
        assistanceId,
        url: assistanceUrl,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      },
      message: 'Remote assistance session created'
    } as APIResponse);

  } catch (error) {
    logger.error('Failed to create remote assistance', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to create remote assistance'
    } as APIResponse);
  }
});

/**
 * Broadcast message to all user sessions
 */
function broadcastToUserSessions(userId: string, message: any): void {
  for (const [sessionId, connection] of platformConnections) {
    const session = activeSessions.get(sessionId);
    if (session?.userId === userId && connection.readyState === 1) {
      try {
        connection.send(JSON.stringify({
          id: crypto.randomUUID(),
          type: 'event',
          source: 'platform',
          payload: message,
          timestamp: new Date()
        }));
      } catch (error) {
        logger.error('Failed to broadcast message', { error, sessionId });
      }
    }
  }
}

/**
 * WebSocket handler setup (to be called from main server)
 */
export function setupWebSocketHandler(wss: WebSocketServer): void {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const sessionId = url.searchParams.get('sessionId');

    if (!token || !sessionId) {
      ws.close(1008, 'Missing token or sessionId');
      return;
    }

    // Verify token and session
    // TODO: Add proper JWT verification here
    
    platformConnections.set(sessionId, ws);
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebSocketMessage(sessionId, message);
      } catch (error) {
        logger.error('Invalid WebSocket message', { error, sessionId });
      }
    });

    ws.on('close', () => {
      platformConnections.delete(sessionId);
      logger.debug('WebSocket connection closed', { sessionId });
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { error, sessionId });
      platformConnections.delete(sessionId);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      sessionId,
      timestamp: new Date()
    }));
  });
}

/**
 * Handle WebSocket messages
 */
function handleWebSocketMessage(sessionId: string, message: any): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  // Update last activity
  session.lastActivity = new Date();

  // Handle different message types
  switch (message.type) {
    case 'ping':
      const connection = platformConnections.get(sessionId);
      if (connection) {
        connection.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
      }
      break;
    
    case 'sync':
      // Handle sync messages between platforms
      broadcastToUserSessions(session.userId, {
        type: 'sync',
        source: session.platform,
        data: message.payload
      });
      break;
    
    default:
      logger.debug('Unhandled WebSocket message', { type: message.type, sessionId });
  }
}

export default router;
// CommonJS compatibility
module.exports = router;
