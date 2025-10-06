/**
 * Unified SSO Routes
 * Cross-platform authentication endpoints for all 5 Recoder platforms
 */

import { Router, Request, Response } from 'express';
import { body, query } from 'express-validator';
import { unifiedSSO } from '../services/unified-sso';
import { authRateLimit, handleAuthValidationErrors } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route POST /api/sso/login
 * @desc Unified login for all platforms
 * @access Public
 */
router.post('/login',
  authRateLimit,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .isLength({ min: 6, max: 128 })
      .withMessage('Password must be between 6 and 128 characters'),
    body('platform')
      .isIn(['web', 'chat', 'cli', 'desktop', 'mobile'])
      .withMessage('Invalid platform'),
    body('deviceInfo')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Device info must be a string under 500 characters')
  ],
  handleAuthValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, platform, deviceInfo } = req.body;

      const result = await unifiedSSO.authenticateUser(email, password, platform, deviceInfo);

      if (!result.success) {
        res.status(401).json({
          success: false,
          error: result.error,
          code: 'SSO_LOGIN_FAILED'
        });
        return;
      }

      // Set secure HTTP-only cookie for web platforms
      if (platform === 'web' || platform === 'chat') {
        res.cookie('sso_refresh_token', result.tokens!.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }

      res.json({
        success: true,
        message: 'Authentication successful',
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens!.accessToken,
            sessionId: result.tokens!.sessionId,
            expiresIn: result.tokens!.expiresIn,
            platforms: result.tokens!.platforms,
            // Only return refresh token for CLI/Desktop/Mobile
            ...(platform !== 'web' && platform !== 'chat' && {
              refreshToken: result.tokens!.refreshToken
            })
          }
        }
      });

    } catch (error: any) {
      logger.error('SSO login error', {
        error: error.message,
        platform: req.body.platform,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Authentication failed',
        code: 'SSO_LOGIN_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/sso/refresh
 * @desc Refresh tokens across all platforms
 * @access Public
 */
router.post('/refresh',
  [
    body('refreshToken')
      .optional()
      .isString()
      .withMessage('Refresh token must be a string'),
    body('platform')
      .isIn(['web', 'chat', 'cli', 'desktop', 'mobile'])
      .withMessage('Invalid platform')
  ],
  handleAuthValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { platform } = req.body;
      let { refreshToken } = req.body;

      // For web/chat, try to get refresh token from HTTP-only cookie
      if (!refreshToken && (platform === 'web' || platform === 'chat')) {
        refreshToken = req.cookies.sso_refresh_token;
      }

      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: 'Refresh token required',
          code: 'MISSING_REFRESH_TOKEN'
        });
        return;
      }

      const result = await unifiedSSO.refreshTokens(refreshToken);

      if (!result.success) {
        // Clear invalid cookie
        if (platform === 'web' || platform === 'chat') {
          res.clearCookie('sso_refresh_token');
        }

        res.status(401).json({
          success: false,
          error: result.error,
          code: 'SSO_REFRESH_FAILED'
        });
        return;
      }

      // Update HTTP-only cookie for web platforms
      if (platform === 'web' || platform === 'chat') {
        res.cookie('sso_refresh_token', result.tokens!.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
      }

      res.json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: {
          user: result.user,
          tokens: {
            accessToken: result.tokens!.accessToken,
            sessionId: result.tokens!.sessionId,
            expiresIn: result.tokens!.expiresIn,
            platforms: result.tokens!.platforms,
            // Only return refresh token for CLI/Desktop/Mobile
            ...(platform !== 'web' && platform !== 'chat' && {
              refreshToken: result.tokens!.refreshToken
            })
          }
        }
      });

    } catch (error: any) {
      logger.error('SSO refresh error', {
        error: error.message,
        platform: req.body.platform,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Token refresh failed',
        code: 'SSO_REFRESH_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/sso/validate
 * @desc Validate token across all platforms
 * @access Public
 */
router.post('/validate',
  [
    body('token')
      .isString()
      .withMessage('Token is required'),
    body('platform')
      .optional()
      .isIn(['web', 'chat', 'cli', 'desktop', 'mobile'])
      .withMessage('Invalid platform')
  ],
  handleAuthValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, platform } = req.body;

      const result = await unifiedSSO.validateToken(token);

      if (!result.success) {
        res.status(401).json({
          success: false,
          error: result.error,
          code: 'SSO_VALIDATION_FAILED'
        });
        return;
      }

      // Check if user has access to the requested platform
      if (platform && !result.platformAccess?.includes(platform)) {
        res.status(403).json({
          success: false,
          error: 'Platform access denied',
          code: 'SSO_PLATFORM_ACCESS_DENIED'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Token is valid',
        data: {
          user: result.user,
          platformAccess: result.platformAccess,
          validForPlatforms: result.platformAccess
        }
      });

    } catch (error: any) {
      logger.error('SSO validation error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Token validation failed',
        code: 'SSO_VALIDATION_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/sso/device/start
 * @desc Start device flow for CLI authentication
 * @access Public
 */
router.post('/device/start',
  authRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await unifiedSSO.startDeviceFlow();

      res.json({
        success: true,
        message: 'Device flow started',
        data: result
      });

    } catch (error: any) {
      logger.error('Device flow start error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Failed to start device flow',
        code: 'DEVICE_FLOW_START_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/sso/device/authorize
 * @desc Authorize device with user credentials
 * @access Public (but requires user authentication)
 */
router.post('/device/authorize',
  [
    body('userCode')
      .isString()
      .isLength({ min: 6, max: 12 })
      .withMessage('Invalid user code format'),
    body('userId')
      .isString()
      .withMessage('User ID is required')
  ],
  handleAuthValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userCode, userId } = req.body;

      const result = await unifiedSSO.authorizeDevice(userCode, userId);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error,
          code: 'DEVICE_AUTHORIZATION_FAILED'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Device authorized successfully'
      });

    } catch (error: any) {
      logger.error('Device authorization error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Device authorization failed',
        code: 'DEVICE_AUTHORIZATION_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/sso/device/poll
 * @desc Poll for device flow completion
 * @access Public
 */
router.post('/device/poll',
  [
    body('deviceCode')
      .isString()
      .withMessage('Device code is required')
  ],
  handleAuthValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { deviceCode } = req.body;

      const result = await unifiedSSO.completeDeviceFlow(deviceCode);

      if (!result.success) {
        if (result.error === 'Device not authorized yet') {
          res.status(202).json({
            success: false,
            error: result.error,
            code: 'DEVICE_PENDING_AUTHORIZATION'
          });
          return;
        }

        res.status(400).json({
          success: false,
          error: result.error,
          code: 'DEVICE_FLOW_FAILED'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Device flow completed',
        data: {
          user: result.user,
          tokens: result.tokens
        }
      });

    } catch (error: any) {
      logger.error('Device flow poll error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Device flow polling failed',
        code: 'DEVICE_FLOW_POLL_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/sso/logout
 * @desc Logout from all platforms
 * @access Public
 */
router.post('/logout',
  [
    body('sessionId')
      .optional()
      .isString()
      .withMessage('Session ID must be a string'),
    body('platform')
      .isIn(['web', 'chat', 'cli', 'desktop', 'mobile'])
      .withMessage('Invalid platform')
  ],
  handleAuthValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, platform } = req.body;

      if (sessionId) {
        await unifiedSSO.logoutFromAllPlatforms(sessionId);
      }

      // Clear HTTP-only cookie for web platforms
      if (platform === 'web' || platform === 'chat') {
        res.clearCookie('sso_refresh_token');
      }

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error: any) {
      logger.error('SSO logout error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Logout failed',
        code: 'SSO_LOGOUT_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/sso/platforms
 * @desc Get available platforms for user
 * @access Protected
 */
router.get('/platforms',
  [
    query('token')
      .isString()
      .withMessage('Access token is required')
  ],
  handleAuthValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const token = req.query.token as string;

      const result = await unifiedSSO.validateToken(token);

      if (!result.success) {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'SSO_INVALID_TOKEN'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Platform access retrieved',
        data: {
          platforms: result.user!.platforms,
          availablePlatforms: result.platformAccess,
          subscriptionTier: result.user!.subscriptionTier,
          quotas: result.user!.quotas
        }
      });

    } catch (error: any) {
      logger.error('Get platforms error', {
        error: error.message,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get platform access',
        code: 'SSO_PLATFORMS_ERROR'
      });
    }
  }
);

module.exports = router;