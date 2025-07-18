const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { StructureService } = require('../services/structureService');
const { logger } = require('../utils/logger');

const router = express.Router();
const structureService = new StructureService();

/**
 * @swagger
 * /api/structure/analyze:
 *   post:
 *     summary: Analyze project structure
 *     tags: [Structure]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectPath:
 *                 type: string
 *                 description: Path to the project directory
 *               options:
 *                 type: object
 *                 properties:
 *                   deep:
 *                     type: boolean
 *                     description: Perform deep analysis
 *                   includeFiles:
 *                     type: boolean
 *                     description: Include file contents in analysis
 *                   excludePatterns:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Patterns to exclude from analysis
 *     responses:
 *       200:
 *         description: Structure analysis completed
 *       400:
 *         description: Invalid input
 */
router.post('/analyze', [
  body('projectPath')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project path is required'),
  body('options.deep')
    .optional()
    .isBoolean()
    .withMessage('Deep option must be boolean'),
  body('options.includeFiles')
    .optional()
    .isBoolean()
    .withMessage('IncludeFiles option must be boolean')
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

    const { projectPath, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Analyzing project structure for user ${userId}`, { projectPath, options });

    const structure = await structureService.analyzeStructure(projectPath, options);

    res.json({
      success: true,
      data: structure,
      message: 'Structure analysis completed'
    });

  } catch (error) {
    logger.error('Structure analysis failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/structure/generate:
 *   post:
 *     summary: Generate project structure
 *     tags: [Structure]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan:
 *                 type: object
 *                 description: Project plan to generate structure from
 *               options:
 *                 type: object
 *                 properties:
 *                   outputPath:
 *                     type: string
 *                     description: Path where to generate the structure
 *                   template:
 *                     type: string
 *                     description: Template to use for generation
 *                   dryRun:
 *                     type: boolean
 *                     description: Preview structure without creating files
 *     responses:
 *       200:
 *         description: Structure generated successfully
 */
router.post('/generate', [
  body('plan')
    .isObject()
    .withMessage('Plan must be an object'),
  body('plan.name')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Plan name is required'),
  body('plan.type')
    .isIn(['web', 'mobile', 'blockchain', 'ai', 'fullstack'])
    .withMessage('Invalid project type'),
  body('options.outputPath')
    .optional()
    .isString()
    .withMessage('Output path must be a string'),
  body('options.dryRun')
    .optional()
    .isBoolean()
    .withMessage('DryRun option must be boolean')
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

    const { plan, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Generating structure for user ${userId}`, { planId: plan.id, options });

    const result = await structureService.generateStructure(plan, options);

    res.json({
      success: true,
      data: result,
      message: 'Structure generated successfully'
    });

  } catch (error) {
    logger.error('Structure generation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/structure/validate:
 *   post:
 *     summary: Validate project structure
 *     tags: [Structure]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectPath:
 *                 type: string
 *                 description: Path to the project directory
 *               rules:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Validation rules to apply
 *     responses:
 *       200:
 *         description: Structure validation completed
 */
router.post('/validate', [
  body('projectPath')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project path is required'),
  body('rules')
    .optional()
    .isArray()
    .withMessage('Rules must be an array')
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

    const { projectPath, rules = [] } = req.body;
    const userId = req.user.id;

    logger.info(`Validating structure for user ${userId}`, { projectPath });

    const validation = await structureService.validateStructure(projectPath, rules);

    res.json({
      success: true,
      data: validation,
      message: 'Structure validation completed'
    });

  } catch (error) {
    logger.error('Structure validation failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/structure/templates:
 *   get:
 *     summary: Get structure templates
 *     tags: [Structure]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [web, mobile, blockchain, ai, fullstack]
 *         description: Filter by project type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 */
router.get('/templates', [
  query('type')
    .optional()
    .isIn(['web', 'mobile', 'blockchain', 'ai', 'fullstack'])
    .withMessage('Invalid project type'),
  query('category')
    .optional()
    .isString()
    .withMessage('Category must be a string')
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

    const { type, category } = req.query;

    const templates = await structureService.getTemplates({ type, category });

    res.json({
      success: true,
      data: templates,
      message: 'Templates retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get structure templates:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/structure/compare:
 *   post:
 *     summary: Compare project structures
 *     tags: [Structure]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sourceStructure:
 *                 type: object
 *                 description: Source structure to compare
 *               targetStructure:
 *                 type: object
 *                 description: Target structure to compare against
 *               options:
 *                 type: object
 *                 properties:
 *                   detailed:
 *                     type: boolean
 *                     description: Include detailed comparison
 *                   includeContent:
 *                     type: boolean
 *                     description: Compare file contents
 *     responses:
 *       200:
 *         description: Structure comparison completed
 */
router.post('/compare', [
  body('sourceStructure')
    .isObject()
    .withMessage('Source structure must be an object'),
  body('targetStructure')
    .isObject()
    .withMessage('Target structure must be an object'),
  body('options.detailed')
    .optional()
    .isBoolean()
    .withMessage('Detailed option must be boolean'),
  body('options.includeContent')
    .optional()
    .isBoolean()
    .withMessage('IncludeContent option must be boolean')
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

    const { sourceStructure, targetStructure, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Comparing structures for user ${userId}`, { options });

    const comparison = await structureService.compareStructures(
      sourceStructure,
      targetStructure,
      options
    );

    res.json({
      success: true,
      data: comparison,
      message: 'Structure comparison completed'
    });

  } catch (error) {
    logger.error('Structure comparison failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/structure/optimize:
 *   post:
 *     summary: Optimize project structure
 *     tags: [Structure]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectPath:
 *                 type: string
 *                 description: Path to the project directory
 *               options:
 *                 type: object
 *                 properties:
 *                   rules:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Optimization rules to apply
 *                   dryRun:
 *                     type: boolean
 *                     description: Preview optimizations without applying
 *     responses:
 *       200:
 *         description: Structure optimization completed
 */
router.post('/optimize', [
  body('projectPath')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project path is required'),
  body('options.rules')
    .optional()
    .isArray()
    .withMessage('Rules must be an array'),
  body('options.dryRun')
    .optional()
    .isBoolean()
    .withMessage('DryRun option must be boolean')
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

    const { projectPath, options = {} } = req.body;
    const userId = req.user.id;

    logger.info(`Optimizing structure for user ${userId}`, { projectPath, options });

    const optimization = await structureService.optimizeStructure(projectPath, options);

    res.json({
      success: true,
      data: optimization,
      message: 'Structure optimization completed'
    });

  } catch (error) {
    logger.error('Structure optimization failed:', error);
    next(error);
  }
});

module.exports = router;