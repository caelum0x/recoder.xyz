const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { prisma } = require('../database/prisma');
const { logger } = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { templateService } = require('../services/templateService');

const router = express.Router();

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: Get all templates
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of templates to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of templates to skip
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [web, mobile, desktop, api, blockchain, ai]
 *         description: Filter by template category
 *       - in: query
 *         name: public
 *         schema:
 *           type: boolean
 *         description: Filter by public/private templates
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search templates by name or description
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 */
router.get('/', authenticate, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('category')
    .optional()
    .isIn(['web', 'mobile', 'desktop', 'api', 'blockchain', 'ai'])
    .withMessage('Category must be one of: web, mobile, desktop, api, blockchain, ai'),
  query('public')
    .optional()
    .isBoolean()
    .withMessage('Public must be a boolean'),
  query('search')
    .optional()
    .isString()
    .isLength({ min: 1 })
    .withMessage('Search must be a non-empty string')
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

    const { limit = 20, offset = 0, category, public: isPublic, search } = req.query;
    const userId = req.user.id;

    const whereClause = {};
    
    // Users can see their own templates or public templates
    if (isPublic !== undefined) {
      if (isPublic) {
        whereClause.public = true;
      } else {
        whereClause.userId = userId;
        whereClause.public = false;
      }
    } else {
      whereClause[Op.or] = [
        { userId },
        { public: true }
      ];
    }

    if (category) whereClause.category = category;
    
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const templates = await prisma.template.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    res.json({
      success: true,
      data: {
        templates: templates.rows,
        pagination: {
          total: templates.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages: Math.ceil(templates.count / limit)
        }
      },
      message: 'Templates retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get templates:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/templates:
 *   post:
 *     summary: Create a new template
 *     tags: [Templates]
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
 *                 description: Template name
 *               category:
 *                 type: string
 *                 enum: [web, mobile, desktop, api, blockchain, ai]
 *                 description: Template category
 *               description:
 *                 type: string
 *                 description: Template description
 *               structure:
 *                 type: object
 *                 description: Template structure definition
 *               config:
 *                 type: object
 *                 description: Template configuration
 *               public:
 *                 type: boolean
 *                 description: Whether template is public
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         description: Invalid input
 */
router.post('/', authenticate, [
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('category')
    .isIn(['web', 'mobile', 'desktop', 'api', 'blockchain', 'ai'])
    .withMessage('Category must be one of: web, mobile, desktop, api, blockchain, ai'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('structure')
    .isObject()
    .withMessage('Structure must be an object'),
  body('config')
    .optional()
    .isObject()
    .withMessage('Config must be an object'),
  body('public')
    .optional()
    .isBoolean()
    .withMessage('Public must be a boolean')
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

    const { name, category, description, structure, config, public: isPublic } = req.body;
    const userId = req.user.id;

    const template = await templateService.createTemplate({
      name,
      category,
      description,
      structure,
      config: config || {},
      public: isPublic || false,
      userId
    });

    logger.info(`Template created: ${template.id} by user: ${userId}`);

    res.status(201).json({
      success: true,
      data: template,
      message: 'Template created successfully'
    });

  } catch (error) {
    logger.error('Failed to create template:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/templates/{templateId}:
 *   get:
 *     summary: Get template by ID
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template retrieved successfully
 *       404:
 *         description: Template not found
 */
router.get('/:templateId', authenticate, [
  param('templateId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Template ID is required')
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

    const { templateId } = req.params;
    const userId = req.user.id;

    const template = await prisma.template.findOne({
      where: {
        id: templateId,
        [Op.or]: [
          { userId },
          { public: true }
        ]
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Project,
          as: 'projects',
          attributes: ['id', 'name', 'type', 'status'],
          limit: 10
        }
      ]
    });

    if (!template) {
      return res.status(404).json({
        error: {
          message: 'Template not found',
          code: 'TEMPLATE_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: template,
      message: 'Template retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get template:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/templates/{templateId}:
 *   put:
 *     summary: Update template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name
 *               description:
 *                 type: string
 *                 description: Template description
 *               structure:
 *                 type: object
 *                 description: Template structure definition
 *               config:
 *                 type: object
 *                 description: Template configuration
 *               public:
 *                 type: boolean
 *                 description: Whether template is public
 *     responses:
 *       200:
 *         description: Template updated successfully
 *       404:
 *         description: Template not found
 *       403:
 *         description: Access denied
 */
router.put('/:templateId', authenticate, [
  param('templateId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Template ID is required'),
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('structure')
    .optional()
    .isObject()
    .withMessage('Structure must be an object'),
  body('config')
    .optional()
    .isObject()
    .withMessage('Config must be an object'),
  body('public')
    .optional()
    .isBoolean()
    .withMessage('Public must be a boolean')
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

    const { templateId } = req.params;
    const { name, description, structure, config, public: isPublic } = req.body;
    const userId = req.user.id;

    const template = await prisma.template.findOne({
      where: { id: templateId, userId }
    });

    if (!template) {
      return res.status(404).json({
        error: {
          message: 'Template not found or access denied',
          code: 'TEMPLATE_NOT_FOUND'
        }
      });
    }

    await template.update({
      ...(name && { name }),
      ...(description && { description }),
      ...(structure && { structure }),
      ...(config && { config }),
      ...(isPublic !== undefined && { public: isPublic })
    });

    logger.info(`Template updated: ${template.id} by user: ${userId}`);

    res.json({
      success: true,
      data: template,
      message: 'Template updated successfully'
    });

  } catch (error) {
    logger.error('Failed to update template:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/templates/{templateId}:
 *   delete:
 *     summary: Delete template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *       404:
 *         description: Template not found
 *       403:
 *         description: Access denied
 */
router.delete('/:templateId', authenticate, [
  param('templateId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Template ID is required')
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

    const { templateId } = req.params;
    const userId = req.user.id;

    const template = await prisma.template.findOne({
      where: { id: templateId, userId }
    });

    if (!template) {
      return res.status(404).json({
        error: {
          message: 'Template not found or access denied',
          code: 'TEMPLATE_NOT_FOUND'
        }
      });
    }

    // Check if template is being used by any projects
    const projectsUsingTemplate = await prisma.project.count({
      where: { templateId }
    });

    if (projectsUsingTemplate > 0) {
      return res.status(400).json({
        error: {
          message: 'Template is being used by projects and cannot be deleted',
          code: 'TEMPLATE_IN_USE'
        }
      });
    }

    await template.destroy();

    logger.info(`Template deleted: ${templateId} by user: ${userId}`);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete template:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/templates/{templateId}/clone:
 *   post:
 *     summary: Clone template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New template name
 *               public:
 *                 type: boolean
 *                 description: Whether cloned template is public
 *     responses:
 *       201:
 *         description: Template cloned successfully
 *       404:
 *         description: Template not found
 */
router.post('/:templateId/clone', authenticate, [
  param('templateId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Template ID is required'),
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('public')
    .optional()
    .isBoolean()
    .withMessage('Public must be a boolean')
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

    const { templateId } = req.params;
    const { name, public: isPublic } = req.body;
    const userId = req.user.id;

    const originalTemplate = await prisma.template.findOne({
      where: {
        id: templateId,
        [Op.or]: [
          { userId },
          { public: true }
        ]
      }
    });

    if (!originalTemplate) {
      return res.status(404).json({
        error: {
          message: 'Template not found',
          code: 'TEMPLATE_NOT_FOUND'
        }
      });
    }

    const clonedTemplate = await templateService.cloneTemplate(originalTemplate, {
      name,
      public: isPublic || false,
      userId
    });

    logger.info(`Template cloned: ${templateId} -> ${clonedprisma.template.id} by user: ${userId}`);

    res.status(201).json({
      success: true,
      data: clonedTemplate,
      message: 'Template cloned successfully'
    });

  } catch (error) {
    logger.error('Failed to clone template:', error);
    next(error);
  }
});

module.exports = router;