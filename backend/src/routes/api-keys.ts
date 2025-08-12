// API Keys Management Routes
// CRUD operations for developer API keys

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticateUser, requireSubscription } from '../middleware/auth';
import { ApiKeyService } from '../models/api-key';
import { getRateLimitStatus } from '../middleware/rate-limit';
import { logger } from '../utils/logger';

const router = express.Router();

// Validation middleware
const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /api/keys
 * List all API keys for authenticated user
 */
router.get('/',
  authenticateUser,
  async (req, res) => {
    try {
      const apiKeys = await ApiKeyService.listApiKeys(req.user.id);
      
      res.json({
        success: true,
        apiKeys: apiKeys.map(key => ({
          ...key,
          keyDisplay: key.keyPrefix + '...' + '*'.repeat(20) // Mask the key
        }))
      });
      
    } catch (error) {
      logger.error('Failed to list API keys', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to list API keys'
      });
    }
  }
);

/**
 * POST /api/keys
 * Generate a new API key
 */
router.post('/',
  authenticateUser,
  [
    body('name')
      .notEmpty()
      .withMessage('API key name is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters'),
    body('permissions')
      .optional()
      .isArray()
      .withMessage('Permissions must be an array'),
    body('permissions.*')
      .isIn(['read', 'write', 'admin'])
      .withMessage('Invalid permission'),
    body('expiresIn')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Expiration must be between 1 and 365 days')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { name, permissions = ['read'], expiresIn } = req.body;
      
      // Check if user has reached API key limit
      const existingKeys = await ApiKeyService.listApiKeys(req.user.id);
      const activeKeys = existingKeys.filter(key => key.isActive);
      
      // Set limits based on subscription
      const keyLimits = {
        free: 2,
        weekly: 5,
        monthly: 10,
        enterprise: 50
      };
      
      const userPlan = req.user.subscriptionPlan || 'free';
      const maxKeys = keyLimits[userPlan as keyof typeof keyLimits] || keyLimits.free;
      
      if (activeKeys.length >= maxKeys) {
        return res.status(400).json({
          success: false,
          error: `Maximum API keys limit reached (${maxKeys} keys for ${userPlan} plan)`,
          code: 'API_KEY_LIMIT_EXCEEDED',
          upgrade: userPlan === 'free' ? '/pricing' : null
        });
      }
      
      const { key, apiKey } = await ApiKeyService.generateApiKey(
        req.user.id,
        name,
        permissions,
        expiresIn
      );
      
      res.status(201).json({
        success: true,
        message: 'API key generated successfully',
        apiKey: {
          ...apiKey,
          keyDisplay: key.substring(0, 12) + '...' + '*'.repeat(20)
        },
        key: key, // Only returned once during creation
        warning: 'Store this key securely. It will not be shown again.'
      });
      
    } catch (error) {
      logger.error('Failed to generate API key', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to generate API key'
      });
    }
  }
);

/**
 * GET /api/keys/:keyId
 * Get specific API key details
 */
router.get('/:keyId',
  authenticateUser,
  [param('keyId').isUUID().withMessage('Invalid key ID')],
  validateRequest,
  async (req, res) => {
    try {
      const { keyId } = req.params;
      const apiKeys = await ApiKeyService.listApiKeys(req.user.id);
      const apiKey = apiKeys.find(key => key.id === keyId);
      
      if (!apiKey) {
        return res.status(404).json({
          success: false,
          error: 'API key not found'
        });
      }
      
      // Get usage statistics
      const usage = await ApiKeyService.getApiKeyUsage(keyId);
      
      res.json({
        success: true,
        apiKey: {
          ...apiKey,
          keyDisplay: apiKey.keyPrefix + '...' + '*'.repeat(20),
          usage
        }
      });
      
    } catch (error) {
      logger.error('Failed to get API key', {
        error: error.message,
        userId: req.user?.id,
        keyId: req.params.keyId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get API key'
      });
    }
  }
);

/**
 * PUT /api/keys/:keyId
 * Update API key settings
 */
router.put('/:keyId',
  authenticateUser,
  [
    param('keyId').isUUID().withMessage('Invalid key ID'),
    body('name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters'),
    body('permissions')
      .optional()
      .isArray()
      .withMessage('Permissions must be an array'),
    body('permissions.*')
      .isIn(['read', 'write', 'admin'])
      .withMessage('Invalid permission'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be boolean'),
    body('expiresAt')
      .optional()
      .isISO8601()
      .withMessage('Invalid expiration date')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { keyId } = req.params;
      const updates = req.body;
      
      // Validate ownership
      const apiKeys = await ApiKeyService.listApiKeys(req.user.id);
      const existingKey = apiKeys.find(key => key.id === keyId);
      
      if (!existingKey) {
        return res.status(404).json({
          success: false,
          error: 'API key not found'
        });
      }
      
      await ApiKeyService.updateApiKey(req.user.id, keyId, updates);
      
      res.json({
        success: true,
        message: 'API key updated successfully'
      });
      
    } catch (error) {
      logger.error('Failed to update API key', {
        error: error.message,
        userId: req.user?.id,
        keyId: req.params.keyId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to update API key'
      });
    }
  }
);

/**
 * DELETE /api/keys/:keyId
 * Revoke/delete API key
 */
router.delete('/:keyId',
  authenticateUser,
  [param('keyId').isUUID().withMessage('Invalid key ID')],
  validateRequest,
  async (req, res) => {
    try {
      const { keyId } = req.params;
      
      // Validate ownership
      const apiKeys = await ApiKeyService.listApiKeys(req.user.id);
      const existingKey = apiKeys.find(key => key.id === keyId);
      
      if (!existingKey) {
        return res.status(404).json({
          success: false,
          error: 'API key not found'
        });
      }
      
      await ApiKeyService.revokeApiKey(req.user.id, keyId);
      
      res.json({
        success: true,
        message: 'API key revoked successfully'
      });
      
    } catch (error) {
      logger.error('Failed to revoke API key', {
        error: error.message,
        userId: req.user?.id,
        keyId: req.params.keyId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to revoke API key'
      });
    }
  }
);

/**
 * GET /api/keys/:keyId/usage
 * Get API key usage statistics
 */
router.get('/:keyId/usage',
  authenticateUser,
  [
    param('keyId').isUUID().withMessage('Invalid key ID'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { keyId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Validate ownership
      const apiKeys = await ApiKeyService.listApiKeys(req.user.id);
      const existingKey = apiKeys.find(key => key.id === keyId);
      
      if (!existingKey) {
        return res.status(404).json({
          success: false,
          error: 'API key not found'
        });
      }
      
      const usage = await ApiKeyService.getApiKeyUsage(
        keyId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      res.json({
        success: true,
        usage,
        period: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Now'
        }
      });
      
    } catch (error) {
      logger.error('Failed to get API key usage', {
        error: error.message,
        userId: req.user?.id,
        keyId: req.params.keyId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get API key usage'
      });
    }
  }
);

/**
 * GET /api/keys/:keyId/rate-limit
 * Get current rate limit status for API key
 */
router.get('/:keyId/rate-limit',
  authenticateUser,
  [param('keyId').isUUID().withMessage('Invalid key ID')],
  validateRequest,
  async (req, res) => {
    try {
      const { keyId } = req.params;
      
      // Validate ownership
      const apiKeys = await ApiKeyService.listApiKeys(req.user.id);
      const existingKey = apiKeys.find(key => key.id === keyId);
      
      if (!existingKey) {
        return res.status(404).json({
          success: false,
          error: 'API key not found'
        });
      }
      
      // Set the API key in request to use existing rate limit middleware
      req.apiKey = {
        id: existingKey.id,
        userId: req.user.id,
        permissions: existingKey.permissions,
        rateLimit: existingKey.rateLimit
      };
      
      await getRateLimitStatus(req, res);
      
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        error: error.message,
        userId: req.user?.id,
        keyId: req.params.keyId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get rate limit status'
      });
    }
  }
);

/**
 * POST /api/keys/regenerate/:keyId
 * Regenerate API key (create new key, revoke old one)
 */
router.post('/regenerate/:keyId',
  authenticateUser,
  [param('keyId').isUUID().withMessage('Invalid key ID')],
  validateRequest,
  async (req, res) => {
    try {
      const { keyId } = req.params;
      
      // Validate ownership
      const apiKeys = await ApiKeyService.listApiKeys(req.user.id);
      const existingKey = apiKeys.find(key => key.id === keyId);
      
      if (!existingKey) {
        return res.status(404).json({
          success: false,
          error: 'API key not found'
        });
      }
      
      // Generate new key
      const { key, apiKey: newApiKey } = await ApiKeyService.generateApiKey(
        req.user.id,
        existingKey.name,
        existingKey.permissions,
        existingKey.expiresAt ? Math.ceil((new Date(existingKey.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : undefined
      );
      
      // Revoke old key
      await ApiKeyService.revokeApiKey(req.user.id, keyId);
      
      res.json({
        success: true,
        message: 'API key regenerated successfully',
        apiKey: {
          ...newApiKey,
          keyDisplay: key.substring(0, 12) + '...' + '*'.repeat(20)
        },
        key: key,
        warning: 'Store this new key securely. The old key has been revoked and this new key will not be shown again.'
      });
      
    } catch (error) {
      logger.error('Failed to regenerate API key', {
        error: error.message,
        userId: req.user?.id,
        keyId: req.params.keyId
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to regenerate API key'
      });
    }
  }
);

export default router;