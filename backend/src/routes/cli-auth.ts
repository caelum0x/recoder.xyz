import express, { Request, Response } from 'express';
import * as cliAuthService from '../services/cliAuth.service';
import { authenticateToken } from '../middleware/auth';
import { prisma } from '../database/prisma';

const router = express.Router();

/**
 * POST /api/auth/cli/authorize
 * Start CLI authorization flow
 */
router.post('/authorize', async (req: Request, res: Response) => {
  try {
    const { deviceInfo } = req.body;

    const result = await cliAuthService.startCliAuthorization(deviceInfo);

    res.json(result);
  } catch (error) {
    console.error('CLI authorization error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to start authorization flow'
    });
  }
});

/**
 * GET /api/auth/cli/token
 * Poll for authorization token
 */
router.get('/token', async (req: Request, res: Response) => {
  try {
    const { deviceCode } = req.query;

    if (!deviceCode || typeof deviceCode !== 'string') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Device code is required'
      });
    }

    const result = await cliAuthService.pollForToken(deviceCode);

    // Return appropriate status code based on result
    if (result.error) {
      if (result.error === 'invalid_grant') {
        return res.status(404).json(result);
      }
      if (result.error === 'expired_token') {
        return res.status(400).json(result);
      }
      if (result.error === 'access_denied') {
        return res.status(403).json(result);
      }
      return res.status(400).json(result);
    }

    if (result.status === 'pending') {
      return res.status(428).json(result); // 428 Precondition Required
    }

    res.json(result);
  } catch (error) {
    console.error('Token poll error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to check authorization status'
    });
  }
});

/**
 * POST /api/auth/cli/verify-code
 * Verify user code and get session details
 */
router.post('/verify-code', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userCode } = req.body;

    if (!userCode) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'User code is required'
      });
    }

    const session = await prisma.cLISession.findUnique({
      where: { userCode },
      select: {
        id: true,
        userCode: true,
        deviceInfo: true,
        createdAt: true,
        expiresAt: true,
        status: true,
        ipAddress: true
      }
    });

    if (!session) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Invalid user code'
      });
    }

    if (new Date() > session.expiresAt) {
      return res.status(400).json({
        error: 'expired',
        message: 'User code has expired'
      });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({
        error: 'already_processed',
        message: 'This code has already been processed'
      });
    }

    res.json({ session });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to verify code'
    });
  }
});

/**
 * POST /api/auth/cli/authorize-session
 * Authorize a CLI session
 */
router.post('/authorize-session', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userCode } = req.body;
    const userId = (req as any).user.id;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    if (!userCode) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'User code is required'
      });
    }

    const result = await cliAuthService.authorizeCliSession(
      userCode,
      userId,
      ipAddress,
      userAgent
    );

    res.json({
      success: true,
      message: 'CLI session authorized successfully'
    });
  } catch (error) {
    console.error('Authorize session error:', error);
    const message = error instanceof Error ? error.message : 'Failed to authorize session';
    res.status(400).json({
      error: 'authorization_failed',
      message
    });
  }
});

/**
 * POST /api/auth/cli/deny-session
 * Deny a CLI session
 */
router.post('/deny-session', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userCode } = req.body;

    if (!userCode) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'User code is required'
      });
    }

    await cliAuthService.denyCliSession(userCode);

    res.json({
      success: true,
      message: 'CLI session denied'
    });
  } catch (error) {
    console.error('Deny session error:', error);
    const message = error instanceof Error ? error.message : 'Failed to deny session';
    res.status(400).json({
      error: 'deny_failed',
      message
    });
  }
});

/**
 * GET /api/auth/cli/verify
 * Verify CLI token
 */
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        valid: false,
        error: 'missing_token',
        message: 'Authorization token is required'
      });
    }

    const token = authHeader.substring(7);
    const result = await cliAuthService.verifyCliSession(token);

    if (!result.valid) {
      return res.status(401).json(result);
    }

    // Get subscription limits
    const subscription = await prisma.subscription.findFirst({
      where: { userId: result.user?.id },
      include: {
        paymentMethod: true
      }
    });

    // Get usage stats for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayUsage = await prisma.cLIUsage.count({
      where: {
        userId: result.user?.id,
        timestamp: { gte: today }
      }
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthUsage = await prisma.cLIUsage.count({
      where: {
        userId: result.user?.id,
        timestamp: { gte: monthStart }
      }
    });

    res.json({
      valid: true,
      user: {
        id: result.user?.id,
        email: result.user?.email,
        name: result.user?.name,
        subscription: result.user?.subscription
      },
      subscription: {
        plan: result.user?.subscription || 'free',
        status: subscription?.status || 'active'
      },
      usage: {
        today: todayUsage,
        month: monthUsage
      },
      limits: {
        dailyRequests: result.user?.subscription === 'pro' ? 200 : 10,
        monthlyRequests: result.user?.subscription === 'pro' ? 5000 : 100
      }
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      valid: false,
      error: 'server_error',
      message: 'Failed to verify token'
    });
  }
});

/**
 * GET /api/auth/cli/sessions
 * List user's CLI sessions
 */
router.get('/sessions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const sessions = await cliAuthService.listCliSessions(userId);

    res.json({ sessions });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to list sessions'
    });
  }
});

/**
 * DELETE /api/auth/cli/session/:sessionId
 * Revoke a CLI session
 */
router.delete('/session/:sessionId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.id;

    await cliAuthService.revokeCliSession(sessionId, userId);

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    const message = error instanceof Error ? error.message : 'Failed to revoke session';
    res.status(400).json({
      error: 'revoke_failed',
      message
    });
  }
});

/**
 * DELETE /api/auth/cli/sessions/all
 * Revoke all CLI sessions
 */
router.delete('/sessions/all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    await cliAuthService.revokeAllCliSessions(userId);

    res.json({
      success: true,
      message: 'All sessions revoked successfully'
    });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({
      error: 'revoke_failed',
      message: 'Failed to revoke sessions'
    });
  }
});

/**
 * POST /api/auth/cli/track-usage
 * Track CLI usage (internal endpoint, requires CLI token)
 */
router.post('/track-usage', async (req: Request, res: Response) => {
  try {
    const authHeader = req.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required'
      });
    }

    const token = authHeader.substring(7);
    const verification = await cliAuthService.verifyCliSession(token);

    if (!verification.valid || !verification.session) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired token'
      });
    }

    const { requestType, model, provider, tokens, cost, duration, success, errorCode, errorMessage, metadata } = req.body;

    await cliAuthService.trackCliUsage({
      sessionId: verification.session.id,
      userId: verification.user!.id,
      requestType,
      model,
      provider,
      tokens,
      cost,
      duration,
      success,
      errorCode,
      errorMessage,
      metadata
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Track usage error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to track usage'
    });
  }
});

/**
 * GET /api/auth/cli/usage-stats
 * Get CLI usage statistics
 */
router.get('/usage-stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const days = parseInt(req.query.days as string) || 30;

    const stats = await cliAuthService.getCliUsageStats(userId, days);

    res.json(stats);
  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage statistics'
    });
  }
});

// Export for both ES6 and CommonJS compatibility
export default router;
module.exports = router;
