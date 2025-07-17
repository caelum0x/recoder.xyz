const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { PlannerService } = require('../services/plannerService');
const { RequirementAnalyzer } = require('../analyzers/requirementAnalyzer');
const { DependencyAnalyzer } = require('../analyzers/dependencyAnalyzer');
const { IntegrationAnalyzer } = require('../analyzers/integrationAnalyzer');
const { SecurityAnalyzer } = require('../analyzers/securityAnalyzer');
const { logger } = require('../utils/logger');

const router = express.Router();
const plannerService = new PlannerService();

/**
 * @swagger
 * /api/planner/create:
 *   post:
 *     summary: Create a comprehensive project plan
 *     tags: [Planning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 description: Project description or requirements
 *               options:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [web, mobile, blockchain, ai, fullstack]
 *                   interactive:
 *                     type: boolean
 *                   template:
 *                     type: string
 *                   validate:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Plan created successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post('/create', [
  body('description')
    .isString()
    .isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters'),
  body('options.type')
    .optional()
    .isIn(['web', 'mobile', 'blockchain', 'ai', 'fullstack'])
    .withMessage('Invalid project type'),
  body('options.interactive')
    .optional()
    .isBoolean()
    .withMessage('Interactive option must be boolean'),
  body('options.validate')
    .optional()
    .isBoolean()
    .withMessage('Validate option must be boolean')
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

    const { description, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Creating plan for user ${userId}`, { description, options });

    // Create comprehensive plan
    const plan = await plannerService.createComprehensivePlan(description, {
      ...options,
      userId
    });

    // Store plan in database
    const savedPlan = await plannerService.savePlan(plan, userId);

    res.json({
      success: true,
      data: savedPlan,
      message: 'Plan created successfully'
    });

  } catch (error) {
    logger.error('Plan creation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/planner/analyze:
 *   post:
 *     summary: Analyze project requirements
 *     tags: [Planning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               options:
 *                 type: object
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 */
router.post('/analyze', [
  body('description')
    .isString()
    .isLength({ min: 5 })
    .withMessage('Description must be at least 5 characters')
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

    const { description, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Analyzing requirements for user ${userId}`, { description });

    // Perform comprehensive analysis
    const requirementAnalyzer = new RequirementAnalyzer();
    const dependencyAnalyzer = new DependencyAnalyzer();
    const integrationAnalyzer = new IntegrationAnalyzer();
    const securityAnalyzer = new SecurityAnalyzer();

    const requirements = await requirementAnalyzer.analyze(description, options);
    const dependencies = await dependencyAnalyzer.analyze(requirements);
    const integrations = await integrationAnalyzer.analyze(requirements, dependencies);
    const security = await securityAnalyzer.analyze(requirements, integrations);

    const analysis = {
      requirements,
      dependencies,
      integrations,
      security,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: analysis,
      message: 'Analysis completed successfully'
    });

  } catch (error) {
    logger.error('Requirements analysis failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/planner/validate:
 *   post:
 *     summary: Validate a project plan
 *     tags: [Planning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan:
 *                 type: object
 *                 description: Plan configuration to validate
 *     responses:
 *       200:
 *         description: Validation completed successfully
 */
router.post('/validate', [
  body('plan')
    .isObject()
    .withMessage('Plan must be an object'),
  body('plan.name')
    .isString()
    .isLength({ min: 3 })
    .withMessage('Plan name must be at least 3 characters'),
  body('plan.type')
    .isIn(['web', 'mobile', 'blockchain', 'ai', 'fullstack'])
    .withMessage('Invalid project type')
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

    const { plan } = req.body;
    const userId = req.user.id;

    logger.info(`Validating plan for user ${userId}`, { planId: plan.id });

    const validationResults = await plannerService.validatePlan(plan);

    res.json({
      success: true,
      data: validationResults,
      message: 'Plan validation completed'
    });

  } catch (error) {
    logger.error('Plan validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/planner/templates:
 *   get:
 *     summary: Get planning templates
 *     tags: [Planning]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [web, mobile, blockchain, ai, fullstack]
 *         description: Filter by project type
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 */
router.get('/templates', [
  query('type')
    .optional()
    .isIn(['web', 'mobile', 'blockchain', 'ai', 'fullstack'])
    .withMessage('Invalid project type')
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

    const { type } = req.query;

    const templates = await plannerService.getTemplates(type);

    res.json({
      success: true,
      data: templates,
      message: 'Templates retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get templates:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/planner/plans:
 *   get:
 *     summary: Get user's plans
 *     tags: [Planning]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of plans to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of plans to skip
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by project type
 *     responses:
 *       200:
 *         description: Plans retrieved successfully
 */
router.get('/plans', [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('type')
    .optional()
    .isString()
    .withMessage('Type must be a string')
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

    const { limit = 20, offset = 0, type } = req.query;
    const userId = req.user.id;

    const plans = await plannerService.getUserPlans(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      type
    });

    res.json({
      success: true,
      data: plans,
      message: 'Plans retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get plans:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/planner/plans/{planId}:
 *   get:
 *     summary: Get a specific plan
 *     tags: [Planning]
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plan retrieved successfully
 *       404:
 *         description: Plan not found
 */
router.get('/plans/:planId', async (req, res, next) => {
  try {
    const { planId } = req.params;
    const userId = req.user.id;

    const plan = await plannerService.getPlan(planId, userId);

    if (!plan) {
      return res.status(404).json({
        error: {
          message: 'Plan not found',
          code: 'PLAN_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: plan,
      message: 'Plan retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get plan:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/planner/plans/{planId}:
 *   put:
 *     summary: Update a plan
 *     tags: [Planning]
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Plan updated successfully
 */
router.put('/plans/:planId', [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 3 })
    .withMessage('Name must be at least 3 characters'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
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

    const { planId } = req.params;
    const updates = req.body;
    const userId = req.user.id;

    const updatedPlan = await plannerService.updatePlan(planId, updates, userId);

    if (!updatedPlan) {
      return res.status(404).json({
        error: {
          message: 'Plan not found',
          code: 'PLAN_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: updatedPlan,
      message: 'Plan updated successfully'
    });

  } catch (error) {
    logger.error('Failed to update plan:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/planner/plans/{planId}:
 *   delete:
 *     summary: Delete a plan
 *     tags: [Planning]
 *     parameters:
 *       - in: path
 *         name: planId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Plan deleted successfully
 *       404:
 *         description: Plan not found
 */
router.delete('/plans/:planId', async (req, res, next) => {
  try {
    const { planId } = req.params;
    const userId = req.user.id;

    const deleted = await plannerService.deletePlan(planId, userId);

    if (!deleted) {
      return res.status(404).json({
        error: {
          message: 'Plan not found',
          code: 'PLAN_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete plan:', error);
    next(error);
  }
});

module.exports = router;