import express, { Request, Response } from 'express';
import * as premiumService from '../services/premium.service';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/premium/status
 * Get user's premium status and subscription details
 */
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const status = await premiumService.getPremiumStatus(userId);

    res.json(status);
  } catch (error) {
    console.error('Get premium status error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get premium status'
    });
  }
});

/**
 * POST /api/premium/api-key
 * Generate a new API key
 */
router.post('/api-key', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, permissions } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'API key name is required'
      });
    }

    const apiKey = await premiumService.generateUserApiKey(userId, name, permissions);

    res.json({
      success: true,
      apiKey
    });
  } catch (error) {
    console.error('Generate API key error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate API key';
    res.status(400).json({
      error: 'generation_failed',
      message
    });
  }
});

/**
 * GET /api/premium/api-keys
 * List user's API keys
 */
router.get('/api-keys', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const apiKeys = await premiumService.listUserApiKeys(userId);

    res.json({ apiKeys });
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to list API keys'
    });
  }
});

/**
 * PUT /api/premium/api-key/:keyId/revoke
 * Revoke an API key
 */
router.put('/api-key/:keyId/revoke', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { keyId } = req.params;

    await premiumService.revokeApiKey(keyId, userId);

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    console.error('Revoke API key error:', error);
    const message = error instanceof Error ? error.message : 'Failed to revoke API key';
    res.status(400).json({
      error: 'revoke_failed',
      message
    });
  }
});

/**
 * DELETE /api/premium/api-key/:keyId
 * Delete an API key
 */
router.delete('/api-key/:keyId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { keyId } = req.params;

    await premiumService.deleteApiKey(keyId, userId);

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete API key';
    res.status(400).json({
      error: 'delete_failed',
      message
    });
  }
});

/**
 * GET /api/premium/feature/:feature
 * Check if user has access to a specific feature
 */
router.get('/feature/:feature', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { feature } = req.params;

    const hasAccess = await premiumService.checkFeatureAccess(userId, feature);

    res.json({ hasAccess, feature });
  } catch (error) {
    console.error('Check feature access error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to check feature access'
    });
  }
});

/**
 * GET /api/premium/rate-limit
 * Check user's rate limit status
 */
router.get('/rate-limit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const rateLimit = await premiumService.checkRateLimit(userId);

    res.json(rateLimit);
  } catch (error) {
    console.error('Check rate limit error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to check rate limit'
    });
  }
});

/**
 * GET /api/premium/models
 * Get available AI models for user
 */
router.get('/models', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const models = await premiumService.getAvailableModels(userId);

    res.json({ models });
  } catch (error) {
    console.error('Get available models error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get available models'
    });
  }
});

/**
 * POST /api/premium/upgrade
 * Upgrade subscription
 */
router.post('/upgrade', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Plan ID is required'
      });
    }

    await premiumService.upgradeSubscription(userId, planId);

    res.json({
      success: true,
      message: 'Subscription upgraded successfully'
    });
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upgrade subscription';
    res.status(400).json({
      error: 'upgrade_failed',
      message
    });
  }
});

export default router;
