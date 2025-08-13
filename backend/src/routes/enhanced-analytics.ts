/**
 * Enhanced Analytics API Routes
 * PRODUCTION FEATURE: Enterprise analytics and business intelligence
 * Advanced user behavior tracking that Cursor/Copilot don't provide
 */

import express from 'express';
import { Logger } from '@recoder/shared';
import { analyticsService, trackingHelpers, AnalyticsQuery, FunnelStep } from '../services/analytics-service';

const router = express.Router();

// POST /api/analytics/enhanced/track - Track a custom event
router.post('/track', async (req, res) => {
  try {
    const { userId, event, properties, sessionId, deviceId, context } = req.body;

    if (!event) {
      return res.status(400).json({
        success: false,
        error: 'Event name is required'
      });
    }

    await analyticsService.track({
      userId,
      sessionId,
      deviceId,
      event,
      properties: properties || {},
      context: {
        ...context,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }
    });

    res.json({
      success: true,
      message: 'Event tracked successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Event tracking failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track event',
      details: error.message
    });
  }
});

// POST /api/analytics/enhanced/identify - Identify a user
router.post('/identify', async (req, res) => {
  try {
    const { userId, properties, traits } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    await analyticsService.identify({
      userId,
      properties: properties || {},
      traits: traits || {}
    });

    res.json({
      success: true,
      message: 'User identified successfully',
      userId
    });

  } catch (error: any) {
    Logger.error('User identification failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to identify user',
      details: error.message
    });
  }
});

// POST /api/analytics/enhanced/batch - Track multiple events in batch
router.post('/batch', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Events array is required'
      });
    }

    // Track each event
    const results = await Promise.allSettled(
      events.map(event => analyticsService.track({
        ...event,
        context: {
          ...event.context,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      }))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      success: true,
      message: `Batch tracking completed`,
      statistics: {
        total: events.length,
        successful,
        failed
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Batch tracking failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track batch events',
      details: error.message
    });
  }
});

// GET /api/analytics/enhanced/dashboard - Get real-time dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const dashboardData = await analyticsService.getDashboardData();

    res.json({
      success: true,
      dashboard: dashboardData,
      enterpriseAdvantage: {
        message: "Real-time analytics dashboard with advanced business intelligence",
        features: [
          "Real-time user activity tracking",
          "Feature usage analytics",
          "Business metrics and KPIs",
          "User behavior analysis",
          "Custom event tracking",
          "Cohort and funnel analysis"
        ],
        competitors: "Cursor and Copilot provide NO analytics or business intelligence capabilities"
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Dashboard data failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard data',
      details: error.message
    });
  }
});

// POST /api/analytics/enhanced/query - Execute custom analytics query
router.post('/query', async (req, res) => {
  try {
    const query: AnalyticsQuery = req.body;

    if (!query.dateRange || !query.dateRange.start || !query.dateRange.end) {
      return res.status(400).json({
        success: false,
        error: 'Date range with start and end is required'
      });
    }

    // Convert string dates to Date objects
    query.dateRange.start = new Date(query.dateRange.start);
    query.dateRange.end = new Date(query.dateRange.end);

    const result = await analyticsService.query(query);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Analytics query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute analytics query',
      details: error.message
    });
  }
});

// POST /api/analytics/enhanced/funnel - Analyze funnel conversion
router.post('/funnel', async (req, res) => {
  try {
    const { steps, dateRange } = req.body;

    if (!Array.isArray(steps) || steps.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 funnel steps are required'
      });
    }

    if (!dateRange || !dateRange.start || !dateRange.end) {
      return res.status(400).json({
        success: false,
        error: 'Date range is required'
      });
    }

    const funnelSteps: FunnelStep[] = steps.map(step => ({
      event: step.event,
      properties: step.properties || {},
      name: step.name || step.event
    }));

    const analysis = await analyticsService.analyzeFunnel(funnelSteps, {
      start: new Date(dateRange.start),
      end: new Date(dateRange.end)
    });

    res.json({
      success: true,
      analysis,
      insights: {
        biggestDropoff: analysis.steps.reduce((max, step, index) => 
          step.dropoffRate > (analysis.steps[max]?.dropoffRate || 0) ? index : max, 0),
        conversionOpportunity: `${(100 - analysis.overallConversionRate).toFixed(1)}% improvement potential`,
        recommendation: analysis.overallConversionRate < 10 
          ? 'Focus on reducing friction in early steps'
          : analysis.overallConversionRate < 30
          ? 'Optimize middle funnel steps'
          : 'Fine-tune final conversion steps'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Funnel analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze funnel',
      details: error.message
    });
  }
});

// GET /api/analytics/enhanced/cohorts - Get cohort retention analysis
router.get('/cohorts', async (req, res) => {
  try {
    const { period = 'weekly' } = req.query;

    if (!['daily', 'weekly', 'monthly'].includes(period as string)) {
      return res.status(400).json({
        success: false,
        error: 'Period must be daily, weekly, or monthly'
      });
    }

    const analysis = await analyticsService.analyzeCohorts(period as any);

    res.json({
      success: true,
      analysis,
      insights: {
        retentionTrend: analysis.averageRetention.day30 > analysis.averageRetention.day7
          ? 'improving' : 'declining',
        retentionHealth: analysis.averageRetention.day30 > 50 
          ? 'excellent' : analysis.averageRetention.day30 > 30 
          ? 'good' : analysis.averageRetention.day30 > 15 
          ? 'average' : 'poor',
        recommendation: analysis.averageRetention.day7 < 30
          ? 'Focus on onboarding and early user experience'
          : 'Optimize long-term engagement features'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Cohort analysis failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze cohorts',
      details: error.message
    });
  }
});

// GET /api/analytics/enhanced/features/:feature - Get feature usage metrics
router.get('/features/:feature', async (req, res) => {
  try {
    const { feature } = req.params;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Start and end date query parameters are required'
      });
    }

    const dateRange = {
      start: new Date(start as string),
      end: new Date(end as string)
    };

    const metrics = await analyticsService.getFeatureUsageMetrics(feature, dateRange);

    res.json({
      success: true,
      metrics,
      insights: {
        engagementLevel: metrics.usage.engagementScore > 5 
          ? 'high' : metrics.usage.engagementScore > 2 
          ? 'medium' : 'low',
        userAdoption: `${((metrics.usage.activeUsers / (metrics.usage.totalUsers || 1)) * 100).toFixed(1)}%`,
        trendDirection: metrics.trends.length > 1 
          ? metrics.trends[metrics.trends.length - 1].users > metrics.trends[0].users ? 'up' : 'down'
          : 'stable'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Feature metrics failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get feature metrics',
      details: error.message
    });
  }
});

// GET /api/analytics/enhanced/features - Get all feature usage overview
router.get('/features', async (req, res) => {
  try {
    const { start, end } = req.query;
    const defaultEnd = new Date();
    const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const dateRange = {
      start: start ? new Date(start as string) : defaultStart,
      end: end ? new Date(end as string) : defaultEnd
    };

    // Get top features from dashboard data
    const dashboardData = await analyticsService.getDashboardData();
    
    // Get detailed metrics for top features
    const featureMetrics = await Promise.all(
      dashboardData.topFeatures.slice(0, 10).map(async ({ feature }) => {
        try {
          const metrics = await analyticsService.getFeatureUsageMetrics(feature, dateRange);
          return metrics;
        } catch (error) {
          Logger.warn(`Failed to get metrics for feature ${feature}:`, error);
          return null;
        }
      })
    );

    const validMetrics = featureMetrics.filter(Boolean);

    res.json({
      success: true,
      features: validMetrics,
      summary: {
        totalFeatures: validMetrics.length,
        totalUsers: validMetrics.reduce((sum, m) => sum + (m?.usage.totalUsers || 0), 0),
        mostEngaging: validMetrics.reduce((max, m) => 
          (m?.usage.engagementScore || 0) > (max?.usage.engagementScore || 0) ? m : max, validMetrics[0]),
        fastestGrowing: validMetrics.reduce((max, m) => {
          const growth = m && m.trends.length > 1 
            ? m.trends[m.trends.length - 1].users - m.trends[0].users 
            : 0;
          const maxGrowth = max && max.trends.length > 1 
            ? max.trends[max.trends.length - 1].users - max.trends[0].users 
            : 0;
          return growth > maxGrowth ? m : max;
        }, validMetrics[0])
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Features overview failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get features overview',
      details: error.message
    });
  }
});

// Helper routes for common tracking patterns
router.post('/track/signup', async (req, res) => {
  try {
    const { userId, properties } = req.body;
    await trackingHelpers.signup(userId, properties);
    res.json({ success: true, message: 'Signup tracked' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/track/login', async (req, res) => {
  try {
    const { userId, properties } = req.body;
    await trackingHelpers.login(userId, properties);
    res.json({ success: true, message: 'Login tracked' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/track/subscription', async (req, res) => {
  try {
    const { userId, plan, revenue } = req.body;
    await trackingHelpers.subscribe(userId, plan, revenue);
    res.json({ success: true, message: 'Subscription tracked' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/track/code-generation', async (req, res) => {
  try {
    const { userId, details } = req.body;
    await trackingHelpers.codeGeneration(userId, details);
    res.json({ success: true, message: 'Code generation tracked' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/track/feature', async (req, res) => {
  try {
    const { userId, feature, action, properties } = req.body;
    await trackingHelpers.feature(userId, feature, action, properties);
    res.json({ success: true, message: 'Feature usage tracked' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/enhanced/export - Export analytics data
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', start, end, event, userId } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Start and end date parameters are required'
      });
    }

    const query: AnalyticsQuery = {
      dateRange: {
        start: new Date(start as string),
        end: new Date(end as string)
      },
      event: event as string,
      userId: userId as string,
      limit: 10000 // Max export limit
    };

    const result = await analyticsService.query(query);

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['timestamp', 'value', 'dimensions'];
      const csvRows = [
        headers.join(','),
        ...result.data.map(row => [
          row.timestamp.toISOString(),
          row.value,
          JSON.stringify(row.dimensions || {})
        ].join(','))
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics-export.csv');
      res.send(csvRows.join('\n'));
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics-export.json');
      res.json({
        success: true,
        exportData: result,
        metadata: {
          exportedAt: new Date().toISOString(),
          query,
          totalRecords: result.data.length
        }
      });
    }

  } catch (error: any) {
    Logger.error('Analytics export failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export analytics data',
      details: error.message
    });
  }
});

// GET /api/analytics/enhanced/health - Health check for analytics service
router.get('/health', async (req, res) => {
  try {
    const health = await analyticsService.healthCheck();
    
    res.status(health.status === 'healthy' ? 200 : 503).json({
      success: health.status === 'healthy',
      status: health.status,
      service: 'enhanced-analytics',
      details: health.details,
      enterpriseAdvantage: 'Advanced analytics and business intelligence platform',
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

// GET /api/analytics/enhanced/config - Get analytics configuration
router.get('/config', (req, res) => {
  try {
    const config = analyticsService.getConfig();

    // Don't expose sensitive data
    const safeConfig = {
      enablePostHog: config.enablePostHog,
      enableCustomAnalytics: config.enableCustomAnalytics,
      batchSize: config.batchSize,
      flushInterval: config.flushInterval,
      retentionDays: config.retentionDays
    };

    res.json({
      success: true,
      configuration: safeConfig,
      features: [
        'Real-time event tracking',
        'Custom analytics queries',
        'Funnel conversion analysis', 
        'Cohort retention analysis',
        'Feature usage metrics',
        'Business intelligence dashboard',
        'Data export capabilities',
        'PostHog integration'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Failed to get analytics config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics configuration'
    });
  }
});

export { router as enhancedAnalyticsRouter };