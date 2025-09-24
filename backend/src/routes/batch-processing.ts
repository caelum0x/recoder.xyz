/**
 * Batch Processing API Routes
 * Cost optimization through intelligent request batching
 */

import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { batchProcessor } from '../services/batch-processor';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * @swagger
 * /api/batch/submit:
 *   post:
 *     summary: Submit a request for batch processing
 *     tags: [Batch Processing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [ai_generation, code_analysis, compilation, validation]
 *                 description: Type of processing request
 *               prompt:
 *                 type: string
 *                 description: The main content to process
 *               parameters:
 *                 type: object
 *                 description: Additional parameters for processing
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high]
 *                 default: normal
 *               maxWaitTime:
 *                 type: number
 *                 description: Maximum time to wait for batching (ms)
 *               similarityThreshold:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 description: How similar requests need to be for batching
 *     responses:
 *       200:
 *         description: Request submitted for batch processing
 *       400:
 *         description: Invalid request parameters
 */
router.post('/submit', authenticate, [
  body('type').isIn(['ai_generation', 'code_analysis', 'compilation', 'validation'])
    .withMessage('Type must be one of: ai_generation, code_analysis, compilation, validation'),
  body('prompt').isString().isLength({ min: 1, max: 10000 })
    .withMessage('Prompt must be a string between 1 and 10000 characters'),
  body('parameters').optional().isObject()
    .withMessage('Parameters must be an object'),
  body('priority').optional().isIn(['low', 'normal', 'high'])
    .withMessage('Priority must be one of: low, normal, high'),
  body('maxWaitTime').optional().isInt({ min: 1000, max: 300000 })
    .withMessage('Max wait time must be between 1000 and 300000 milliseconds'),
  body('similarityThreshold').optional().isFloat({ min: 0, max: 1 })
    .withMessage('Similarity threshold must be between 0 and 1')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { type, prompt, parameters = {}, priority = 'normal', maxWaitTime, similarityThreshold } = req.body;
    const userId = req.user.id;

    // Submit request for batch processing
    const requestId = await batchProcessor.addRequest({
      userId,
      type,
      prompt,
      parameters,
      priority,
      maxWaitTime,
      similarityThreshold
    });

    logger.info(`Batch request submitted`, {
      requestId,
      userId,
      type,
      priority,
      promptLength: prompt.length
    });

    res.json({
      success: true,
      data: {
        requestId,
        status: 'submitted',
        estimatedProcessingTime: maxWaitTime || 30000,
        message: 'Request submitted for batch processing'
      }
    });

  } catch (error) {
    logger.error('Failed to submit batch request:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/batch/status/{requestId}:
 *   get:
 *     summary: Get status of a batch request
 *     tags: [Batch Processing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch request ID
 *     responses:
 *       200:
 *         description: Request status retrieved
 *       404:
 *         description: Request not found
 */
router.get('/status/:requestId', authenticate, async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    // Get request status from database
    const request = await req.app.locals.prisma.batchRequest.findFirst({
      where: {
        id: requestId,
        userId
      },
      include: {
        batchExecution: true
      }
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Batch request not found',
          code: 'REQUEST_NOT_FOUND'
        }
      });
    }

    const response = {
      requestId: request.id,
      status: request.status,
      type: request.type,
      priority: request.priority,
      submittedAt: request.timestamp,
      batchInfo: request.batchExecution ? {
        batchId: request.batchExecution.id,
        requestCount: request.batchExecution.requestCount,
        processingTime: request.batchExecution.processingTime,
        costSavings: request.batchExecution.costSavings,
        completedAt: request.batchExecution.completedAt
      } : null
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    logger.error('Failed to get batch request status:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/batch/statistics:
 *   get:
 *     summary: Get batch processing statistics
 *     tags: [Batch Processing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, all]
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics', authenticate, [
  query('period').optional().isIn(['today', 'week', 'month', 'all'])
    .withMessage('Period must be one of: today, week, month, all')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { period = 'month' } = req.query;
    const userId = req.user.id;

    // Calculate date range based on period
    let startDate: Date | undefined;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = undefined;
        break;
    }

    const whereClause = {
      userId,
      ...(startDate && { timestamp: { gte: startDate } })
    };

    // Get user-specific statistics
    const [requestStats, batchStats] = await Promise.all([
      req.app.locals.prisma.batchRequest.groupBy({
        by: ['type', 'status'],
        where: whereClause,
        _count: { id: true }
      }),
      req.app.locals.prisma.batchRequest.findMany({
        where: {
          ...whereClause,
          batchExecution: { isNot: null }
        },
        include: {
          batchExecution: {
            select: {
              processingTime: true,
              costSavings: true,
              requestCount: true
            }
          }
        }
      })
    ]);

    // Calculate aggregated statistics
    const totalRequests = requestStats.reduce((sum, stat) => sum + stat._count.id, 0);
    const completedRequests = requestStats
      .filter(stat => stat.status === 'completed')
      .reduce((sum, stat) => sum + stat._count.id, 0);
    
    const averageProcessingTime = batchStats.length > 0
      ? batchStats.reduce((sum, req) => sum + (req.batchExecution?.processingTime || 0), 0) / batchStats.length
      : 0;

    const averageCostSavings = batchStats.length > 0
      ? batchStats.reduce((sum, req) => sum + (req.batchExecution?.costSavings || 0), 0) / batchStats.length
      : 0;

    const typeBreakdown = requestStats.reduce((acc, stat) => {
      acc[stat.type] = (acc[stat.type] || 0) + stat._count.id;
      return acc;
    }, {} as Record<string, number>);

    const statusBreakdown = requestStats.reduce((acc, stat) => {
      acc[stat.status] = (acc[stat.status] || 0) + stat._count.id;
      return acc;
    }, {} as Record<string, number>);

    // Get global batch processor statistics
    const globalStats = await batchProcessor.getStatistics();

    res.json({
      success: true,
      data: {
        period,
        userStatistics: {
          totalRequests,
          completedRequests,
          successRate: totalRequests > 0 ? completedRequests / totalRequests : 0,
          averageProcessingTime: Math.round(averageProcessingTime),
          averageCostSavings: Math.round(averageCostSavings * 100) / 100,
          typeBreakdown,
          statusBreakdown
        },
        globalStatistics: globalStats
      }
    });

  } catch (error) {
    logger.error('Failed to get batch statistics:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/batch/config:
 *   get:
 *     summary: Get batch processing configuration
 *     tags: [Batch Processing]
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 */
router.get('/config', async (req, res, next) => {
  try {
    const config = {
      supportedTypes: ['ai_generation', 'code_analysis', 'compilation', 'validation'],
      priorities: ['low', 'normal', 'high'],
      defaultMaxWaitTime: 30000,
      maxWaitTime: 300000,
      minWaitTime: 1000,
      defaultSimilarityThreshold: 0.7,
      maxPromptLength: 10000,
      batchProcessingInterval: 5000,
      minBatchSize: 3,
      maxBatchSize: 20,
      costSavingsRange: {
        min: 0.1,
        max: 0.5,
        description: 'Batching saves 10-50% on API costs depending on batch size'
      }
    };

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    logger.error('Failed to get batch config:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/batch/recent:
 *   get:
 *     summary: Get recent batch requests for user
 *     tags: [Batch Processing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of requests to return
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by request type
 *     responses:
 *       200:
 *         description: Recent requests retrieved successfully
 */
router.get('/recent', authenticate, [
  query('limit').optional().isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['ai_generation', 'code_analysis', 'compilation', 'validation'])
    .withMessage('Type must be one of the supported types')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { limit = 20, type } = req.query;
    const userId = req.user.id;

    const recentRequests = await req.app.locals.prisma.batchRequest.findMany({
      where: {
        userId,
        ...(type && { type: type as string })
      },
      include: {
        batchExecution: {
          select: {
            id: true,
            requestCount: true,
            processingTime: true,
            costSavings: true,
            status: true,
            completedAt: true
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: parseInt(limit as string)
    });

    const formattedRequests = recentRequests.map(request => ({
      id: request.id,
      type: request.type,
      priority: request.priority,
      status: request.status,
      promptPreview: request.prompt.substring(0, 100) + (request.prompt.length > 100 ? '...' : ''),
      submittedAt: request.timestamp,
      processingTime: request.batchExecution?.processingTime,
      costSavings: request.batchExecution?.costSavings,
      batchSize: request.batchExecution?.requestCount,
      completedAt: request.batchExecution?.completedAt
    }));

    res.json({
      success: true,
      data: {
        requests: formattedRequests,
        total: recentRequests.length
      }
    });

  } catch (error) {
    logger.error('Failed to get recent batch requests:', error);
    next(error);
  }
});

export default router;

// CommonJS compatibility
module.exports = router;