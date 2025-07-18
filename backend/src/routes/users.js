const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { User, Project, Template, Agent } = require('../models');
const { logger } = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of users to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of users to skip
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       403:
 *         description: Admin access required
 */
router.get('/', authenticateToken, requireAdmin, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  query('search')
    .optional()
    .isString()
    .isLength({ min: 1 })
    .withMessage('Search must be a non-empty string'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('IsActive must be a boolean')
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

    const { limit = 20, offset = 0, search, isActive } = req.query;

    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const users = await User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: { exclude: ['password', 'refreshToken'] },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        users: users.rows,
        pagination: {
          total: users.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages: Math.ceil(users.count / limit)
        }
      },
      message: 'Users retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get users:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *       404:
 *         description: User not found
 */
router.get('/:userId', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Users can only view their own profile unless they're admin
    if (userId !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'ACCESS_DENIED'
        }
      });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password', 'refreshToken'] },
      include: [
        {
          model: Project,
          as: 'projects',
          attributes: ['id', 'name', 'type', 'status', 'createdAt'],
          limit: 10
        },
        {
          model: Template,
          as: 'templates',
          attributes: ['id', 'name', 'category', 'public', 'createdAt'],
          limit: 10
        },
        {
          model: Agent,
          as: 'agents',
          attributes: ['id', 'name', 'type', 'status', 'createdAt'],
          limit: 10
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: user,
      message: 'User retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get user:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/users/{userId}:
 *   put:
 *     summary: Update user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: User full name
 *               organization:
 *                 type: string
 *                 description: User organization
 *               isActive:
 *                 type: boolean
 *                 description: User active status
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: User role
 *     responses:
 *       200:
 *         description: User updated successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.put('/:userId', authenticateToken, requireAdmin, [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('organization')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Organization must be less than 100 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('IsActive must be a boolean'),
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin')
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

    const { userId } = req.params;
    const { name, organization, isActive, role } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Update user
    await user.update({
      ...(name && { name }),
      ...(organization && { organization }),
      ...(isActive !== undefined && { isActive }),
      ...(role && { role })
    });

    logger.info(`User updated by admin: ${user.email}`);

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: user.organization,
        isActive: user.isActive,
        role: user.role,
        updatedAt: user.updatedAt
      },
      message: 'User updated successfully'
    });

  } catch (error) {
    logger.error('Failed to update user:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/users/{userId}:
 *   delete:
 *     summary: Delete user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.delete('/:userId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const adminUserId = req.user.id;

    // Prevent admin from deleting themselves
    if (userId === adminUserId) {
      return res.status(400).json({
        error: {
          message: 'Cannot delete your own account',
          code: 'CANNOT_DELETE_SELF'
        }
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Soft delete - mark as inactive instead of hard delete
    await user.update({ isActive: false });

    logger.info(`User deactivated by admin: ${user.email}`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete user:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/users/{userId}/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 *       404:
 *         description: User not found
 */
router.get('/:userId/stats', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Users can only view their own stats unless they're admin
    if (userId !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'ACCESS_DENIED'
        }
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Get user statistics
    const [projectCount, templateCount, agentCount] = await Promise.all([
      Project.count({ where: { userId } }),
      Template.count({ where: { userId } }),
      Agent.count({ where: { userId } })
    ]);

    const stats = {
      userId: user.id,
      projects: {
        total: projectCount,
        active: await Project.count({ where: { userId, status: 'active' } }),
        completed: await Project.count({ where: { userId, status: 'completed' } })
      },
      templates: {
        total: templateCount,
        public: await Template.count({ where: { userId, public: true } }),
        private: await Template.count({ where: { userId, public: false } })
      },
      agents: {
        total: agentCount,
        active: await Agent.count({ where: { userId, status: 'active' } }),
        inactive: await Agent.count({ where: { userId, status: 'inactive' } })
      },
      account: {
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        emailVerified: user.emailVerified,
        isActive: user.isActive
      }
    };

    res.json({
      success: true,
      data: stats,
      message: 'User statistics retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get user stats:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/users/{userId}/activity:
 *   get:
 *     summary: Get user activity log
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of activities to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of activities to skip
 *     responses:
 *       200:
 *         description: User activity retrieved successfully
 *       404:
 *         description: User not found
 */
router.get('/:userId/activity', authenticateToken, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
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

    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const requestingUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Users can only view their own activity unless they're admin
    if (userId !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: {
          message: 'Access denied',
          code: 'ACCESS_DENIED'
        }
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    // Get recent activity (simplified - in a real app, you'd have an activity log table)
    const recentProjects = await Project.findAll({
      where: { userId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'type', 'status', 'createdAt', 'updatedAt']
    });

    const recentTemplates = await Template.findAll({
      where: { userId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'category', 'public', 'createdAt', 'updatedAt']
    });

    const recentAgents = await Agent.findAll({
      where: { userId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'type', 'status', 'createdAt', 'updatedAt']
    });

    const activity = {
      recentProjects,
      recentTemplates,
      recentAgents,
      lastLoginAt: user.lastLoginAt,
      accountCreatedAt: user.createdAt
    };

    res.json({
      success: true,
      data: activity,
      message: 'User activity retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get user activity:', error);
    next(error);
  }
});

module.exports = router;