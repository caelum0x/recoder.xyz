/**
 * Responsive Design API Routes  
 * PRODUCTION FEATURE: Enterprise responsive design optimization
 * Advanced device-adaptive UI that competitors lack
 */

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { Logger } from '@recoder/shared';
import { responsiveDesignService, DeviceAnalytics, ResponsiveConfig, DeviceType, Breakpoint } from '../services/responsive-design';
import { authenticateUser, requireSubscription } from '../middleware/auth';
import { apiLimiter } from '../middleware/rate-limit';

const router = express.Router();

// Validation middleware
const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /api/responsive-design/config/:name? - Get responsive configuration
 */
router.get('/config/:name?', async (req, res) => {
  try {
    const { name } = req.params;
    const config = await responsiveDesignService.getResponsiveConfig(name);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    // Generate CSS media queries for frontend use
    const mediaQueries = responsiveDesignService.generateMediaQueries(config.name);

    res.json({
      success: true,
      configuration: config,
      mediaQueries,
      usage: {
        totalBreakpoints: Object.keys(config.breakpoints).length,
        supportedDevices: ['mobile', 'tablet', 'desktop', 'tv', 'watch'],
        features: [
          'Mobile-first responsive design',
          'Advanced breakpoint management',
          'Component-specific responsive rules',
          'Performance-optimized media queries',
          'Real-time device analytics'
        ]
      },
      enterpriseAdvantage: {
        message: "Advanced responsive design optimization with real-time device analytics",
        features: [
          "Intelligent breakpoint management with performance optimization",
          "Component-specific responsive rules for complex UIs",
          "Real-time device usage analytics and insights", 
          "Custom responsive configurations per enterprise",
          "Performance monitoring across all device types",
          "Automated responsive design recommendations"
        ],
        competitors: "Cursor and Copilot provide NO responsive design optimization or device analytics"
      }
    });

  } catch (error: any) {
    Logger.error('Failed to get responsive config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get responsive configuration',
      details: error.message
    });
  }
});

/**
 * GET /api/responsive-design/configs - Get all available configurations
 */
router.get('/configs', async (req, res) => {
  try {
    const configurations = await responsiveDesignService.getAllConfigurations();

    res.json({
      success: true,
      configurations,
      summary: {
        total: configurations.length,
        default: configurations.find(c => c.isDefault)?.name || 'mobile-first',
        active: configurations.filter(c => c.isActive).length
      },
      recommendations: {
        mobileFirst: 'Recommended for most applications',
        desktopFirst: 'Use for desktop-heavy applications',
        custom: 'Create custom configs for specific needs'
      }
    });

  } catch (error: any) {
    Logger.error('Failed to get configurations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configurations',
      details: error.message
    });
  }
});

/**
 * POST /api/responsive-design/config - Save responsive configuration (Enterprise)
 */
router.post('/config',
  authenticateUser,
  requireSubscription(['enterprise']),
  apiLimiter,
  [
    body('name').isString().notEmpty().withMessage('Configuration name is required'),
    body('description').optional().isString(),
    body('breakpoints').isObject().withMessage('Breakpoints configuration required'),
    body('gridColumns').isObject().withMessage('Grid columns configuration required'),
    body('isDefault').optional().isBoolean(),
    body('isActive').optional().isBoolean()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const configData: ResponsiveConfig = {
        name: req.body.name,
        description: req.body.description,
        breakpoints: req.body.breakpoints,
        gridColumns: req.body.gridColumns,
        gridGutters: req.body.gridGutters || {},
        typographyScale: req.body.typographyScale || {},
        spacingScale: req.body.spacingScale || {},
        componentRules: req.body.componentRules || {},
        isDefault: req.body.isDefault || false,
        isActive: req.body.isActive !== false
      };

      const success = await responsiveDesignService.saveResponsiveConfig(configData);

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save configuration'
        });
      }

      res.json({
        success: true,
        message: 'Responsive configuration saved successfully',
        configuration: configData,
        enterpriseFeature: {
          customConfigurations: true,
          brandSpecific: true,
          performanceOptimized: true
        }
      });

    } catch (error: any) {
      Logger.error('Failed to save responsive config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save configuration',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/responsive-design/analytics - Track device analytics
 */
router.post('/analytics',
  [
    body('deviceType').isIn(['mobile', 'tablet', 'desktop', 'tv', 'watch']),
    body('sessionId').isString().notEmpty(),
    body('screenWidth').optional().isInt({ min: 1 }),
    body('screenHeight').optional().isInt({ min: 1 }),
    body('viewportWidth').optional().isInt({ min: 1 }),
    body('viewportHeight').optional().isInt({ min: 1 }),
    body('pixelRatio').optional().isFloat({ min: 0.1, max: 10 }),
    body('userAgent').optional().isString(),
    body('pageUrl').optional().isURL(),
    body('loadTime').optional().isInt({ min: 0 }),
    body('renderTime').optional().isInt({ min: 0 }),
    body('interactionTime').optional().isInt({ min: 0 }),
    body('layoutShifts').optional().isInt({ min: 0 }),
    body('scrollDepth').optional().isFloat({ min: 0, max: 1 })
  ],
  validateRequest,
  async (req, res) => {
    try {
      // Detect device type from user agent if not provided
      let deviceType = req.body.deviceType;
      if (!deviceType && req.body.userAgent) {
        deviceType = responsiveDesignService.detectDeviceType(req.body.userAgent);
      }

      // Determine breakpoint from viewport width
      let breakpointUsed: Breakpoint | undefined;
      if (req.body.viewportWidth) {
        breakpointUsed = responsiveDesignService.getBreakpointFromWidth(req.body.viewportWidth);
      }

      const analytics: DeviceAnalytics = {
        deviceType: deviceType || 'desktop',
        screenWidth: req.body.screenWidth,
        screenHeight: req.body.screenHeight,
        viewportWidth: req.body.viewportWidth,
        viewportHeight: req.body.viewportHeight,
        pixelRatio: req.body.pixelRatio,
        userAgent: req.body.userAgent,
        browserName: req.body.browserName,
        browserVersion: req.body.browserVersion,
        platform: req.body.platform,
        sessionId: req.body.sessionId,
        userId: req.user?.id,
        pageUrl: req.body.pageUrl,
        component: req.body.component,
        loadTime: req.body.loadTime,
        renderTime: req.body.renderTime,
        interactionTime: req.body.interactionTime,
        breakpointUsed,
        layoutShifts: req.body.layoutShifts,
        scrollDepth: req.body.scrollDepth
      };

      const success = await responsiveDesignService.trackDeviceAnalytics(analytics);

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to track device analytics'
        });
      }

      res.json({
        success: true,
        message: 'Device analytics tracked successfully',
        detected: {
          deviceType: analytics.deviceType,
          breakpointUsed: breakpointUsed || 'unknown'
        },
        analytics: {
          sessionTracking: true,
          performanceMonitoring: true,
          responsiveInsights: true
        }
      });

    } catch (error: any) {
      Logger.error('Failed to track device analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to track device analytics',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/responsive-design/insights - Get responsive design insights (Enterprise)
 */
router.get('/insights',
  authenticateUser,
  requireSubscription(['enterprise']),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      let dateRange: { start: Date; end: Date } | undefined;
      if (startDate && endDate) {
        dateRange = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };
      }

      const insights = await responsiveDesignService.getResponsiveInsights(dateRange);

      // Calculate additional metrics
      const totalSessions = insights.popularDevices.reduce((sum, device) => sum + device.count, 0);
      const mobileFirst = insights.popularDevices[0]?.deviceType === 'mobile';
      
      const performanceScore = Object.values(insights.performanceByDevice)
        .reduce((avg, perf) => {
          const score = Math.max(0, 100 - (perf.averageLoadTime / 50) - (perf.layoutShifts * 20));
          return avg + score;
        }, 0) / Object.keys(insights.performanceByDevice).length;

      res.json({
        success: true,
        insights,
        metrics: {
          totalSessions,
          mobileFirstRecommended: mobileFirst,
          overallPerformanceScore: Math.round(performanceScore),
          topDevice: insights.popularDevices[0]?.deviceType || 'unknown',
          responsiveMaturity: insights.recommendations.length < 3 ? 'excellent' : 
                              insights.recommendations.length < 6 ? 'good' : 'needs-improvement'
        },
        recommendations: {
          immediate: insights.recommendations.slice(0, 3),
          longTerm: insights.recommendations.slice(3),
          nextSteps: [
            'Monitor performance metrics regularly',
            'Test on actual devices matching your user base',
            'Implement progressive enhancement for slower networks'
          ]
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      Logger.error('Failed to get responsive insights:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get responsive insights',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/responsive-design/detect - Detect device and breakpoint
 */
router.post('/detect',
  [
    body('userAgent').optional().isString(),
    body('viewportWidth').optional().isInt({ min: 1 }),
    body('configName').optional().isString()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { userAgent, viewportWidth, configName } = req.body;

      let deviceType: DeviceType = 'desktop';
      let breakpoint: Breakpoint = 'lg';

      // Detect device type from user agent
      if (userAgent) {
        deviceType = responsiveDesignService.detectDeviceType(userAgent);
      }

      // Detect breakpoint from viewport width
      if (viewportWidth) {
        breakpoint = responsiveDesignService.getBreakpointFromWidth(viewportWidth, configName);
      }

      // Get configuration for additional context
      const config = await responsiveDesignService.getResponsiveConfig(configName);
      const breakpointInfo = config?.breakpoints[breakpoint];

      res.json({
        success: true,
        detection: {
          deviceType,
          breakpoint,
          confidence: userAgent && viewportWidth ? 'high' : 
                     userAgent || viewportWidth ? 'medium' : 'low'
        },
        breakpointInfo,
        recommendations: {
          layout: breakpointInfo ? `Use ${breakpointInfo.columns} column grid` : 'Use default layout',
          spacing: breakpointInfo ? `Apply ${breakpointInfo.gutter}px gutters` : 'Use default spacing',
          typography: config?.typographyScale[breakpoint] ? 
            `Base font size: ${config.typographyScale[breakpoint].baseFontSize}px` : 
            'Use default typography'
        }
      });

    } catch (error: any) {
      Logger.error('Failed to detect device and breakpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to detect device and breakpoint',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/responsive-design/media-queries/:configName? - Get CSS media queries
 */
router.get('/media-queries/:configName?', async (req, res) => {
  try {
    const { configName } = req.params;
    const mediaQueries = responsiveDesignService.generateMediaQueries(configName);

    // Also get the configuration for additional context
    const config = await responsiveDesignService.getResponsiveConfig(configName);

    res.json({
      success: true,
      configName: configName || 'mobile-first',
      mediaQueries,
      breakpoints: config?.breakpoints || {},
      usage: {
        css: 'Use these media queries in your CSS',
        javascript: 'Use breakpoint detection in your JavaScript',
        frameworks: 'Compatible with Tailwind, Bootstrap, and custom CSS'
      },
      examples: {
        css: Object.entries(mediaQueries).map(([name, query]) => ({
          breakpoint: name,
          mediaQuery: query,
          example: `${query} {\n  .container { max-width: ${config?.breakpoints[name as Breakpoint]?.maxWidth || 1200}px; }\n}`
        }))
      }
    });

  } catch (error: any) {
    Logger.error('Failed to get media queries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get media queries',
      details: error.message
    });
  }
});

/**
 * GET /api/responsive-design/performance - Get responsive performance metrics
 */
router.get('/performance',
  authenticateUser,
  [
    query('deviceType').optional().isIn(['mobile', 'tablet', 'desktop', 'tv', 'watch']),
    query('breakpoint').optional().isIn(['xs', 'sm', 'md', 'lg', 'xl', '2xl']),
    query('days').optional().isInt({ min: 1, max: 365 }).toInt()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { deviceType, breakpoint, days = 30 } = req.query;

      const dateRange = {
        start: new Date(Date.now() - (days as number) * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      const insights = await responsiveDesignService.getResponsiveInsights(dateRange);

      // Filter by device type if specified
      let performanceData = insights.performanceByDevice;
      if (deviceType) {
        performanceData = { [deviceType as string]: performanceData[deviceType as string] };
      }

      // Filter by breakpoint if specified  
      let breakpointData = insights.breakpointUsage;
      if (breakpoint) {
        breakpointData = { [breakpoint as string]: breakpointData[breakpoint as string] };
      }

      // Calculate performance scores
      const performanceScores = Object.entries(performanceData).map(([device, perf]) => ({
        device,
        loadTimeScore: Math.max(0, 100 - (perf.averageLoadTime / 50)),
        renderTimeScore: Math.max(0, 100 - (perf.averageRenderTime / 20)),
        interactionScore: Math.max(0, 100 - (perf.averageInteractionTime / 100)),
        stabilityScore: Math.max(0, 100 - (perf.layoutShifts * 100)),
        overallScore: Math.max(0, 100 - (perf.averageLoadTime / 50) - (perf.layoutShifts * 20))
      }));

      res.json({
        success: true,
        performance: {
          byDevice: performanceData,
          byBreakpoint: breakpointData,
          scores: performanceScores
        },
        benchmarks: {
          excellent: { loadTime: '< 1.5s', renderTime: '< 0.5s', layoutShifts: '< 0.1' },
          good: { loadTime: '< 2.5s', renderTime: '< 1s', layoutShifts: '< 0.25' },
          needsImprovement: { loadTime: '> 4s', renderTime: '> 2s', layoutShifts: '> 0.5' }
        },
        recommendations: insights.recommendations,
        period: `${days} days`,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      Logger.error('Failed to get performance metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get performance metrics',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/responsive-design/health - Health check
 */
router.get('/health', async (req, res) => {
  try {
    const configurations = await responsiveDesignService.getAllConfigurations();
    const defaultConfig = configurations.find(c => c.isDefault);

    res.json({
      success: true,
      status: 'healthy',
      service: 'responsive-design',
      features: [
        'Advanced responsive design optimization',
        'Real-time device analytics and insights',
        'Custom breakpoint configurations',
        'Performance monitoring across device types',
        'Automated responsive recommendations',
        'Component-specific responsive rules'
      ],
      statistics: {
        availableConfigurations: configurations.length,
        defaultConfiguration: defaultConfig?.name || 'mobile-first',
        supportedDeviceTypes: ['mobile', 'tablet', 'desktop', 'tv', 'watch'],
        supportedBreakpoints: ['xs', 'sm', 'md', 'lg', 'xl', '2xl']
      },
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

export { router as responsiveDesignRouter };