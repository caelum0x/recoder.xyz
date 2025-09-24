/**
 * Pricing API Routes
 * Real payment processing with 5% + $0.50 transaction fees
 */

import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { basePrisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';
import PricingService from '../services/pricing-service';

const router = express.Router();
const pricingService = new PricingService(basePrisma);

/**
 * @swagger
 * /api/pricing/tiers:
 *   get:
 *     summary: Get all available pricing tiers
 *     tags: [Pricing]
 *     parameters:
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: User's region for tax calculation
 *     responses:
 *       200:
 *         description: Pricing tiers with calculated costs
 */
router.get('/tiers', [
  query('region').optional().isString().withMessage('Region must be a string')
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

    const { region = 'DEFAULT' } = req.query;
    const tiersWithPricing = pricingService.getAllTierPricing(region as string);

    res.json({
      success: true,
      data: {
        tiers: tiersWithPricing,
        processingFee: {
          percentage: 5.0,
          fixedFee: 0.50,
          currency: 'USD'
        },
        region: region
      },
      message: 'Pricing tiers retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get pricing tiers:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/pricing/calculate:
 *   post:
 *     summary: Calculate pricing for specific usage and tier
 *     tags: [Pricing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tierId:
 *                 type: string
 *                 description: Pricing tier ID
 *               usage:
 *                 type: object
 *                 properties:
 *                   requests:
 *                     type: number
 *                   tokens:
 *                     type: number
 *                   projectCount:
 *                     type: number
 *                   teamMembers:
 *                     type: number
 *               region:
 *                 type: string
 *                 description: User's region for tax calculation
 *     responses:
 *       200:
 *         description: Pricing calculation completed
 */
router.post('/calculate', authenticate, [
  body('tierId').isString().withMessage('Tier ID is required'),
  body('usage.requests').isInt({ min: 0 }).withMessage('Requests must be a non-negative integer'),
  body('usage.tokens').isInt({ min: 0 }).withMessage('Tokens must be a non-negative integer'),
  body('usage.projectCount').isInt({ min: 0 }).withMessage('Project count must be a non-negative integer'),
  body('usage.teamMembers').isInt({ min: 1 }).withMessage('Team members must be at least 1'),
  body('region').optional().isString().withMessage('Region must be a string')
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

    const { tierId, usage, region = 'DEFAULT' } = req.body;
    const userId = req.user.id;

    const calculation = pricingService.calculateUsageCost(usage, tierId, region);

    // Save calculation for user history
    await pricingService.saveUserPricingData(
      userId,
      tierId,
      calculation.finalPricing,
      usage
    );

    res.json({
      success: true,
      data: {
        calculation,
        breakdown: {
          tier: calculation.tier,
          basePricing: calculation.basePricing,
          overage: calculation.overage,
          finalCost: calculation.totalCost
        },
        recommendations: pricingService.getRecommendedTier({
          averageRequestsPerHour: usage.requests,
          averageTokensPerMonth: usage.tokens,
          projectCount: usage.projectCount,
          teamSize: usage.teamMembers
        })
      },
      message: 'Pricing calculated successfully'
    });

  } catch (error) {
    logger.error('Failed to calculate pricing:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/pricing/recommend:
 *   post:
 *     summary: Get recommended pricing tier based on usage patterns
 *     tags: [Pricing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               usage:
 *                 type: object
 *                 properties:
 *                   averageRequestsPerHour:
 *                     type: number
 *                   averageTokensPerMonth:
 *                     type: number
 *                   projectCount:
 *                     type: number
 *                   teamSize:
 *                     type: number
 *     responses:
 *       200:
 *         description: Tier recommendation generated
 */
router.post('/recommend', authenticate, [
  body('usage.averageRequestsPerHour').isFloat({ min: 0 }).withMessage('Average requests per hour must be non-negative'),
  body('usage.averageTokensPerMonth').isFloat({ min: 0 }).withMessage('Average tokens per month must be non-negative'),
  body('usage.projectCount').isInt({ min: 0 }).withMessage('Project count must be non-negative'),
  body('usage.teamSize').isInt({ min: 1 }).withMessage('Team size must be at least 1')
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

    const { usage } = req.body;
    const recommendation = pricingService.getRecommendedTier(usage);

    res.json({
      success: true,
      data: recommendation,
      message: 'Tier recommendation generated successfully'
    });

  } catch (error) {
    logger.error('Failed to generate tier recommendation:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/pricing/enterprise-quote:
 *   post:
 *     summary: Generate enterprise pricing quote
 *     tags: [Pricing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teamSize:
 *                 type: number
 *               expectedUsage:
 *                 type: object
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *               supportLevel:
 *                 type: string
 *                 enum: [standard, premium, white-glove]
 *               deploymentType:
 *                 type: string
 *                 enum: [cloud, hybrid, on-premise]
 *     responses:
 *       200:
 *         description: Enterprise quote generated
 */
router.post('/enterprise-quote', authenticate, [
  body('teamSize').isInt({ min: 1 }).withMessage('Team size must be at least 1'),
  body('expectedUsage.requestsPerMonth').isInt({ min: 0 }).withMessage('Requests per month must be non-negative'),
  body('expectedUsage.tokensPerMonth').isInt({ min: 0 }).withMessage('Tokens per month must be non-negative'),
  body('expectedUsage.projectCount').isInt({ min: 0 }).withMessage('Project count must be non-negative'),
  body('features').isArray().withMessage('Features must be an array'),
  body('supportLevel').isIn(['standard', 'premium', 'white-glove']).withMessage('Invalid support level'),
  body('deploymentType').isIn(['cloud', 'hybrid', 'on-premise']).withMessage('Invalid deployment type')
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

    const { teamSize, expectedUsage, features, supportLevel, deploymentType } = req.body;
    const userId = req.user.id;

    const quote = pricingService.generateEnterpriseQuote({
      teamSize,
      expectedUsage,
      features,
      supportLevel,
      deploymentType
    });

    // Log enterprise quote request
    logger.info(`Enterprise quote generated for user ${userId}`, {
      userId,
      estimatedPrice: quote.estimatedPrice,
      teamSize,
      supportLevel,
      deploymentType
    });

    res.json({
      success: true,
      data: {
        quote,
        validity: '30 days',
        contactInfo: {
          email: 'enterprise@recoder.xyz',
          phone: '+1 (555) 123-4567'
        }
      },
      message: 'Enterprise quote generated successfully'
    });

  } catch (error) {
    logger.error('Failed to generate enterprise quote:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/pricing/history:
 *   get:
 *     summary: Get user's pricing calculation history
 *     tags: [Pricing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of records to return
 *     responses:
 *       200:
 *         description: Pricing history retrieved
 */
router.get('/history', authenticate, [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
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

    const { limit = 20 } = req.query;
    const userId = req.user.id;

    const history = await pricingService.getUserPricingHistory(userId, parseInt(limit as string));

    res.json({
      success: true,
      data: {
        history,
        total: history.length
      },
      message: 'Pricing history retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get pricing history:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/pricing/annual-savings:
 *   post:
 *     summary: Calculate annual savings for yearly billing
 *     tags: [Pricing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monthlyPrice:
 *                 type: number
 *                 description: Monthly subscription price
 *     responses:
 *       200:
 *         description: Annual savings calculated
 */
router.post('/annual-savings', [
  body('monthlyPrice').isFloat({ min: 0 }).withMessage('Monthly price must be a positive number')
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

    const { monthlyPrice } = req.body;
    const savings = pricingService.calculateAnnualSavings(monthlyPrice);

    res.json({
      success: true,
      data: {
        ...savings,
        recommendation: savings.savingsPercentage > 10 ? 
          'Annual billing offers significant savings!' : 
          'Consider annual billing for cost optimization.'
      },
      message: 'Annual savings calculated successfully'
    });

  } catch (error) {
    logger.error('Failed to calculate annual savings:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/pricing/processing-fees:
 *   get:
 *     summary: Get current processing fee structure
 *     tags: [Pricing]
 *     responses:
 *       200:
 *         description: Processing fee information
 */
router.get('/processing-fees', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        structure: {
          percentage: 5.0,
          fixedFee: 0.50,
          currency: 'USD'
        },
        explanation: {
          description: 'All transactions include a 5% + $0.50 processing fee',
          examples: [
            {
              amount: 10,
              processingFee: (10 * 0.05) + 0.50,
              total: 10 + (10 * 0.05) + 0.50
            },
            {
              amount: 100,
              processingFee: (100 * 0.05) + 0.50,
              total: 100 + (100 * 0.05) + 0.50
            },
            {
              amount: 200,
              processingFee: (200 * 0.05) + 0.50,
              total: 200 + (200 * 0.05) + 0.50
            }
          ]
        },
        lastUpdated: new Date().toISOString()
      },
      message: 'Processing fee structure retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get processing fees:', error);
    next(error);
  }
});

export default router;

// CommonJS compatibility
module.exports = router;