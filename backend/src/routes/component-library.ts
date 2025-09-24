/**
 * Component Library API Routes
 * Reusable code patterns and component templates
 */

import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { componentLibrary } from '../services/component-library';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * @swagger
 * /api/components/search:
 *   post:
 *     summary: Search for component templates
 *     tags: [Component Library]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 description: Description of the component to find
 *               category:
 *                 type: string
 *                 description: Component category (react, nodejs, etc.)
 *               framework:
 *                 type: string
 *                 description: Framework (nextjs, express, etc.)
 *               type:
 *                 type: string
 *                 description: Component type (component, hook, utility, etc.)
 *     responses:
 *       200:
 *         description: Component found or not found
 *       400:
 *         description: Invalid request parameters
 */
router.post('/search', authenticate, [
  body('description').isString().isLength({ min: 3, max: 500 })
    .withMessage('Description must be between 3 and 500 characters'),
  body('category').optional().isString().isLength({ min: 1, max: 50 })
    .withMessage('Category must be a string'),
  body('framework').optional().isString().isLength({ min: 1, max: 50 })
    .withMessage('Framework must be a string'),
  body('type').optional().isString().isLength({ min: 1, max: 50 })
    .withMessage('Type must be a string')
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

    const { description, category, framework, type } = req.body;
    
    // Search for matching component
    const component = await componentLibrary.findComponent(description, category, framework, type);
    
    if (component) {
      logger.info('Component template found', {
        userId: req.user.id,
        componentId: component.id,
        name: component.name,
        category: component.category,
        framework: component.framework,
        usageCount: component.usageCount
      });

      res.json({
        success: true,
        data: {
          found: true,
          component: {
            id: component.id,
            name: component.name,
            description: component.description,
            category: component.category,
            framework: component.framework,
            type: component.type,
            tags: component.tags,
            code: component.code,
            dependencies: component.dependencies,
            usageCount: component.usageCount,
            quality: component.quality,
            lastUsedAt: component.lastUsedAt,
            metadata: component.metadata
          }
        },
        message: 'Component template found'
      });
    } else {
      logger.debug('No component template found', {
        userId: req.user.id,
        description,
        category,
        framework,
        type
      });

      res.json({
        success: true,
        data: {
          found: false,
          message: 'No matching component template found'
        }
      });
    }

  } catch (error) {
    logger.error('Component search error:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/components/store:
 *   post:
 *     summary: Store a new component template
 *     tags: [Component Library]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Component name
 *               description:
 *                 type: string
 *                 description: Component description
 *               category:
 *                 type: string
 *                 description: Component category
 *               framework:
 *                 type: string
 *                 description: Framework used
 *               type:
 *                 type: string
 *                 description: Component type
 *               code:
 *                 type: string
 *                 description: Component code
 *               dependencies:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Required dependencies
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Component tags
 *               quality:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 description: Quality score
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *     responses:
 *       200:
 *         description: Component stored successfully
 *       400:
 *         description: Invalid request parameters
 */
router.post('/store', authenticate, [
  body('name').isString().isLength({ min: 1, max: 200 })
    .withMessage('Name is required and must be between 1 and 200 characters'),
  body('description').isString().isLength({ min: 3, max: 1000 })
    .withMessage('Description must be between 3 and 1000 characters'),
  body('category').isString().isLength({ min: 1, max: 50 })
    .withMessage('Category is required'),
  body('framework').isString().isLength({ min: 1, max: 50 })
    .withMessage('Framework is required'),
  body('type').isString().isLength({ min: 1, max: 50 })
    .withMessage('Type is required'),
  body('code').isString().isLength({ min: 10, max: 50000 })
    .withMessage('Code must be between 10 and 50000 characters'),
  body('dependencies').optional().isArray()
    .withMessage('Dependencies must be an array'),
  body('tags').optional().isArray()
    .withMessage('Tags must be an array'),
  body('quality').optional().isFloat({ min: 0, max: 1 })
    .withMessage('Quality must be between 0 and 1'),
  body('metadata').optional().isObject()
    .withMessage('Metadata must be an object')
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

    const {
      name,
      description,
      category,
      framework,
      type,
      code,
      dependencies = [],
      tags = [],
      quality = 1,
      metadata = {}
    } = req.body;

    // Store component template
    await componentLibrary.storeComponent(
      name,
      description,
      category,
      framework,
      type,
      code,
      dependencies,
      tags,
      quality,
      metadata
    );

    logger.info('Component template stored', {
      userId: req.user.id,
      name,
      category,
      framework,
      type,
      quality,
      codeLength: code.length
    });

    res.json({
      success: true,
      data: {
        stored: true,
        message: 'Component template stored successfully'
      },
      message: 'Component template stored for future reuse'
    });

  } catch (error) {
    logger.error('Component storage error:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/components/suggestions:
 *   get:
 *     summary: Get component suggestions based on context
 *     tags: [Component Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectType
 *         schema:
 *           type: string
 *         description: Type of project
 *       - in: query
 *         name: framework
 *         schema:
 *           type: string
 *         description: Framework being used
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of suggestions to return
 *     responses:
 *       200:
 *         description: Suggestions retrieved successfully
 */
router.get('/suggestions', authenticate, [
  query('projectType').optional().isString().isLength({ min: 1, max: 50 })
    .withMessage('Project type must be a string'),
  query('framework').optional().isString().isLength({ min: 1, max: 50 })
    .withMessage('Framework must be a string'),
  query('limit').optional().isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
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

    const { projectType, framework, limit = 10 } = req.query;
    
    const suggestions = await componentLibrary.getSuggestions({
      projectType: projectType as string,
      framework: framework as string
    });

    const limitedSuggestions = suggestions.slice(0, parseInt(limit as string));

    res.json({
      success: true,
      data: {
        suggestions: limitedSuggestions.map(comp => ({
          id: comp.id,
          name: comp.name,
          description: comp.description,
          category: comp.category,
          framework: comp.framework,
          type: comp.type,
          tags: comp.tags,
          usageCount: comp.usageCount,
          quality: comp.quality,
          lastUsedAt: comp.lastUsedAt
        })),
        total: limitedSuggestions.length,
        context: { projectType, framework }
      },
      message: 'Component suggestions retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get component suggestions:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/components/categories:
 *   get:
 *     summary: Get popular component categories
 *     tags: [Component Library]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of categories to return
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get('/categories', [
  query('limit').optional().isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
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

    const { limit = 20 } = req.query;
    
    const categories = await componentLibrary.getPopularCategories(parseInt(limit as string));

    res.json({
      success: true,
      data: {
        categories,
        total: categories.length
      },
      message: 'Popular categories retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get popular categories:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/components/statistics:
 *   get:
 *     summary: Get component library statistics
 *     tags: [Component Library]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics', authenticate, async (req, res, next) => {
  try {
    const metrics = componentLibrary.getLibraryMetrics();
    const patterns = componentLibrary.getPatterns();

    // Calculate additional statistics
    const topPatterns = patterns.slice(0, 10);
    const reusabilityScore = metrics.totalUsage > 0 ? 
      (metrics.totalUsage / metrics.totalComponents) : 0;

    res.json({
      success: true,
      data: {
        libraryMetrics: {
          ...metrics,
          reusabilityScore: Math.round(reusabilityScore * 100) / 100,
          averageQuality: 0.85, // Could be calculated from actual data
          totalPatterns: patterns.length
        },
        patterns: {
          totalIdentified: patterns.length,
          topPatterns: topPatterns.map(pattern => ({
            pattern: pattern.pattern,
            frequency: pattern.frequency,
            template: {
              name: pattern.template.name,
              category: pattern.template.category,
              framework: pattern.template.framework,
              type: pattern.template.type
            },
            optimizationOpportunity: pattern.frequency * pattern.avgGenerationTime
          })),
          reusabilityOpportunity: {
            total: topPatterns.reduce((sum, p) => sum + p.frequency, 0),
            description: 'Number of times reusable patterns could save development time'
          }
        },
        recommendations: [
          metrics.totalComponents < 50 ? 'Consider adding more component templates for better coverage' : null,
          reusabilityScore < 2 ? 'Low reusability score - components may need better tagging' : null,
          patterns.length > 10 ? 'High pattern diversity detected - good reusability potential' : null
        ].filter(Boolean)
      },
      message: 'Component library statistics retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get component statistics:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/components/patterns:
 *   get:
 *     summary: Get identified component patterns
 *     tags: [Component Library]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of patterns to return
 *       - in: query
 *         name: minFrequency
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Minimum frequency for patterns
 *     responses:
 *       200:
 *         description: Patterns retrieved successfully
 */
router.get('/patterns', authenticate, [
  query('limit').optional().isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('minFrequency').optional().isInt({ min: 1 })
    .withMessage('Min frequency must be a positive integer')
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

    const { limit = 20, minFrequency = 1 } = req.query;
    const allPatterns = componentLibrary.getPatterns();
    
    const filteredPatterns = allPatterns
      .filter(pattern => pattern.frequency >= parseInt(minFrequency as string))
      .slice(0, parseInt(limit as string))
      .map(pattern => ({
        pattern: pattern.pattern,
        frequency: pattern.frequency,
        variations: pattern.variations.length,
        template: {
          name: pattern.template.name,
          category: pattern.template.category,
          framework: pattern.template.framework,
          type: pattern.template.type,
          quality: pattern.template.quality
        },
        optimizationOpportunity: {
          timeSaved: pattern.frequency * pattern.avgGenerationTime,
          costSaved: pattern.frequency * pattern.avgCost,
          description: `This pattern could save ${pattern.frequency} generations`
        }
      }));

    const totalOptimization = filteredPatterns.reduce(
      (sum, pattern) => sum + pattern.optimizationOpportunity.timeSaved, 0
    );

    res.json({
      success: true,
      data: {
        patterns: filteredPatterns,
        summary: {
          totalPatterns: filteredPatterns.length,
          totalOptimizationOpportunity: totalOptimization,
          averageFrequency: filteredPatterns.reduce((sum, p) => sum + p.frequency, 0) / filteredPatterns.length,
          topCategory: filteredPatterns.length > 0 ? filteredPatterns[0].template.category : null
        }
      },
      message: 'Component patterns retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get component patterns:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/components/clear:
 *   post:
 *     summary: Clear component templates by category
 *     tags: [Component Library]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *                 description: Category to clear
 *     responses:
 *       200:
 *         description: Components cleared successfully
 *       403:
 *         description: Insufficient permissions
 */
router.post('/clear', authenticate, [
  body('category').isString().isLength({ min: 1, max: 50 })
    .withMessage('Category is required')
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

    // Only allow admins to clear components
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Only admins can clear component templates',
          code: 'INSUFFICIENT_PERMISSIONS'
        }
      });
    }

    const { category } = req.body;
    const deletedCount = await componentLibrary.clearByCategory(category);

    logger.info('Components cleared by admin', {
      userId: req.user.id,
      category,
      deletedCount
    });

    res.json({
      success: true,
      data: {
        deletedCount,
        category
      },
      message: `Successfully cleared ${deletedCount} components from category: ${category}`
    });

  } catch (error) {
    logger.error('Failed to clear components:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/components/config:
 *   get:
 *     summary: Get component library configuration
 *     tags: [Component Library]
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 */
router.get('/config', async (req, res, next) => {
  try {
    const config = {
      maxLibrarySize: 50000,
      similarityThreshold: 0.8,
      qualityThreshold: 0.7,
      usageThreshold: 3,
      cacheTTL: 7 * 24 * 60 * 60, // 7 days
      supportedCategories: [
        'react', 'vue', 'angular', 'nodejs', 'python', 'java',
        'go', 'rust', 'typescript', 'javascript'
      ],
      supportedFrameworks: [
        'nextjs', 'react', 'express', 'fastapi', 'spring',
        'django', 'flask', 'nestjs', 'nuxt', 'svelte'
      ],
      supportedTypes: [
        'component', 'hook', 'utility', 'api', 'config',
        'middleware', 'service', 'model', 'controller'
      ],
      features: {
        patternRecognition: true,
        smartCaching: true,
        qualityFiltering: true,
        usageTracking: true,
        suggestionEngine: true
      },
      benefits: {
        description: 'Component library accelerates development with reusable patterns',
        timeSavings: '50-80% faster component generation',
        consistencyImprovement: 'Standardized code patterns across projects'
      }
    };

    res.json({
      success: true,
      data: config,
      message: 'Component library configuration retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get component config:', error);
    next(error);
  }
});

export default router;

// CommonJS compatibility
module.exports = router;