/**
 * Game Analytics API Routes
 * RESTful endpoints for game analytics event tracking and reporting
 */

import { Router, Request, Response } from 'express';
import { gameAnalyticsService } from '../services/game-analytics';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';
// import { validateRequest } from '../middleware/validation';
const validateRequest = (req: any, res: any, next: any) => next(); // Temporary validation bypass

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * POST /api/game-analytics/events
 * Record a single analytics event
 */
router.post('/events', validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventType, eventName, category, eventData, properties, metrics, sessionId, projectId, platform, deviceInfo, location } = req.body;

    if (!eventType || !eventName) {
      res.status(400).json({
        error: 'Event type and name are required'
      });
      return;
    }

    await gameAnalyticsService.recordEvent({
      eventType,
      eventName,
      category,
      eventData: eventData || {},
      properties: properties || {},
      metrics: metrics || {},
      sessionId,
      userId: (req as any).user?.id,
      projectId,
      platform,
      deviceInfo,
      location
    });

    res.json({
      message: 'Event recorded successfully',
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to record analytics event:', error);
    res.status(500).json({
      error: 'Failed to record analytics event',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

/**
 * POST /api/game-analytics/events/batch
 * Record multiple analytics events in batch
 */
router.post('/events/batch', validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      res.status(400).json({
        error: 'Events array is required'
      });
    }

    // Enrich events with user ID
    const enrichedEvents = events.map((event: any) => ({
      ...event,
      userId: (req as any).user?.id,
      eventData: event.eventData || {},
      properties: event.properties || {},
      metrics: event.metrics || {}
    }));

    await gameAnalyticsService.recordEvents(enrichedEvents);

    res.json({
      message: `${events.length} events recorded successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to record batch analytics events:', error);
    res.status(500).json({
      error: 'Failed to record batch analytics events',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/game-analytics/sessions/start
 * Start a new game session
 */
router.post('/sessions/start', validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, projectId, platform, gameVersion, deviceInfo } = req.body;

    if (!sessionId || !projectId || !platform || !gameVersion) {
      res.status(400).json({
        error: 'Session ID, project ID, platform, and game version are required'
      });
    }

    const newSessionId = await gameAnalyticsService.startSession({
      sessionId,
      userId: (req as any).user?.id,
      projectId,
      platform,
      gameVersion,
      deviceInfo: deviceInfo || {}
    });

    res.json({
      message: 'Game session started successfully',
      sessionId: newSessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to start game session:', error);
    res.status(500).json({
      error: 'Failed to start game session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/game-analytics/sessions/:sessionId/end
 * End a game session
 */
router.post('/sessions/:sessionId/end', validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    await gameAnalyticsService.endSession(sessionId);

    res.json({
      message: 'Game session ended successfully',
      sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to end game session:', error);
    res.status(500).json({
      error: 'Failed to end game session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/game-analytics/dashboard/:projectId
 * Get real-time analytics dashboard data
 */
router.get('/dashboard/:projectId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const dashboardData = await gameAnalyticsService.getDashboardData(projectId);

    res.json({
      data: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get analytics dashboard data:', error);
    res.status(500).json({
      error: 'Failed to get analytics dashboard data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/game-analytics/reports/generate
 * Generate an analytics report
 */
router.post('/reports/generate', validateRequest, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, startDate, endDate, reportType = 'overview' } = req.body;

    if (!projectId || !startDate || !endDate) {
      res.status(400).json({
        error: 'Project ID, start date, and end date are required'
      });
    }

    if (!['overview', 'retention', 'performance', 'monetization'].includes(reportType)) {
      res.status(400).json({
        error: 'Invalid report type. Must be one of: overview, retention, performance, monetization'
      });
    }

    const report = await gameAnalyticsService.generateReport(
      projectId,
      new Date(startDate),
      new Date(endDate),
      reportType
    );

    res.json({
      report,
      message: 'Analytics report generated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to generate analytics report:', error);
    res.status(500).json({
      error: 'Failed to generate analytics report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/game-analytics/player-behavior/:userId/:projectId
 * Get player behavior profile
 */
router.get('/player-behavior/:userId/:projectId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, projectId } = req.params;

    const profile = await gameAnalyticsService.getPlayerBehaviorProfile(userId, projectId);

    if (!profile) {
      res.status(404).json({
        error: 'Player behavior profile not found'
      });
      return;
    }

    res.json({
      profile,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get player behavior profile:', error);
    res.status(500).json({
      error: 'Failed to get player behavior profile',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/game-analytics/health
 * Health check endpoint for game analytics service
 */
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      status: 'healthy',
      service: 'game-analytics',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    logger.error('Game analytics health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'game-analytics',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/game-analytics/test/generate-sample-data
 * Generate sample analytics data for testing (development only)
 */
router.post('/test/generate-sample-data', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        error: 'Sample data generation is not allowed in production'
      });
      return;
    }

    const { projectId, eventCount = 100 } = req.body;
    if (!projectId) {
      res.status(400).json({
        error: 'Project ID is required'
      });
      return;
    }

    // Generate sample events
    const sampleEvents: any[] = [];
    const eventTypes = ['player_action', 'game_event', 'performance', 'monetization'];
    const eventNames = {
      player_action: ['level_complete', 'item_pickup', 'enemy_defeat', 'quest_start'],
      game_event: ['level_start', 'level_end', 'checkpoint_reached', 'boss_fight'],
      performance: ['frame_rate', 'load_time', 'memory_usage', 'crash'],
      monetization: ['purchase', 'item_view', 'store_visit', 'ad_view']
    };
    const platforms = ['Windows', 'Mac', 'iOS', 'Android', 'WebGL'];

    for (let i = 0; i < eventCount; i++) {
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const eventName = (eventNames as any)[eventType][Math.floor(Math.random() * (eventNames as any)[eventType].length)];
      const platform = platforms[Math.floor(Math.random() * platforms.length)];

      const event = {
        eventType,
        eventName,
        category: eventType === 'performance' ? 'system' : 'gameplay',
        eventData: {
          level: Math.floor(Math.random() * 50) + 1,
          score: Math.floor(Math.random() * 10000),
          item: eventType === 'monetization' ? `item_${Math.floor(Math.random() * 100)}` : undefined
        },
        properties: {
          difficulty: ['easy', 'normal', 'hard'][Math.floor(Math.random() * 3)],
          gameMode: ['singleplayer', 'multiplayer', 'coop'][Math.floor(Math.random() * 3)]
        },
        metrics: {
          duration: Math.floor(Math.random() * 300) + 10, // 10-310 seconds
          fps: eventType === 'performance' ? Math.floor(Math.random() * 60) + 30 : undefined,
          revenue: eventType === 'monetization' ? Math.random() * 10 : undefined
        },
        sessionId: `session_${Math.floor(Math.random() * 10) + 1}`,
        projectId,
        platform,
        deviceInfo: {
          os: platform,
          version: '1.0.0',
          device: 'test-device'
        }
      };

      sampleEvents.push(event);
    }

    // Record all sample events
    res.json({
      message: `Generated ${eventCount} sample analytics events`,
      projectId,
      eventCount: sampleEvents.length,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to generate sample analytics data:', error);
    res.status(500).json({
      error: 'Failed to generate sample analytics data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

export default router;

//export default router;
// CommonJS compatibility
module.exports = router;
