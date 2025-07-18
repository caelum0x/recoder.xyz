const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Project, User, Agent, Template } = require('../models');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { projectService } = require('../services/projectService');
const { codeService } = require('../services/codeService');

const router = express.Router();

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects for authenticated user
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of projects to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of projects to skip
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [web, mobile, desktop, api, blockchain, ai]
 *         description: Filter by project type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [planning, active, completed, archived]
 *         description: Filter by project status
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 */
router.get('/', authenticateToken, [
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
    .isIn(['web', 'mobile', 'desktop', 'api', 'blockchain', 'ai'])
    .withMessage('Type must be one of: web, mobile, desktop, api, blockchain, ai'),
  query('status')
    .optional()
    .isIn(['planning', 'active', 'completed', 'archived'])
    .withMessage('Status must be one of: planning, active, completed, archived')
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

    const { limit = 20, offset = 0, type, status } = req.query;
    const userId = req.user.id;

    const whereClause = { userId };
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;

    const projects = await Project.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Agent,
          as: 'agents',
          attributes: ['id', 'name', 'type', 'status']
        },
        {
          model: Template,
          as: 'template',
          attributes: ['id', 'name', 'category']
        }
      ]
    });

    res.json({
      success: true,
      data: {
        projects: projects.rows,
        pagination: {
          total: projects.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages: Math.ceil(projects.count / limit)
        }
      },
      message: 'Projects retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get projects:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
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
 *                 description: Project name
 *               type:
 *                 type: string
 *                 enum: [web, mobile, desktop, api, blockchain, ai]
 *                 description: Project type
 *               description:
 *                 type: string
 *                 description: Project description
 *               config:
 *                 type: object
 *                 description: Project configuration
 *               templateId:
 *                 type: string
 *                 description: Template ID to use
 *     responses:
 *       201:
 *         description: Project created successfully
 *       400:
 *         description: Invalid input
 */
router.post('/', authenticateToken, [
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('type')
    .isIn(['web', 'mobile', 'desktop', 'api', 'blockchain', 'ai'])
    .withMessage('Type must be one of: web, mobile, desktop, api, blockchain, ai'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('config')
    .optional()
    .isObject()
    .withMessage('Config must be an object'),
  body('templateId')
    .optional()
    .isString()
    .withMessage('Template ID must be a string')
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

    const { name, type, description, config, templateId } = req.body;
    const userId = req.user.id;

    // Validate template if provided
    if (templateId) {
      const template = await Template.findOne({
        where: { 
          id: templateId,
          $or: [
            { userId },
            { public: true }
          ]
        }
      });
      if (!template) {
        return res.status(404).json({
          error: {
            message: 'Template not found or access denied',
            code: 'TEMPLATE_NOT_FOUND'
          }
        });
      }
    }

    const project = await projectService.createProject({
      name,
      type,
      description,
      config: config || {},
      templateId,
      userId
    });

    logger.info(`Project created: ${project.id} by user: ${userId}`);

    res.status(201).json({
      success: true,
      data: project,
      message: 'Project created successfully'
    });

  } catch (error) {
    logger.error('Failed to create project:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get project by ID
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project retrieved successfully
 *       404:
 *         description: Project not found
 */
router.get('/:projectId', authenticateToken, [
  param('projectId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project ID is required')
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

    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({
      where: { id: projectId, userId },
      include: [
        {
          model: Agent,
          as: 'agents',
          attributes: ['id', 'name', 'type', 'status', 'config']
        },
        {
          model: Template,
          as: 'template',
          attributes: ['id', 'name', 'category', 'structure']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!project) {
      return res.status(404).json({
        error: {
          message: 'Project not found',
          code: 'PROJECT_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: project,
      message: 'Project retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get project:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Project name
 *               description:
 *                 type: string
 *                 description: Project description
 *               config:
 *                 type: object
 *                 description: Project configuration
 *               status:
 *                 type: string
 *                 enum: [planning, active, completed, archived]
 *                 description: Project status
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       404:
 *         description: Project not found
 */
router.put('/:projectId', authenticateToken, [
  param('projectId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project ID is required'),
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
  body('config')
    .optional()
    .isObject()
    .withMessage('Config must be an object'),
  body('status')
    .optional()
    .isIn(['planning', 'active', 'completed', 'archived'])
    .withMessage('Status must be one of: planning, active, completed, archived')
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

    const { projectId } = req.params;
    const { name, description, config, status } = req.body;
    const userId = req.user.id;

    const project = await Project.findOne({
      where: { id: projectId, userId }
    });

    if (!project) {
      return res.status(404).json({
        error: {
          message: 'Project not found',
          code: 'PROJECT_NOT_FOUND'
        }
      });
    }

    await project.update({
      ...(name && { name }),
      ...(description && { description }),
      ...(config && { config }),
      ...(status && { status })
    });

    logger.info(`Project updated: ${project.id} by user: ${userId}`);

    res.json({
      success: true,
      data: project,
      message: 'Project updated successfully'
    });

  } catch (error) {
    logger.error('Failed to update project:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/projects/{projectId}:
 *   delete:
 *     summary: Delete project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *       404:
 *         description: Project not found
 */
router.delete('/:projectId', authenticateToken, [
  param('projectId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project ID is required')
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

    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({
      where: { id: projectId, userId }
    });

    if (!project) {
      return res.status(404).json({
        error: {
          message: 'Project not found',
          code: 'PROJECT_NOT_FOUND'
        }
      });
    }

    await project.destroy();

    logger.info(`Project deleted: ${projectId} by user: ${userId}`);

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete project:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/generate:
 *   post:
 *     summary: Generate project code
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               options:
 *                 type: object
 *                 description: Generation options
 *     responses:
 *       200:
 *         description: Code generated successfully
 *       404:
 *         description: Project not found
 */
router.post('/:projectId/generate', authenticateToken, [
  param('projectId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project ID is required'),
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object')
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

    const { projectId } = req.params;
    const { options } = req.body;
    const userId = req.user.id;

    const project = await Project.findOne({
      where: { id: projectId, userId },
      include: [
        {
          model: Template,
          as: 'template'
        }
      ]
    });

    if (!project) {
      return res.status(404).json({
        error: {
          message: 'Project not found',
          code: 'PROJECT_NOT_FOUND'
        }
      });
    }

    const generatedCode = await codeService.generateProject(project, options);

    logger.info(`Code generated for project: ${projectId} by user: ${userId}`);

    res.json({
      success: true,
      data: generatedCode,
      message: 'Code generated successfully'
    });

  } catch (error) {
    logger.error('Failed to generate project code:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/structure:
 *   get:
 *     summary: Get project structure
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project structure retrieved successfully
 *       404:
 *         description: Project not found
 */
router.get('/:projectId/structure', authenticateToken, [
  param('projectId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project ID is required')
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

    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({
      where: { id: projectId, userId }
    });

    if (!project) {
      return res.status(404).json({
        error: {
          message: 'Project not found',
          code: 'PROJECT_NOT_FOUND'
        }
      });
    }

    const structure = await projectService.getProjectStructure(project);

    res.json({
      success: true,
      data: structure,
      message: 'Project structure retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get project structure:', error);
    next(error);
  }
});

module.exports = router;