const express = require('express');
const { body, validationResult } = require('express-validator');
const { UserDevice } = require('../models/index');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

/**
 * @swagger
 * /api/devices/register:
 *   post:
 *     summary: Register a new device for cross-platform sync
 *     tags: [Devices]
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
 *                 description: User-friendly device name
 *               deviceType:
 *                 type: string
 *                 enum: [web, cli, extension, mobile, desktop]
 *                 description: Type of device/platform
 *               platform:
 *                 type: string
 *                 description: Platform details (windows, macos, linux, android, ios, browser)
 *               deviceId:
 *                 type: string
 *                 description: Unique device identifier
 *               pushToken:
 *                 type: string
 *                 description: Push notification token (optional)
 *     responses:
 *       201:
 *         description: Device registered successfully
 *       400:
 *         description: Device already registered or validation error
 */
router.post('/register', authenticateToken, [
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device name is required and must be less than 100 characters'),
  body('deviceType')
    .isIn(['web', 'cli', 'extension', 'mobile', 'desktop'])
    .withMessage('Device type must be one of: web, cli, extension, mobile, desktop'),
  body('platform')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Platform is required and must be less than 50 characters'),
  body('deviceId')
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('Device ID is required and must be less than 255 characters'),
  body('pushToken')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Push token must be less than 500 characters')
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

    const userId = req.user.id;
    const { name, deviceType, platform, deviceId, pushToken } = req.body;

    // Check if device is already registered for this user
    const existingDevice = await UserDevice.findOne({
      where: { userId, deviceId }
    });

    if (existingDevice) {
      // Update existing device instead of creating new one
      await existingDevice.update({
        name,
        deviceType,
        platform,
        pushToken,
        lastActiveAt: new Date(),
        isActive: true
      });

      logger.info(`Device updated for user ${req.user.email}: ${name} (${deviceType})`);

      return res.json({
        success: true,
        data: {
          id: existingDevice.id,
          name: existingDevice.name,
          deviceType: existingDevice.deviceType,
          platform: existingDevice.platform,
          deviceId: existingDevice.deviceId,
          lastActiveAt: existingDevice.lastActiveAt,
          isActive: existingDevice.isActive,
          createdAt: existingDevice.createdAt,
          updatedAt: existingDevice.updatedAt
        },
        message: 'Device updated successfully'
      });
    }

    // Create new device
    const device = await UserDevice.create({
      userId,
      name,
      deviceType,
      platform,
      deviceId,
      pushToken,
      metadata: {}
    });

    logger.info(`Device registered for user ${req.user.email}: ${name} (${deviceType})`);

    res.status(201).json({
      success: true,
      data: {
        id: device.id,
        name: device.name,
        deviceType: device.deviceType,
        platform: device.platform,
        deviceId: device.deviceId,
        lastActiveAt: device.lastActiveAt,
        isActive: device.isActive,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt
      },
      message: 'Device registered successfully'
    });

  } catch (error) {
    logger.error('Device registration failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/devices:
 *   get:
 *     summary: Get all registered devices for the user
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Devices retrieved successfully
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const devices = await UserDevice.findAll({
      where: { userId, isActive: true },
      attributes: ['id', 'name', 'deviceType', 'platform', 'lastActiveAt', 'createdAt', 'updatedAt'],
      order: [['lastActiveAt', 'DESC']]
    });

    res.json({
      success: true,
      data: devices,
      message: 'Devices retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get devices:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/devices/{deviceId}/heartbeat:
 *   post:
 *     summary: Send device heartbeat to update last active time
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: object
 *                 description: Optional device metadata
 *     responses:
 *       200:
 *         description: Heartbeat recorded successfully
 *       404:
 *         description: Device not found
 */
router.post('/:deviceId/heartbeat', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;
    const { metadata } = req.body;

    const device = await UserDevice.findOne({
      where: { userId, deviceId, isActive: true }
    });

    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        }
      });
    }

    // Update last active time and metadata
    await device.update({
      lastActiveAt: new Date(),
      ...(metadata && { metadata })
    });

    res.json({
      success: true,
      data: {
        lastActiveAt: device.lastActiveAt
      },
      message: 'Heartbeat recorded successfully'
    });

  } catch (error) {
    logger.error('Device heartbeat failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/devices/{deviceId}:
 *   put:
 *     summary: Update device information
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Device name
 *               pushToken:
 *                 type: string
 *                 description: Push notification token
 *     responses:
 *       200:
 *         description: Device updated successfully
 *       404:
 *         description: Device not found
 */
router.put('/:deviceId', authenticateToken, [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device name must be less than 100 characters'),
  body('pushToken')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Push token must be less than 500 characters')
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

    const userId = req.user.id;
    const { deviceId } = req.params;
    const { name, pushToken } = req.body;

    const device = await UserDevice.findOne({
      where: { userId, deviceId, isActive: true }
    });

    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        }
      });
    }

    // Update device
    await device.update({
      ...(name && { name }),
      ...(pushToken !== undefined && { pushToken })
    });

    logger.info(`Device updated for user ${req.user.email}: ${device.name}`);

    res.json({
      success: true,
      data: {
        id: device.id,
        name: device.name,
        deviceType: device.deviceType,
        platform: device.platform,
        lastActiveAt: device.lastActiveAt,
        updatedAt: device.updatedAt
      },
      message: 'Device updated successfully'
    });

  } catch (error) {
    logger.error('Device update failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/devices/{deviceId}:
 *   delete:
 *     summary: Deactivate/remove a device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     responses:
 *       200:
 *         description: Device removed successfully
 *       404:
 *         description: Device not found
 */
router.delete('/:deviceId', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;

    const device = await UserDevice.findOne({
      where: { userId, deviceId, isActive: true }
    });

    if (!device) {
      return res.status(404).json({
        error: {
          message: 'Device not found',
          code: 'DEVICE_NOT_FOUND'
        }
      });
    }

    // Deactivate device instead of deleting
    await device.update({ isActive: false });

    logger.info(`Device removed for user ${req.user.email}: ${device.name}`);

    res.json({
      success: true,
      message: 'Device removed successfully'
    });

  } catch (error) {
    logger.error('Device removal failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/devices/generate-id:
 *   post:
 *     summary: Generate a unique device ID for registration
 *     tags: [Devices]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deviceType:
 *                 type: string
 *                 enum: [web, cli, extension, mobile, desktop]
 *               platform:
 *                 type: string
 *     responses:
 *       200:
 *         description: Device ID generated successfully
 */
router.post('/generate-id', [
  body('deviceType')
    .isIn(['web', 'cli', 'extension', 'mobile', 'desktop'])
    .withMessage('Device type must be one of: web, cli, extension, mobile, desktop'),
  body('platform')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Platform is required')
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

    const { deviceType, platform } = req.body;
    
    // Generate unique device ID
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    const deviceId = `${deviceType}-${platform}-${timestamp}-${random}`;

    res.json({
      success: true,
      data: {
        deviceId,
        deviceType,
        platform
      },
      message: 'Device ID generated successfully'
    });

  } catch (error) {
    logger.error('Device ID generation failed:', error);
    next(error);
  }
});

module.exports = router;