const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { UsageAnalytics, User, Project, UserDevice } = require('../models/index');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/analytics/track:
 *   post:
 *     summary: Track usage analytics event
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventType:
 *                 type: string
 *                 enum: [api_call, code_generation, authentication, sync, ai_request]
 *               platform:
 *                 type: string
 *                 enum: [cli, web, mobile, extension, desktop]
 *               provider:
 *                 type: string
 *                 description: AI provider if applicable
 *               tokens:
 *                 type: integer
 *                 description: Tokens used
 *               cost:
 *                 type: number
 *                 description: Cost in USD
 *               duration:
 *                 type: integer
 *                 description: Duration in milliseconds
 *               success:
 *                 type: boolean
 *                 default: true
 *               metadata:
 *                 type: object
 *                 description: Additional event metadata
 *     responses:
 *       201:
 *         description: Analytics event tracked successfully
 */
router.post('/track', authenticateToken, [
  body('eventType')
    .isIn(['api_call', 'code_generation', 'authentication', 'sync', 'ai_request'])
    .withMessage('Event type must be one of: api_call, code_generation, authentication, sync, ai_request'),
  body('platform')
    .isIn(['cli', 'web', 'mobile', 'extension', 'desktop'])
    .withMessage('Platform must be one of: cli, web, mobile, extension, desktop'),
  body('provider')
    .optional()
    .isString()
    .withMessage('Provider must be a string'),
  body('tokens')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Tokens must be a non-negative integer'),
  body('cost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Cost must be a non-negative number'),
  body('duration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Duration must be a non-negative integer'),
  body('success')
    .optional()
    .isBoolean()
    .withMessage('Success must be a boolean'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const userId = req.user.id;
    const { 
      eventType, 
      platform, 
      provider, 
      tokens, 
      cost, 
      duration, 
      success = true,
      metadata = {}
    } = req.body;

    // Create analytics record
    const analyticsRecord = await UsageAnalytics.create({
      userId,
      eventType,
      platform,
      provider,
      tokens,
      cost,
      duration,
      success,
      metadata
    });

    res.status(201).json({
      success: true,
      data: {
        id: analyticsRecord.id,
        eventType: analyticsRecord.eventType,
        platform: analyticsRecord.platform,
        timestamp: analyticsRecord.timestamp
      },
      message: 'Analytics event tracked successfully'
    });

  } catch (error) {
    logger.error('Failed to track analytics event:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get dashboard analytics data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *         description: Time frame for analytics
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *         description: Filter by specific platform
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 */
router.get('/dashboard', authenticateToken, [
  query('timeframe')
    .optional()
    .isIn(['hour', 'day', 'week', 'month'])
    .withMessage('Timeframe must be one of: hour, day, week, month'),
  query('platform')
    .optional()
    .isString()
    .withMessage('Platform must be a string')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const userId = req.user.id;
    const { timeframe = 'day', platform } = req.query;

    // Calculate time range
    const now = new Date();
    let startTime;

    switch (timeframe) {
      case 'hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // day
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Build where conditions
    const whereConditions = {
      userId,
      timestamp: { $gte: startTime }
    };

    if (platform) {
      whereConditions.platform = platform;
    }

    // Get analytics data
    const analytics = await UsageAnalytics.findAll({
      where: whereConditions,
      order: [['timestamp', 'DESC']]
    });

    // Calculate metrics
    const totalEvents = analytics.length;
    const totalTokens = analytics.reduce((sum, record) => sum + (record.tokens || 0), 0);
    const totalCost = analytics.reduce((sum, record) => sum + (record.cost || 0), 0);
    const successRate = totalEvents > 0 ? 
      (analytics.filter(r => r.success).length / totalEvents * 100) : 100;

    // Platform distribution
    const platformDistribution = {};
    analytics.forEach(record => {
      platformDistribution[record.platform] = (platformDistribution[record.platform] || 0) + 1;
    });

    // Event type distribution
    const eventTypeDistribution = {};
    analytics.forEach(record => {
      eventTypeDistribution[record.eventType] = (eventTypeDistribution[record.eventType] || 0) + 1;
    });

    // Provider usage
    const providerUsage = {};
    analytics.filter(r => r.provider).forEach(record => {
      if (!providerUsage[record.provider]) {
        providerUsage[record.provider] = { count: 0, tokens: 0, cost: 0 };
      }
      providerUsage[record.provider].count++;
      providerUsage[record.provider].tokens += record.tokens || 0;
      providerUsage[record.provider].cost += record.cost || 0;
    });

    // Hourly activity (last 24 hours)
    const hourlyActivity = {};
    const last24Hours = analytics.filter(r => 
      new Date(r.timestamp).getTime() > now.getTime() - 24 * 60 * 60 * 1000
    );

    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000).getHours();
      hourlyActivity[hour] = 0;
    }

    last24Hours.forEach(record => {
      const hour = new Date(record.timestamp).getHours();
      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        timeframe,
        period: {
          start: startTime,
          end: now
        },
        summary: {
          totalEvents,
          totalTokens,
          totalCost: totalCost.toFixed(4),
          successRate: successRate.toFixed(2)
        },
        distributions: {
          platforms: platformDistribution,
          eventTypes: eventTypeDistribution,
          providers: providerUsage
        },
        activity: {
          hourly: hourlyActivity
        }
      },
      message: 'Dashboard data retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get dashboard data:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/analytics/performance:
 *   get:
 *     summary: Get performance metrics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: metric
 *         schema:
 *           type: string
 *           enum: [response_time, success_rate, token_usage, cost_efficiency]
 *         description: Specific metric to analyze
 *     responses:
 *       200:
 *         description: Performance metrics retrieved successfully
 */
router.get('/performance', authenticateToken, [
  query('metric')
    .optional()
    .isIn(['response_time', 'success_rate', 'token_usage', 'cost_efficiency'])
    .withMessage('Metric must be one of: response_time, success_rate, token_usage, cost_efficiency')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const userId = req.user.id;
    const { metric } = req.query;

    // Get last 7 days of data for performance analysis
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const analytics = await UsageAnalytics.findAll({
      where: {
        userId,
        timestamp: { $gte: weekAgo }
      },
      order: [['timestamp', 'DESC']]
    });

    const performanceMetrics = {
      response_time: {
        name: 'Response Time',
        description: 'Average response time by platform and provider',
        data: {}
      },
      success_rate: {
        name: 'Success Rate',
        description: 'Success rate percentage by platform',
        data: {}
      },
      token_usage: {
        name: 'Token Usage',
        description: 'Token consumption patterns',
        data: {}
      },
      cost_efficiency: {
        name: 'Cost Efficiency',
        description: 'Cost per token by provider',
        data: {}
      }
    };

    // Calculate response time metrics
    const responseTimeByPlatform = {};
    const responseTimeByProvider = {};
    
    analytics.filter(r => r.duration).forEach(record => {
      // By platform
      if (!responseTimeByPlatform[record.platform]) {
        responseTimeByPlatform[record.platform] = { total: 0, count: 0 };
      }
      responseTimeByPlatform[record.platform].total += record.duration;
      responseTimeByPlatform[record.platform].count++;

      // By provider
      if (record.provider) {
        if (!responseTimeByProvider[record.provider]) {
          responseTimeByProvider[record.provider] = { total: 0, count: 0 };
        }
        responseTimeByProvider[record.provider].total += record.duration;
        responseTimeByProvider[record.provider].count++;
      }
    });

    // Calculate averages
    Object.keys(responseTimeByPlatform).forEach(platform => {
      const data = responseTimeByPlatform[platform];
      responseTimeByPlatform[platform] = Math.round(data.total / data.count);
    });

    Object.keys(responseTimeByProvider).forEach(provider => {
      const data = responseTimeByProvider[provider];
      responseTimeByProvider[provider] = Math.round(data.total / data.count);
    });

    performanceMetrics.response_time.data = {
      byPlatform: responseTimeByPlatform,
      byProvider: responseTimeByProvider
    };

    // Calculate success rate metrics
    const successRateByPlatform = {};
    analytics.forEach(record => {
      if (!successRateByPlatform[record.platform]) {
        successRateByPlatform[record.platform] = { total: 0, successful: 0 };
      }
      successRateByPlatform[record.platform].total++;
      if (record.success) {
        successRateByPlatform[record.platform].successful++;
      }
    });

    Object.keys(successRateByPlatform).forEach(platform => {
      const data = successRateByPlatform[platform];
      successRateByPlatform[platform] = Math.round(data.successful / data.total * 100);
    });

    performanceMetrics.success_rate.data = {
      byPlatform: successRateByPlatform
    };

    // Calculate token usage patterns
    const tokenUsageByProvider = {};
    const tokenUsageByDay = {};

    analytics.filter(r => r.tokens).forEach(record => {
      // By provider
      if (record.provider) {
        tokenUsageByProvider[record.provider] = (tokenUsageByProvider[record.provider] || 0) + record.tokens;
      }

      // By day
      const day = new Date(record.timestamp).toISOString().split('T')[0];
      tokenUsageByDay[day] = (tokenUsageByDay[day] || 0) + record.tokens;
    });

    performanceMetrics.token_usage.data = {
      byProvider: tokenUsageByProvider,
      byDay: tokenUsageByDay,
      trend: Object.keys(tokenUsageByDay).length > 1 ? 'calculated' : 'insufficient_data'
    };

    // Calculate cost efficiency (cost per 1000 tokens)
    const costEfficiencyByProvider = {};
    analytics.filter(r => r.cost && r.tokens && r.provider).forEach(record => {
      if (!costEfficiencyByProvider[record.provider]) {
        costEfficiencyByProvider[record.provider] = { totalCost: 0, totalTokens: 0 };
      }
      costEfficiencyByProvider[record.provider].totalCost += record.cost;
      costEfficiencyByProvider[record.provider].totalTokens += record.tokens;
    });

    Object.keys(costEfficiencyByProvider).forEach(provider => {
      const data = costEfficiencyByProvider[provider];
      costEfficiencyByProvider[provider] = data.totalTokens > 0 ? 
        ((data.totalCost / data.totalTokens) * 1000).toFixed(4) : 0;
    });

    performanceMetrics.cost_efficiency.data = {
      byProvider: costEfficiencyByProvider,
      unit: 'USD per 1000 tokens'
    };

    // Return specific metric or all metrics
    const responseData = metric ? performanceMetrics[metric] : performanceMetrics;

    res.json({
      success: true,
      data: responseData,
      message: 'Performance metrics retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/analytics/realtime:
 *   get:
 *     summary: Get real-time analytics data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Real-time data retrieved successfully
 */
router.get('/realtime', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get data from last hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [recentActivity, activeDevices] = await Promise.all([
      // Recent activity
      UsageAnalytics.findAll({
        where: {
          userId,
          timestamp: { $gte: hourAgo }
        },
        order: [['timestamp', 'DESC']],
        limit: 50
      }),
      
      // Active devices (devices active in last hour)
      UserDevice.findAll({
        where: {
          userId,
          lastActiveAt: { $gte: hourAgo },
          isActive: true
        }
      })
    ]);

    // Calculate real-time metrics
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    
    const currentHourActivity = recentActivity.filter(r => 
      new Date(r.timestamp) >= currentHour
    );

    const metrics = {
      activeNow: {
        events: currentHourActivity.length,
        devices: activeDevices.length,
        platforms: [...new Set(currentHourActivity.map(r => r.platform))].length
      },
      lastHour: {
        totalEvents: recentActivity.length,
        successfulEvents: recentActivity.filter(r => r.success).length,
        totalTokens: recentActivity.reduce((sum, r) => sum + (r.tokens || 0), 0),
        totalCost: recentActivity.reduce((sum, r) => sum + (r.cost || 0), 0)
      },
      activity: recentActivity.slice(0, 10).map(record => ({
        id: record.id,
        eventType: record.eventType,
        platform: record.platform,
        provider: record.provider,
        success: record.success,
        timestamp: record.timestamp
      })),
      devices: activeDevices.map(device => ({
        id: device.id,
        name: device.name,
        deviceType: device.deviceType,
        platform: device.platform,
        lastActiveAt: device.lastActiveAt
      }))
    };

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date(),
      message: 'Real-time data retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get real-time data:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/analytics/export:
 *   post:
 *     summary: Export analytics data
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [json, csv]
 *               timeframe:
 *                 type: string
 *                 enum: [day, week, month, all]
 *               filters:
 *                 type: object
 *                 description: Additional filters
 *     responses:
 *       200:
 *         description: Export data retrieved successfully
 */
router.post('/export', authenticateToken, [
  body('format')
    .isIn(['json', 'csv'])
    .withMessage('Format must be json or csv'),
  body('timeframe')
    .isIn(['day', 'week', 'month', 'all'])
    .withMessage('Timeframe must be one of: day, week, month, all'),
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const userId = req.user.id;
    const { format, timeframe, filters = {} } = req.body;

    // Calculate time range
    let startTime;
    const now = new Date();

    switch (timeframe) {
      case 'day':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // all
        startTime = new Date(0);
    }

    // Build where conditions
    const whereConditions = {
      userId,
      ...(timeframe !== 'all' && { timestamp: { $gte: startTime } }),
      ...filters
    };

    const analytics = await UsageAnalytics.findAll({
      where: whereConditions,
      order: [['timestamp', 'DESC']]
    });

    let exportData;
    let contentType;
    let filename;

    if (format === 'csv') {
      // Convert to CSV
      const csvHeaders = [
        'Timestamp', 'Event Type', 'Platform', 'Provider', 
        'Tokens', 'Cost', 'Duration', 'Success'
      ];
      
      const csvRows = analytics.map(record => [
        record.timestamp.toISOString(),
        record.eventType,
        record.platform,
        record.provider || '',
        record.tokens || '',
        record.cost || '',
        record.duration || '',
        record.success
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      exportData = csvContent;
      contentType = 'text/csv';
      filename = `analytics-${timeframe}-${Date.now()}.csv`;
    } else {
      // JSON format
      exportData = JSON.stringify({
        metadata: {
          userId,
          timeframe,
          period: { start: startTime, end: now },
          totalRecords: analytics.length,
          exportedAt: now
        },
        data: analytics
      }, null, 2);
      contentType = 'application/json';
      filename = `analytics-${timeframe}-${Date.now()}.json`;
    }

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`
    });

    res.json({
      success: true,
      data: {
        format,
        timeframe,
        recordCount: analytics.length,
        downloadContent: exportData
      },
      message: 'Export data prepared successfully'
    });

  } catch (error) {
    logger.error('Failed to export analytics data:', error);
    next(error);
  }
});

module.exports = router;