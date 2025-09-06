/**
 * Collaboration API Routes
 * KILLER FEATURE: Real-time collaborative development endpoints
 * Backend integration for WebSocket collaboration service
 */

import express from 'express';
import { Logger } from '../utils/logger';
import { CollaborationService } from 'recoder-shared/collaboration';

const router = express.Router();

// Global collaboration service instance
let collaborationService: CollaborationService | null = null;

// In-memory session tracking (for demo purposes)
const sessionRegistry = new Map<string, any>();

// Initialize collaboration service
function initializeCollaborationService(): CollaborationService {
  if (!collaborationService) {
    collaborationService = new CollaborationService({
      websocketPort: parseInt(process.env.COLLAB_WEBSOCKET_PORT || '8080'),
      enableRedis: process.env.NODE_ENV === 'production',
      redisUrl: process.env.REDIS_URL
    });
    Logger.info('Backend collaboration service initialized');
  }
  return collaborationService;
}

// Get collaboration service instance
function getCollaborationService(): CollaborationService {
  if (!collaborationService) {
    throw new Error('Collaboration service not initialized');
  }
  return collaborationService;
}

// GET /api/collaboration/sessions - List all collaboration sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = Array.from(sessionRegistry.values());
    
    const sessionData = sessions.map(session => ({
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      createdBy: session.createdBy,
      userCount: session.userCount || 0,
      aiAgentsEnabled: session.settings?.allowAIAgents || false,
      language: session.metadata?.language || 'typescript',
      description: session.metadata?.description || '',
      isActive: session.isActive || false
    }));

    res.json({
      success: true,
      sessions: sessionData,
      totalSessions: sessionData.length,
      activeSessions: sessionData.filter(s => s.isActive).length
    });
  } catch (error: any) {
    Logger.error('Failed to list collaboration sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve collaboration sessions'
    });
  }
});

// POST /api/collaboration/sessions - Create a new collaboration session
router.post('/sessions', async (req, res) => {
  try {
    const { name, description, language, maxUsers, allowAIAgents, userId, userName, userEmail } = req.body;

    if (!name || !userId || !userName) {
      return res.status(400).json({
        success: false,
        error: 'Session name, user ID, and user name are required'
      });
    }

    const service = getCollaborationService();
    
    const creator = {
      id: userId,
      name: userName,
      email: userEmail || 'user@recoder.dev',
      role: 'developer' as const,
      isActive: true,
      lastSeen: new Date()
    };

    const session = await service.createSession(creator, {
      name,
      metadata: {
        description: description || '',
        language: language || 'typescript',
        tags: []
      },
      settings: {
        maxUsers: maxUsers || 10,
        allowAIAgents: allowAIAgents !== false,
        codeReviewMode: false,
        voiceChatEnabled: false,
        autoSave: true
      }
    });

    // Store session in registry for API access
    sessionRegistry.set(session.id, {
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      createdBy: session.createdBy,
      userCount: 1,
      isActive: true,
      settings: {
        maxUsers: maxUsers || 10,
        allowAIAgents: allowAIAgents !== false
      },
      metadata: {
        description: description || '',
        language: language || 'typescript'
      }
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        createdBy: session.createdBy,
        websocketUrl: `ws://localhost:${process.env.COLLAB_WEBSOCKET_PORT || 8080}/collaboration`,
        joinUrl: `${req.protocol}://${req.get('host')}/collaborate/${session.id}`
      }
    });

    Logger.info(`Collaboration session created via API: ${session.id} by ${userName}`);
  } catch (error: any) {
    Logger.error('Failed to create collaboration session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create collaboration session'
    });
  }
});

// GET /api/collaboration/sessions/:sessionId - Get session details
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const service = getCollaborationService();
    
    const session = sessionRegistry.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    try {
      const analytics = service.getSessionAnalytics(sessionId);
      session.analytics = analytics;
    } catch (error) {
      // Analytics might not be available, continue without it
      Logger.warn(`Analytics not available for session ${sessionId}`);
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        createdBy: session.createdBy,
        users: [], // Would be populated from WebSocket connections
        aiAgents: [], // Would be populated from AI agent system
        settings: session.settings,
        metadata: session.metadata,
        analytics: session.analytics || null,
        websocketUrl: `ws://localhost:${process.env.COLLAB_WEBSOCKET_PORT || 8080}/collaboration`
      }
    });
  } catch (error: any) {
    Logger.error('Failed to get collaboration session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve collaboration session'
    });
  }
});

// POST /api/collaboration/sessions/:sessionId/join - Join a collaboration session
router.post('/sessions/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, userName, userEmail } = req.body;

    if (!userId || !userName) {
      return res.status(400).json({
        success: false,
        error: 'User ID and name are required'
      });
    }

    const service = getCollaborationService();
    
    const user = {
      id: userId,
      name: userName,
      email: userEmail || 'user@recoder.dev',
      role: 'developer' as const,
      isActive: true,
      lastSeen: new Date()
    };

    const success = await service.joinSession(sessionId, user);
    
    if (success) {
      const session = sessionRegistry.get(sessionId);
      if (session) {
        session.userCount = (session.userCount || 0) + 1;
      }
      
      res.json({
        success: true,
        message: 'Successfully joined session',
        session: session ? {
          id: session.id,
          name: session.name,
          userCount: session.userCount,
          websocketUrl: `ws://localhost:${process.env.COLLAB_WEBSOCKET_PORT || 8080}/collaboration`
        } : null
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to join session - session may be full or not found'
      });
    }
  } catch (error: any) {
    Logger.error('Failed to join collaboration session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join collaboration session'
    });
  }
});

// POST /api/collaboration/sessions/:sessionId/leave - Leave a collaboration session
router.post('/sessions/:sessionId/leave', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const service = getCollaborationService();
    const success = await service.leaveSession(sessionId, userId);
    
    res.json({
      success,
      message: success ? 'Successfully left session' : 'Failed to leave session'
    });
  } catch (error: any) {
    Logger.error('Failed to leave collaboration session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to leave collaboration session'
    });
  }
});

// GET /api/collaboration/analytics - Get collaboration analytics
router.get('/analytics', async (req, res) => {
  try {
    const service = getCollaborationService();
    const stats = await service.getCollaborationStats();
    const activities = service.getAllCodeActivities();

    const analytics = {
      overview: stats,
      realTimeSync: {
        totalDocuments: activities.reduce((sum, a) => sum + a.openFiles.length, 0),
        activeUsers: activities.filter(a => a.activeFile).length,
        openFiles: activities.flatMap(a => a.openFiles),
        typingUsers: activities.filter(a => a.activeFile).map(a => a.userId)
      },
      competitiveAdvantage: {
        feature: 'Real-time collaborative code editing with conflict resolution',
        advantage: 'Cursor has NO real-time collaboration capabilities',
        uniqueFeatures: [
          'Operational Transform conflict resolution',
          'AI-assisted conflict resolution',
          'Real-time cursor positions and selections',
          'Typing indicators',
          'Voice chat integration',
          'Session persistence with Redis'
        ]
      }
    };

    res.json({
      success: true,
      analytics
    });
  } catch (error: any) {
    Logger.error('Failed to get collaboration analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve collaboration analytics'
    });
  }
});

// POST /api/collaboration/documents - Create a new collaborative document
router.post('/documents', async (req, res) => {
  try {
    const { sessionId, filePath, content, createdBy } = req.body;

    if (!sessionId || !filePath || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'Session ID, file path, and creator are required'
      });
    }

    const service = getCollaborationService();
    const document = service.createCodeDocument(sessionId, filePath, content || '', createdBy);

    res.json({
      success: true,
      document: {
        id: document.id,
        sessionId: document.sessionId,
        filePath: document.filePath,
        version: document.version,
        collaborators: document.collaborators,
        lastModified: document.lastModified
      }
    });
  } catch (error: any) {
    Logger.error('Failed to create collaborative document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create collaborative document'
    });
  }
});

// GET /api/collaboration/documents/:documentId/analytics - Get document analytics
router.get('/documents/:documentId/analytics', async (req, res) => {
  try {
    const { documentId } = req.params;
    const service = getCollaborationService();
    
    const analytics = service.getDocumentAnalytics(documentId);
    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      analytics
    });
  } catch (error: any) {
    Logger.error('Failed to get document analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve document analytics'
    });
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const service = getCollaborationService();
    const stats = await service.getCollaborationStats();
    
    res.json({
      success: true,
      status: 'healthy',
      service: 'collaboration',
      stats: {
        activeSessions: stats.activeSessions,
        totalUsers: stats.totalUsers
      },
      websocketUrl: `ws://localhost:${process.env.COLLAB_WEBSOCKET_PORT || 8080}/collaboration`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

export { router as collaborationRouter, initializeCollaborationService };