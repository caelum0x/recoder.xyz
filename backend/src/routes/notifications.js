const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/notifications/send:
 *   post:
 *     summary: Send a notification to a user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Target user ID (optional, defaults to current user)
 *               type:
 *                 type: string
 *                 enum: [info, success, warning, error, system]
 *               title:
 *                 type: string
 *                 description: Notification title
 *               message:
 *                 type: string
 *                 description: Notification message
 *               data:
 *                 type: object
 *                 description: Additional notification data
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Notification channels
 *     responses:
 *       200:
 *         description: Notification sent successfully
 */
router.post('/send', authenticate, [
  body('type')
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Type must be one of: info, success, warning, error, system'),
  body('title')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),
  body('message')
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message is required and must be less than 500 characters'),
  body('data')
    .optional()
    .isObject()
    .withMessage('Data must be an object'),
  body('channels')
    .optional()
    .isArray()
    .withMessage('Channels must be an array')
], (req, res, next) => {
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

    const { userId: targetUserId, type, title, message, data = {}, channels = [] } = req.body;
    const userId = targetUserId || req.user.id;

    const notification = {
      id: Date.now().toString(),
      type,
      title,
      message,
      data,
      channels,
      sentBy: req.user.id,
      timestamp: new Date()
    };

    // Get server instance from app (set during server initialization)
    const server = req.app.get('server');
    
    if (server && server.sendNotification) {
      const sent = server.sendNotification(userId, notification);
      
      if (sent) {
        logger.info(`Notification sent to user ${userId}: ${title}`);
        res.json({
          success: true,
          data: {
            notificationId: notification.id,
            userId,
            delivered: true
          },
          message: 'Notification sent successfully'
        });
      } else {
        res.json({
          success: true,
          data: {
            notificationId: notification.id,
            userId,
            delivered: false
          },
          message: 'Notification queued (user not connected)'
        });
      }
    } else {
      res.status(500).json({
        error: {
          message: 'WebSocket service not available',
          code: 'SERVICE_UNAVAILABLE'
        }
      });
    }

  } catch (error) {
    logger.error('Failed to send notification:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/notifications/broadcast:
 *   post:
 *     summary: Broadcast a notification to a channel
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel:
 *                 type: string
 *                 description: Channel to broadcast to
 *               event:
 *                 type: string
 *                 description: Event name
 *               type:
 *                 type: string
 *                 enum: [info, success, warning, error, system]
 *               title:
 *                 type: string
 *                 description: Notification title
 *               message:
 *                 type: string
 *                 description: Notification message
 *               data:
 *                 type: object
 *                 description: Additional data
 *     responses:
 *       200:
 *         description: Broadcast sent successfully
 */
router.post('/broadcast', authenticate, [
  body('channel')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Channel is required and must be less than 50 characters'),
  body('event')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Event is required and must be less than 50 characters'),
  body('type')
    .isIn(['info', 'success', 'warning', 'error', 'system'])
    .withMessage('Type must be one of: info, success, warning, error, system'),
  body('title')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title is required and must be less than 100 characters'),
  body('message')
    .isString()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message is required and must be less than 500 characters')
], (req, res, next) => {
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

    const { channel, event, type, title, message, data = {} } = req.body;

    const broadcastData = {
      type,
      title,
      message,
      data,
      sentBy: req.user.id,
      timestamp: new Date()
    };

    // Get server instance
    const server = req.app.get('server');
    
    if (server && server.broadcastToChannel) {
      server.broadcastToChannel(channel, event, broadcastData);
      
      logger.info(`Broadcast sent to channel ${channel}: ${event}`);
      
      res.json({
        success: true,
        data: {
          channel,
          event,
          broadcastId: Date.now().toString()
        },
        message: 'Broadcast sent successfully'
      });
    } else {
      res.status(500).json({
        error: {
          message: 'WebSocket service not available',
          code: 'SERVICE_UNAVAILABLE'
        }
      });
    }

  } catch (error) {
    logger.error('Failed to send broadcast:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/notifications/device:
 *   post:
 *     summary: Send a notification to a specific device
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deviceId:
 *                 type: string
 *                 description: Target device ID
 *               event:
 *                 type: string
 *                 description: Event name
 *               data:
 *                 type: object
 *                 description: Event data
 *     responses:
 *       200:
 *         description: Device notification sent successfully
 */
router.post('/device', authenticate, [
  body('deviceId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Device ID is required'),
  body('event')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Event is required'),
  body('data')
    .optional()
    .isObject()
    .withMessage('Data must be an object')
], (req, res, next) => {
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

    const { deviceId, event, data = {} } = req.body;

    const eventData = {
      ...data,
      sentBy: req.user.id,
      timestamp: new Date()
    };

    // Get server instance
    const server = req.app.get('server');
    
    if (server && server.sendToDevice) {
      const sent = server.sendToDevice(deviceId, event, eventData);
      
      if (sent) {
        logger.info(`Device notification sent to ${deviceId}: ${event}`);
        res.json({
          success: true,
          data: {
            deviceId,
            event,
            delivered: true
          },
          message: 'Device notification sent successfully'
        });
      } else {
        res.json({
          success: true,
          data: {
            deviceId,
            event,
            delivered: false
          },
          message: 'Device notification queued (device not connected)'
        });
      }
    } else {
      res.status(500).json({
        error: {
          message: 'WebSocket service not available',
          code: 'SERVICE_UNAVAILABLE'
        }
      });
    }

  } catch (error) {
    logger.error('Failed to send device notification:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/notifications/status:
 *   get:
 *     summary: Get notification system status
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification status retrieved successfully
 */
router.get('/status', authenticate, (req, res, next) => {
  try {
    // Get server instance
    const server = req.app.get('server');
    
    if (server && server.getConnectedUsers) {
      const connectedUsers = server.getConnectedUsers();
      
      const status = {
        serviceActive: true,
        connectedUsers: connectedUsers.length,
        totalDevices: connectedUsers.reduce((sum, user) => sum + user.devices.length, 0),
        userDevices: connectedUsers.map(user => ({
          userId: user.userId,
          deviceCount: user.devices.length,
          platforms: [...new Set(user.devices.map(d => d.platform))]
        })),
        timestamp: new Date()
      };

      res.json({
        success: true,
        data: status,
        message: 'Notification status retrieved successfully'
      });
    } else {
      res.json({
        success: false,
        data: {
          serviceActive: false,
          connectedUsers: 0,
          totalDevices: 0,
          timestamp: new Date()
        },
        message: 'WebSocket service not available'
      });
    }

  } catch (error) {
    logger.error('Failed to get notification status:', error);
    next(error);
  }
});

module.exports = router;