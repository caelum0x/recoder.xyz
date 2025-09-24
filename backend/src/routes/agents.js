const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { prisma } = require('../database/prisma');
const { logger } = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { agentService } = require('../services/agentService');

const router = express.Router();

/**
 * @swagger
 * /api/agents:
 *   get:
 *     summary: Get all agents for authenticated user
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of agents to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of agents to skip
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [code, chat, analysis, deployment]
 *         description: Filter by agent type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, training, error]
 *         description: Filter by agent status
 *     responses:
 *       200:
 *         description: Agents retrieved successfully
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
    .isIn(['code', 'chat', 'analysis', 'deployment'])
    .withMessage('Type must be one of: code, chat, analysis, deployment'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'training', 'error'])
    .withMessage('Status must be one of: active, inactive, training, error')
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

    const agents = await prisma.agent.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'type']
        }
      ]
    });

    res.json({
      success: true,
      data: {
        agents: agents.rows,
        pagination: {
          total: agents.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages: Math.ceil(agents.count / limit)
        }
      },
      message: 'Agents retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get agents:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/agents:
 *   post:
 *     summary: Create a new agent
 *     tags: [Agents]
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
 *                 description: Agent name
 *               type:
 *                 type: string
 *                 enum: [code, chat, analysis, deployment]
 *                 description: Agent type
 *               description:
 *                 type: string
 *                 description: Agent description
 *               config:
 *                 type: object
 *                 description: Agent configuration
 *               projectId:
 *                 type: string
 *                 description: Associated project ID
 *     responses:
 *       201:
 *         description: Agent created successfully
 *       400:
 *         description: Invalid input
 */
router.post('/', authenticate, [
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('type')
    .isIn(['code', 'chat', 'analysis', 'deployment'])
    .withMessage('Type must be one of: code, chat, analysis, deployment'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('config')
    .optional()
    .isObject()
    .withMessage('Config must be an object'),
  body('projectId')
    .optional()
    .isString()
    .withMessage('Project ID must be a string')
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

    const { name, type, description, config, projectId } = req.body;
    const userId = req.user.id;

    // Validate project ownership if projectId is provided
    if (projectId) {
      const project = await prisma.project.findOne({
        where: { id: projectId, userId }
      });
      if (!project) {
        return res.status(404).json({
          error: {
            message: 'Project not found or access denied',
            code: 'PROJECT_NOT_FOUND'
          }
        });
      }
    }

    const agent = await agentService.createAgent({
      name,
      type,
      description,
      config: config || {},
      projectId,
      userId
    });

    logger.info(`Agent created: ${agent.id} by user: ${userId}`);

    res.status(201).json({
      success: true,
      data: agent,
      message: 'Agent created successfully'
    });

  } catch (error) {
    logger.error('Failed to create agent:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/agents/{agentId}:
 *   get:
 *     summary: Get agent by ID
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent ID
 *     responses:
 *       200:
 *         description: Agent retrieved successfully
 *       404:
 *         description: Agent not found
 */
router.get('/:agentId', authenticate, [
  param('agentId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Agent ID is required')
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

    const { agentId } = req.params;
    const userId = req.user.id;

    const agent = await prisma.agent.findOne({
      where: { id: agentId, userId },
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'type', 'status']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!agent) {
      return res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: agent,
      message: 'Agent retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get agent:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/agents/{agentId}:
 *   put:
 *     summary: Update agent
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Agent name
 *               description:
 *                 type: string
 *                 description: Agent description
 *               config:
 *                 type: object
 *                 description: Agent configuration
 *               status:
 *                 type: string
 *                 enum: [active, inactive, training, error]
 *                 description: Agent status
 *     responses:
 *       200:
 *         description: Agent updated successfully
 *       404:
 *         description: Agent not found
 */
router.put('/:agentId', authenticate, [
  param('agentId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Agent ID is required'),
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('config')
    .optional()
    .isObject()
    .withMessage('Config must be an object'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'training', 'error'])
    .withMessage('Status must be one of: active, inactive, training, error')
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

    const { agentId } = req.params;
    const { name, description, config, status } = req.body;
    const userId = req.user.id;

    const agent = await prisma.agent.findOne({
      where: { id: agentId, userId }
    });

    if (!agent) {
      return res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        }
      });
    }

    await agent.update({
      ...(name && { name }),
      ...(description && { description }),
      ...(config && { config }),
      ...(status && { status })
    });

    logger.info(`Agent updated: ${agent.id} by user: ${userId}`);

    res.json({
      success: true,
      data: agent,
      message: 'Agent updated successfully'
    });

  } catch (error) {
    logger.error('Failed to update agent:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/agents/{agentId}:
 *   delete:
 *     summary: Delete agent
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent ID
 *     responses:
 *       200:
 *         description: Agent deleted successfully
 *       404:
 *         description: Agent not found
 */
router.delete('/:agentId', authenticate, [
  param('agentId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Agent ID is required')
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

    const { agentId } = req.params;
    const userId = req.user.id;

    const agent = await prisma.agent.findOne({
      where: { id: agentId, userId }
    });

    if (!agent) {
      return res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        }
      });
    }

    await agent.destroy();

    logger.info(`Agent deleted: ${agentId} by user: ${userId}`);

    res.json({
      success: true,
      message: 'Agent deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete agent:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/agents/{agentId}/execute:
 *   post:
 *     summary: Execute agent task
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               task:
 *                 type: string
 *                 description: Task to execute
 *               context:
 *                 type: object
 *                 description: Additional context for the task
 *     responses:
 *       200:
 *         description: Task executed successfully
 *       404:
 *         description: Agent not found
 */
router.post('/:agentId/execute', authenticate, [
  param('agentId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Agent ID is required'),
  body('task')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Task is required'),
  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object')
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

    const { agentId } = req.params;
    const { task, context } = req.body;
    const userId = req.user.id;

    const agent = await prisma.agent.findOne({
      where: { id: agentId, userId }
    });

    if (!agent) {
      return res.status(404).json({
        error: {
          message: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        }
      });
    }

    if (agent.status !== 'active') {
      return res.status(400).json({
        error: {
          message: 'Agent is not active',
          code: 'AGENT_NOT_ACTIVE'
        }
      });
    }

    const result = await agentService.executeTask(agent, task, context);

    logger.info(`Task executed by agent: ${agentId} for user: ${userId}`);

    res.json({
      success: true,
      data: result,
      message: 'Task executed successfully'
    });

  } catch (error) {
    logger.error('Failed to execute agent task:', error);
    next(error);
  }
});

module.exports = router;