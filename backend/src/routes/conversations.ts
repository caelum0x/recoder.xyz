const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/conversations:
 *   get:
 *     summary: Get all conversations for authenticated user
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of conversations to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of conversations to skip
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 */
router.get('/', authenticate, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
], async (req: any, res: any, next: any) => {
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

    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user.id;

    // For now, return mock data until chat tables are fully synced
    const conversations = [
      {
        id: 'conv-1',
        title: 'Chat about React components',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 5,
        lastMessage: 'How can I optimize my React components?',
        visibility: 'private'
      },
      {
        id: 'conv-2', 
        title: 'AI code generation discussion',
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        messageCount: 12,
        lastMessage: 'Generate a complete Next.js application',
        visibility: 'private'
      }
    ];

    res.json({
      success: true,
      data: {
        conversations: conversations.slice(offset, offset + limit),
        pagination: {
          total: conversations.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages: Math.ceil(conversations.length / limit)
        }
      },
      message: 'Conversations retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get conversations:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/conversations:
 *   post:
 *     summary: Create a new conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Conversation title
 *               visibility:
 *                 type: string
 *                 enum: [private, public]
 *                 description: Conversation visibility
 *     responses:
 *       201:
 *         description: Conversation created successfully
 *       400:
 *         description: Invalid input
 */
router.post('/', authenticate, [
  body('title')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('visibility')
    .optional()
    .isIn(['private', 'public'])
    .withMessage('Visibility must be either private or public')
], async (req: any, res: any, next: any) => {
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

    const { title, visibility = 'private' } = req.body;
    const userId = req.user.id;

    // For now, return mock data
    const conversation = {
      id: `conv-${Date.now()}`,
      title,
      visibility,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0
    };

    logger.info(`Conversation created: ${conversation.id} by user: ${userId}`);

    res.status(201).json({
      success: true,
      data: conversation,
      message: 'Conversation created successfully'
    });

  } catch (error) {
    logger.error('Failed to create conversation:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/conversations/{conversationId}:
 *   get:
 *     summary: Get conversation by ID
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully
 *       404:
 *         description: Conversation not found
 */
router.get('/:conversationId', authenticate, [
  param('conversationId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Conversation ID is required')
], async (req: any, res: any, next: any) => {
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

    const { conversationId } = req.params;
    const userId = req.user.id;

    // For now, return mock data
    const conversation = {
      id: conversationId,
      title: 'Mock Conversation',
      visibility: 'private',
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 3,
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello, I need help with React',
          createdAt: new Date(Date.now() - 120000).toISOString()
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I\'d be happy to help you with React! What specific aspect would you like to learn about?',
          createdAt: new Date(Date.now() - 60000).toISOString()
        },
        {
          id: 'msg-3',
          role: 'user',
          content: 'How do I optimize component rendering?',
          createdAt: new Date().toISOString()
        }
      ]
    };

    res.json({
      success: true,
      data: conversation,
      message: 'Conversation retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get conversation:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/conversations/{conversationId}/messages:
 *   post:
 *     summary: Add message to conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, assistant, system]
 *                 description: Message role
 *               content:
 *                 type: string
 *                 description: Message content
 *               metadata:
 *                 type: object
 *                 description: Additional message metadata
 *     responses:
 *       201:
 *         description: Message added successfully
 *       404:
 *         description: Conversation not found
 */
router.post('/:conversationId/messages', authenticate, [
  param('conversationId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Conversation ID is required'),
  body('role')
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Role must be one of: user, assistant, system'),
  body('content')
    .isString()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Content must be between 1 and 10000 characters'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
], async (req: any, res: any, next: any) => {
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

    const { conversationId } = req.params;
    const { role, content, metadata } = req.body;
    const userId = req.user.id;

    // For now, return mock data
    const message = {
      id: `msg-${Date.now()}`,
      conversationId,
      role,
      content,
      metadata: metadata || {},
      userId,
      createdAt: new Date().toISOString()
    };

    logger.info(`Message added to conversation: ${conversationId} by user: ${userId}`);

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message added successfully'
    });

  } catch (error) {
    logger.error('Failed to add message:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/conversations/sync:
 *   post:
 *     summary: Sync conversation data between chat platform and backend
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [sync_conversations, sync_messages, full_sync]
 *                 description: Sync action type
 *               data:
 *                 type: object
 *                 description: Data to sync
 *     responses:
 *       200:
 *         description: Sync completed successfully
 */
router.post('/sync', authenticate, [
  body('action')
    .isIn(['sync_conversations', 'sync_messages', 'full_sync'])
    .withMessage('Action must be one of: sync_conversations, sync_messages, full_sync'),
  body('data')
    .optional()
    .isObject()
    .withMessage('Data must be an object')
], async (req: any, res: any, next: any) => {
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

    const { action, data } = req.body;
    const userId = req.user.id;

    logger.info(`Conversation sync requested: ${action} by user: ${userId}`);

    // For now, return success response
    res.json({
      success: true,
      data: {
        action,
        syncedAt: new Date().toISOString(),
        status: 'completed'
      },
      message: 'Sync completed successfully'
    });

  } catch (error) {
    logger.error('Failed to sync conversations:', error);
    next(error);
  }
});

module.exports = router;