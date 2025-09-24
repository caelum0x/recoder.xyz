const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { prisma } = require('../database/prisma');
const { logger } = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
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
router.get('/', authenticate, [
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

    const [projects, totalCount] = await Promise.all([
      prisma.project.findMany({
        where: whereClause,
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
        include: {
          agents: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true
            }
          },
          template: {
            select: {
              id: true,
              name: true,
              category: true
            }
          }
        }
      }),
      prisma.project.count({ where: whereClause })
    ]);

    res.json({
      success: true,
      data: {
        projects: projects,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages: Math.ceil(totalCount / limit)
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
router.post('/', authenticate, [
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
      const template = await prisma.template.findFirst({
        where: {
          id: templateId,
          OR: [
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
router.get('/:projectId', authenticate, [
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

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            config: true
          }
        },
        template: {
          select: {
            id: true,
            name: true,
            category: true,
            structure: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
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
router.put('/:projectId', authenticate, [
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

    const project = await prisma.project.findFirst({
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

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(config && { config }),
        ...(status && { status })
      }
    });

    logger.info(`Project updated: ${project.id} by user: ${userId}`);

    res.json({
      success: true,
      data: updatedProject,
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
router.delete('/:projectId', authenticate, [
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

    const project = await prisma.project.findFirst({
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

    await prisma.project.delete({
      where: { id: projectId }
    });

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
router.post('/:projectId/generate', authenticate, [
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

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        template: true
      }
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
router.get('/:projectId/structure', authenticate, [
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

    const project = await prisma.project.findFirst({
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

/**
 * @swagger
 * /api/projects/{projectId}/files:
 *   post:
 *     summary: Save project files
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
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     path:
 *                       type: string
 *                     content:
 *                       type: string
 *                     type:
 *                       type: string
 *                     size:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Files saved successfully
 *       404:
 *         description: Project not found
 */
router.post('/:projectId/files', authenticate, [
  param('projectId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Project ID is required'),
  body('files')
    .isArray()
    .withMessage('Files must be an array'),
  body('files.*.path')
    .isString()
    .withMessage('File path is required'),
  body('files.*.content')
    .isString()
    .withMessage('File content is required')
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
    const { files } = req.body;
    const userId = req.user.id;

    const project = await prisma.project.findFirst({
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

    // Update project config to include files metadata
    const currentConfig = project.config || {};
    const updatedConfig = {
      ...currentConfig,
      files: files.map(file => ({
        path: file.path,
        type: file.type || 'text',
        size: file.size || file.content.length,
        lastModified: new Date().toISOString()
      })),
      filesContent: files, // Store actual content
      lastUpdated: new Date().toISOString()
    };

    await prisma.project.update({
      where: { id: projectId },
      data: { config: updatedConfig }
    });

    logger.info(`Project files saved: ${projectId} (${files.length} files) by user: ${userId}`);

    res.json({
      success: true,
      data: {
        projectId,
        filesCount: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.size || file.content.length), 0)
      },
      message: 'Project files saved successfully'
    });

  } catch (error) {
    logger.error('Failed to save project files:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/files:
 *   get:
 *     summary: Get project files
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
 *         description: Files retrieved successfully
 *       404:
 *         description: Project not found
 */
router.get('/:projectId/files', authenticate, [
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

    const project = await prisma.project.findFirst({
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

    const files = project.config?.filesContent || [];
    const filesMetadata = project.config?.files || [];

    res.json({
      success: true,
      data: {
        files,
        metadata: filesMetadata,
        projectId,
        filesCount: files.length
      },
      message: 'Project files retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get project files:', error);
    next(error);
  }
});

module.exports = router;