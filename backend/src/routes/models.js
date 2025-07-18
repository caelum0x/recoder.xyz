const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { modelService } = require('../services/modelService');

const router = express.Router();

/**
 * @swagger
 * /api/models:
 *   get:
 *     summary: Get all available AI models
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [openai, anthropic, mistral, ollama]
 *         description: Filter by AI provider
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [chat, code, embedding, image]
 *         description: Filter by model type
 *       - in: query
 *         name: available
 *         schema:
 *           type: boolean
 *         description: Filter by availability
 *     responses:
 *       200:
 *         description: Models retrieved successfully
 */
router.get('/', authenticateToken, [
  query('provider')
    .optional()
    .isIn(['openai', 'anthropic', 'mistral', 'ollama'])
    .withMessage('Provider must be one of: openai, anthropic, mistral, ollama'),
  query('type')
    .optional()
    .isIn(['chat', 'code', 'embedding', 'image'])
    .withMessage('Type must be one of: chat, code, embedding, image'),
  query('available')
    .optional()
    .isBoolean()
    .withMessage('Available must be a boolean')
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

    const { provider, type, available } = req.query;
    const userId = req.user.id;

    const models = await modelService.getAvailableModels({
      provider,
      type,
      available,
      userId
    });

    res.json({
      success: true,
      data: models,
      message: 'Models retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get models:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/models/{modelId}:
 *   get:
 *     summary: Get model details
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Model ID
 *     responses:
 *       200:
 *         description: Model details retrieved successfully
 *       404:
 *         description: Model not found
 */
router.get('/:modelId', authenticateToken, [
  param('modelId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Model ID is required')
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

    const { modelId } = req.params;
    const userId = req.user.id;

    const model = await modelService.getModelDetails(modelId, userId);

    if (!model) {
      return res.status(404).json({
        error: {
          message: 'Model not found',
          code: 'MODEL_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: model,
      message: 'Model details retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get model details:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/models/{modelId}/chat:
 *   post:
 *     summary: Chat with AI model
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Model ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                     content:
 *                       type: string
 *                 description: Chat messages
 *               options:
 *                 type: object
 *                 properties:
 *                   temperature:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 2
 *                   maxTokens:
 *                     type: integer
 *                     minimum: 1
 *                   stream:
 *                     type: boolean
 *                 description: Chat options
 *     responses:
 *       200:
 *         description: Chat response received
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Model not found
 */
router.post('/:modelId/chat', authenticateToken, [
  param('modelId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Model ID is required'),
  body('messages')
    .isArray({ min: 1 })
    .withMessage('Messages must be a non-empty array'),
  body('messages.*.role')
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Message role must be one of: user, assistant, system'),
  body('messages.*.content')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Message content is required'),
  body('options')
    .optional()
    .isObject()
    .withMessage('Options must be an object'),
  body('options.temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  body('options.maxTokens')
    .optional()
    .isInt({ min: 1 })
    .withMessage('MaxTokens must be a positive integer'),
  body('options.stream')
    .optional()
    .isBoolean()
    .withMessage('Stream must be a boolean')
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

    const { modelId } = req.params;
    const { messages, options } = req.body;
    const userId = req.user.id;

    const model = await modelService.getModelDetails(modelId, userId);
    if (!model) {
      return res.status(404).json({
        error: {
          message: 'Model not found',
          code: 'MODEL_NOT_FOUND'
        }
      });
    }

    if (!model.available) {
      return res.status(400).json({
        error: {
          message: 'Model is not available',
          code: 'MODEL_NOT_AVAILABLE'
        }
      });
    }

    const response = await modelService.chatWithModel(modelId, messages, options, userId);

    logger.info(`Chat with model: ${modelId} by user: ${userId}`);

    res.json({
      success: true,
      data: response,
      message: 'Chat response received'
    });

  } catch (error) {
    logger.error('Failed to chat with model:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/models/{modelId}/code:
 *   post:
 *     summary: Generate code using AI model
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Model ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Code generation prompt
 *               language:
 *                 type: string
 *                 description: Programming language
 *               context:
 *                 type: object
 *                 description: Additional context
 *               options:
 *                 type: object
 *                 description: Generation options
 *     responses:
 *       200:
 *         description: Code generated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Model not found
 */
router.post('/:modelId/code', authenticateToken, [
  param('modelId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Model ID is required'),
  body('prompt')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Prompt is required'),
  body('language')
    .optional()
    .isString()
    .withMessage('Language must be a string'),
  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object'),
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

    const { modelId } = req.params;
    const { prompt, language, context, options } = req.body;
    const userId = req.user.id;

    const model = await modelService.getModelDetails(modelId, userId);
    if (!model) {
      return res.status(404).json({
        error: {
          message: 'Model not found',
          code: 'MODEL_NOT_FOUND'
        }
      });
    }

    if (!model.available || model.type !== 'code') {
      return res.status(400).json({
        error: {
          message: 'Model is not available for code generation',
          code: 'MODEL_NOT_AVAILABLE'
        }
      });
    }

    const generatedCode = await modelService.generateCode(modelId, {
      prompt,
      language,
      context,
      options
    }, userId);

    logger.info(`Code generated using model: ${modelId} by user: ${userId}`);

    res.json({
      success: true,
      data: generatedCode,
      message: 'Code generated successfully'
    });

  } catch (error) {
    logger.error('Failed to generate code:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/models/{modelId}/embedding:
 *   post:
 *     summary: Generate text embeddings
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Model ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: Text to embed
 *               options:
 *                 type: object
 *                 description: Embedding options
 *     responses:
 *       200:
 *         description: Embeddings generated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Model not found
 */
router.post('/:modelId/embedding', authenticateToken, [
  param('modelId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Model ID is required'),
  body('text')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Text is required'),
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

    const { modelId } = req.params;
    const { text, options } = req.body;
    const userId = req.user.id;

    const model = await modelService.getModelDetails(modelId, userId);
    if (!model) {
      return res.status(404).json({
        error: {
          message: 'Model not found',
          code: 'MODEL_NOT_FOUND'
        }
      });
    }

    if (!model.available || model.type !== 'embedding') {
      return res.status(400).json({
        error: {
          message: 'Model is not available for embeddings',
          code: 'MODEL_NOT_AVAILABLE'
        }
      });
    }

    const embeddings = await modelService.generateEmbeddings(modelId, text, options, userId);

    logger.info(`Embeddings generated using model: ${modelId} by user: ${userId}`);

    res.json({
      success: true,
      data: embeddings,
      message: 'Embeddings generated successfully'
    });

  } catch (error) {
    logger.error('Failed to generate embeddings:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/models/{modelId}/status:
 *   get:
 *     summary: Get model status
 *     tags: [Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Model ID
 *     responses:
 *       200:
 *         description: Model status retrieved successfully
 *       404:
 *         description: Model not found
 */
router.get('/:modelId/status', authenticateToken, [
  param('modelId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Model ID is required')
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

    const { modelId } = req.params;
    const userId = req.user.id;

    const status = await modelService.getModelStatus(modelId, userId);

    if (!status) {
      return res.status(404).json({
        error: {
          message: 'Model not found',
          code: 'MODEL_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: status,
      message: 'Model status retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get model status:', error);
    next(error);
  }
});

module.exports = router;