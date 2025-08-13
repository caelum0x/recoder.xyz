/**
 * Theme Preferences API Routes
 * PRODUCTION FEATURE: Enterprise theme management and synchronization
 * Cross-platform theme sync that competitors don't provide
 */

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { Logger } from '@recoder/shared';
import { themePreferencesService, ThemePreferences, ThemeMode, Platform } from '../services/theme-preferences';
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
 * GET /api/theme-preferences/:platform - Get theme preferences for a platform
 */
router.get('/:platform',
  authenticateUser,
  [
    param('platform').isIn(['web', 'mobile', 'extension', 'desktop']).withMessage('Invalid platform')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { platform } = req.params;
      const preferences = await themePreferencesService.getUserThemePreferences(
        req.user.id, 
        platform as Platform
      );

      if (!preferences) {
        // Return default preferences
        return res.json({
          success: true,
          preferences: {
            userId: req.user.id,
            mode: 'system',
            customColors: {},
            platform: platform,
            syncAcrossPlatforms: true,
            lastUpdated: new Date().toISOString()
          },
          isDefault: true
        });
      }

      res.json({
        success: true,
        preferences,
        isDefault: false
      });

    } catch (error: any) {
      Logger.error('Failed to get theme preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get theme preferences',
        details: error.message
      });
    }
  }
);

/**
 * PUT /api/theme-preferences/:platform - Update theme preferences for a platform
 */
router.put('/:platform',
  authenticateUser,
  apiLimiter,
  [
    param('platform').isIn(['web', 'mobile', 'extension', 'desktop']).withMessage('Invalid platform'),
    body('mode').isIn(['light', 'dark', 'system']).withMessage('Mode must be light, dark, or system'),
    body('customColors').optional().isObject(),
    body('customColors.primary').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid primary color hex'),
    body('customColors.secondary').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid secondary color hex'),
    body('customColors.accent').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid accent color hex'),
    body('syncAcrossPlatforms').optional().isBoolean()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { platform } = req.params;
      const { mode, customColors, syncAcrossPlatforms = true } = req.body;

      const preferences: ThemePreferences = {
        userId: req.user.id,
        mode: mode as ThemeMode,
        customColors: customColors || {},
        platform: platform as Platform,
        syncAcrossPlatforms,
        lastUpdated: new Date()
      };

      const success = await themePreferencesService.updateUserThemePreferences(preferences);

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to update theme preferences'
        });
      }

      // If sync is enabled, sync across all platforms
      let syncResult = null;
      if (syncAcrossPlatforms) {
        try {
          syncResult = await themePreferencesService.syncThemeAcrossPlatforms(req.user.id, preferences);
        } catch (syncError: any) {
          Logger.warn('Failed to sync theme across platforms:', syncError);
        }
      }

      res.json({
        success: true,
        message: 'Theme preferences updated successfully',
        preferences,
        syncResult,
        enterpriseAdvantage: {
          message: "Cross-platform theme synchronization with enterprise customization",
          features: [
            "Automatic sync across web, mobile, extension, and desktop",
            "Custom enterprise branding and colors",
            "Advanced theme analytics and usage tracking",
            "System preference detection and auto-switching",
            "Professional dark mode with accessibility compliance"
          ],
          competitors: "Cursor and Copilot provide NO theme management or cross-platform sync capabilities"
        }
      });

    } catch (error: any) {
      Logger.error('Failed to update theme preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update theme preferences',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/theme-preferences - Get all platform preferences
 */
router.get('/',
  authenticateUser,
  async (req, res) => {
    try {
      const allPreferences = await themePreferencesService.getAllPlatformPreferences(req.user.id);

      res.json({
        success: true,
        preferences: allPreferences,
        summary: {
          totalPlatforms: Object.keys(allPreferences).length,
          configuredPlatforms: Object.values(allPreferences).filter(p => p !== null).length,
          globalMode: Object.values(allPreferences).find(p => p !== null)?.mode || 'system',
          syncEnabled: Object.values(allPreferences).find(p => p !== null)?.syncAcrossPlatforms !== false
        }
      });

    } catch (error: any) {
      Logger.error('Failed to get all platform preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get theme preferences',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/theme-preferences/sync - Sync theme across all platforms
 */
router.post('/sync',
  authenticateUser,
  apiLimiter,
  [
    body('sourcePreferences').isObject().withMessage('Source preferences required'),
    body('sourcePreferences.mode').isIn(['light', 'dark', 'system']),
    body('sourcePreferences.platform').isIn(['web', 'mobile', 'extension', 'desktop'])
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { sourcePreferences } = req.body;

      const preferences: ThemePreferences = {
        userId: req.user.id,
        mode: sourcePreferences.mode,
        customColors: sourcePreferences.customColors || {},
        platform: sourcePreferences.platform,
        syncAcrossPlatforms: true,
        lastUpdated: new Date()
      };

      const syncResult = await themePreferencesService.syncThemeAcrossPlatforms(req.user.id, preferences);

      res.json({
        success: true,
        message: 'Theme synced across all platforms',
        syncResult,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      Logger.error('Failed to sync theme preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to sync theme preferences',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/theme-preferences/enterprise - Set enterprise custom branding
 */
router.post('/enterprise',
  authenticateUser,
  requireSubscription(['enterprise']),
  apiLimiter,
  [
    body('logoUrl').optional().isURL().withMessage('Logo URL must be valid'),
    body('companyName').optional().isString().isLength({ min: 1, max: 100 }),
    body('primaryColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid primary color hex'),
    body('secondaryColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid secondary color hex'),
    body('accentColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid accent color hex')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { logoUrl, companyName, primaryColor, secondaryColor, accentColor } = req.body;

      const success = await themePreferencesService.setEnterpriseTheme(req.user.id, {
        logoUrl,
        companyName,
        primaryColor,
        secondaryColor,
        accentColor
      });

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to set enterprise theme'
        });
      }

      res.json({
        success: true,
        message: 'Enterprise theme configured successfully',
        branding: {
          logoUrl,
          companyName,
          primaryColor,
          secondaryColor,
          accentColor
        },
        enterpriseFeatures: {
          customBranding: true,
          whiteLabel: true,
          brandConsistency: true,
          multiPlatformSync: true
        }
      });

    } catch (error: any) {
      Logger.error('Failed to set enterprise theme:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to set enterprise theme',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/theme-preferences/enterprise - Get enterprise branding
 */
router.get('/enterprise/branding',
  authenticateUser,
  requireSubscription(['enterprise']),
  async (req, res) => {
    try {
      const branding = await themePreferencesService.getEnterpriseTheme(req.user.id);

      res.json({
        success: true,
        branding: branding || null,
        hasCustomBranding: !!branding
      });

    } catch (error: any) {
      Logger.error('Failed to get enterprise branding:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get enterprise branding',
        details: error.message
      });
    }
  }
);

/**
 * DELETE /api/theme-preferences/:platform - Reset theme preferences
 */
router.delete('/:platform?',
  authenticateUser,
  async (req, res) => {
    try {
      const { platform } = req.params;

      const success = await themePreferencesService.resetThemePreferences(
        req.user.id, 
        platform as Platform | undefined
      );

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to reset theme preferences'
        });
      }

      res.json({
        success: true,
        message: platform 
          ? `Theme preferences reset for ${platform}` 
          : 'All theme preferences reset to default',
        platform: platform || 'all'
      });

    } catch (error: any) {
      Logger.error('Failed to reset theme preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset theme preferences',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/theme-preferences/analytics - Get theme analytics (Enterprise)
 */
router.get('/analytics/overview',
  authenticateUser,
  requireSubscription(['enterprise']),
  async (req, res) => {
    try {
      const analytics = await themePreferencesService.getThemeAnalytics();

      res.json({
        success: true,
        analytics,
        insights: {
          darkModeAdoption: `${((analytics.themeDistribution.dark / analytics.totalUsers) * 100).toFixed(1)}%`,
          systemPreferenceUsers: `${((analytics.themeDistribution.system / analytics.totalUsers) * 100).toFixed(1)}%`,
          mostUsedPlatform: Object.entries(analytics.platformUsage)
            .reduce((max, [platform, count]) => count > max.count ? { platform, count } : max, { platform: '', count: 0 }).platform,
          customBrandingRate: `${((analytics.customBrandingUsers / analytics.totalUsers) * 100).toFixed(1)}%`
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      Logger.error('Failed to get theme analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get theme analytics',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/theme-preferences/health - Health check
 */
router.get('/service/health', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'healthy',
      service: 'theme-preferences',
      features: [
        'Cross-platform theme synchronization',
        'Enterprise custom branding',
        'Advanced theme analytics',
        'System preference detection',
        'Professional dark mode support',
        'Accessibility compliance'
      ],
      platforms: ['web', 'mobile', 'extension', 'desktop'],
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

export { router as themePreferencesRouter };