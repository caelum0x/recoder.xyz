const express = require('express');
const { body, validationResult } = require('express-validator');
const { SyncState, Project, User } = require('../models/index');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/sync/status:
 *   get:
 *     summary: Get sync status for all data types
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 */
router.get('/status', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const syncStates = await SyncState.findAll({
      where: { userId },
      attributes: ['dataType', 'lastSyncAt', 'syncVersion', 'syncStatus', 'deviceSyncMap'],
      order: [['updatedAt', 'DESC']]
    });

    // Initialize default sync states if none exist
    const defaultDataTypes = ['projects', 'settings', 'history', 'preferences'];
    const existingDataTypes = syncStates.map(s => s.dataType);
    const missingDataTypes = defaultDataTypes.filter(dt => !existingDataTypes.includes(dt));

    // Create missing sync states
    for (const dataType of missingDataTypes) {
      const newSyncState = await SyncState.create({
        userId,
        dataType,
        syncVersion: 1,
        syncStatus: 'synced',
        deviceSyncMap: {}
      });
      syncStates.push(newSyncState);
    }

    res.json({
      success: true,
      data: syncStates,
      message: 'Sync status retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get sync status:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/sync/projects:
 *   post:
 *     summary: Sync projects data across platforms
 *     tags: [Sync]
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
 *                 description: Device ID initiating the sync
 *               localVersion:
 *                 type: integer
 *                 description: Local sync version
 *               projects:
 *                 type: array
 *                 description: Projects data to sync
 *     responses:
 *       200:
 *         description: Projects synced successfully
 */
router.post('/projects', authenticateToken, [
  body('deviceId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Device ID is required'),
  body('localVersion')
    .isInt({ min: 1 })
    .withMessage('Local version must be a positive integer'),
  body('projects')
    .optional()
    .isArray()
    .withMessage('Projects must be an array')
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
    const { deviceId, localVersion, projects } = req.body;

    // Get or create sync state for projects
    let syncState = await SyncState.findOne({
      where: { userId, dataType: 'projects' }
    });

    if (!syncState) {
      syncState = await SyncState.create({
        userId,
        dataType: 'projects',
        syncVersion: 1,
        syncStatus: 'synced',
        deviceSyncMap: {}
      });
    }

    // Check for conflicts
    const serverVersion = syncState.syncVersion;
    const deviceSyncMap = syncState.deviceSyncMap || {};

    if (localVersion < serverVersion) {
      // Client is behind, return server data
      const serverProjects = await Project.findAll({
        where: { userId },
        attributes: ['id', 'name', 'type', 'description', 'status', 'config', 'updatedAt']
      });

      return res.json({
        success: true,
        data: {
          projects: serverProjects,
          version: serverVersion,
          syncStatus: 'updated',
          conflicted: false
        },
        message: 'Projects updated from server'
      });
    }

    if (localVersion > serverVersion) {
      // Client is ahead, apply client changes
      if (projects && Array.isArray(projects)) {
        // Update projects in database
        for (const project of projects) {
          if (project.id) {
            // Update existing project
            await Project.update(
              {
                name: project.name,
                type: project.type,
                description: project.description,
                status: project.status,
                config: project.config
              },
              { where: { id: project.id, userId } }
            );
          } else {
            // Create new project
            await Project.create({
              ...project,
              userId
            });
          }
        }
      }

      // Update sync state
      const newVersion = serverVersion + 1;
      deviceSyncMap[deviceId] = newVersion;

      await syncState.update({
        syncVersion: newVersion,
        lastSyncAt: new Date(),
        deviceSyncMap,
        syncStatus: 'synced'
      });

      logger.info(`Projects synced for user ${req.user.email} from device ${deviceId}`);

      return res.json({
        success: true,
        data: {
          version: newVersion,
          syncStatus: 'synced',
          conflicted: false
        },
        message: 'Projects synced successfully'
      });
    }

    // Versions match, no sync needed
    deviceSyncMap[deviceId] = serverVersion;
    await syncState.update({ deviceSyncMap });

    res.json({
      success: true,
      data: {
        version: serverVersion,
        syncStatus: 'up_to_date',
        conflicted: false
      },
      message: 'Projects already up to date'
    });

  } catch (error) {
    logger.error('Projects sync failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/sync/settings:
 *   post:
 *     summary: Sync user settings across platforms
 *     tags: [Sync]
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
 *                 description: Device ID initiating the sync
 *               localVersion:
 *                 type: integer
 *                 description: Local sync version
 *               settings:
 *                 type: object
 *                 description: Settings data to sync
 *     responses:
 *       200:
 *         description: Settings synced successfully
 */
router.post('/settings', authenticateToken, [
  body('deviceId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Device ID is required'),
  body('localVersion')
    .isInt({ min: 1 })
    .withMessage('Local version must be a positive integer'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object')
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
    const { deviceId, localVersion, settings } = req.body;

    // Get or create sync state for settings
    let syncState = await SyncState.findOne({
      where: { userId, dataType: 'settings' }
    });

    if (!syncState) {
      syncState = await SyncState.create({
        userId,
        dataType: 'settings',
        syncVersion: 1,
        syncStatus: 'synced',
        deviceSyncMap: {}
      });
    }

    const serverVersion = syncState.syncVersion;
    const deviceSyncMap = syncState.deviceSyncMap || {};

    // Get current user settings
    const user = await User.findByPk(userId);
    const currentSettings = {
      name: user.name,
      organization: user.organization,
      subscription: user.subscription,
      // Add other user settings as needed
    };

    if (localVersion < serverVersion) {
      // Client is behind, return server data
      return res.json({
        success: true,
        data: {
          settings: currentSettings,
          version: serverVersion,
          syncStatus: 'updated',
          conflicted: false
        },
        message: 'Settings updated from server'
      });
    }

    if (localVersion > serverVersion && settings) {
      // Client is ahead, apply client changes
      await user.update({
        ...(settings.name && { name: settings.name }),
        ...(settings.organization !== undefined && { organization: settings.organization })
      });

      // Update sync state
      const newVersion = serverVersion + 1;
      deviceSyncMap[deviceId] = newVersion;

      await syncState.update({
        syncVersion: newVersion,
        lastSyncAt: new Date(),
        deviceSyncMap,
        syncStatus: 'synced'
      });

      logger.info(`Settings synced for user ${req.user.email} from device ${deviceId}`);

      return res.json({
        success: true,
        data: {
          version: newVersion,
          syncStatus: 'synced',
          conflicted: false
        },
        message: 'Settings synced successfully'
      });
    }

    // Versions match, no sync needed
    deviceSyncMap[deviceId] = serverVersion;
    await syncState.update({ deviceSyncMap });

    res.json({
      success: true,
      data: {
        settings: currentSettings,
        version: serverVersion,
        syncStatus: 'up_to_date',
        conflicted: false
      },
      message: 'Settings already up to date'
    });

  } catch (error) {
    logger.error('Settings sync failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/sync/resolve-conflicts:
 *   post:
 *     summary: Resolve sync conflicts
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dataType:
 *                 type: string
 *                 enum: [projects, settings, history, preferences]
 *               resolution:
 *                 type: string
 *                 enum: [server_wins, client_wins, merge]
 *               deviceId:
 *                 type: string
 *               resolvedData:
 *                 type: object
 *                 description: Resolved data (required for merge resolution)
 *     responses:
 *       200:
 *         description: Conflicts resolved successfully
 */
router.post('/resolve-conflicts', authenticateToken, [
  body('dataType')
    .isIn(['projects', 'settings', 'history', 'preferences'])
    .withMessage('Data type must be one of: projects, settings, history, preferences'),
  body('resolution')
    .isIn(['server_wins', 'client_wins', 'merge'])
    .withMessage('Resolution must be one of: server_wins, client_wins, merge'),
  body('deviceId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Device ID is required'),
  body('resolvedData')
    .optional()
    .isObject()
    .withMessage('Resolved data must be an object')
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
    const { dataType, resolution, deviceId, resolvedData } = req.body;

    const syncState = await SyncState.findOne({
      where: { userId, dataType }
    });

    if (!syncState || syncState.syncStatus !== 'conflicted') {
      return res.status(400).json({
        error: {
          message: 'No conflicts found for this data type',
          code: 'NO_CONFLICTS'
        }
      });
    }

    let newVersion = syncState.syncVersion + 1;
    const deviceSyncMap = syncState.deviceSyncMap || {};
    deviceSyncMap[deviceId] = newVersion;

    if (resolution === 'merge' && resolvedData) {
      // Apply merged data based on data type
      if (dataType === 'settings') {
        const user = await User.findByPk(userId);
        await user.update({
          ...(resolvedData.name && { name: resolvedData.name }),
          ...(resolvedData.organization !== undefined && { organization: resolvedData.organization })
        });
      }
      // Add handling for other data types as needed
    }

    // Update sync state
    await syncState.update({
      syncVersion: newVersion,
      lastSyncAt: new Date(),
      syncStatus: 'synced',
      conflictData: null,
      deviceSyncMap
    });

    logger.info(`Sync conflicts resolved for ${dataType} by user ${req.user.email}`);

    res.json({
      success: true,
      data: {
        version: newVersion,
        syncStatus: 'synced'
      },
      message: 'Conflicts resolved successfully'
    });

  } catch (error) {
    logger.error('Conflict resolution failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/sync/force-sync:
 *   post:
 *     summary: Force sync all data for a device
 *     tags: [Sync]
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
 *                 description: Device ID requesting force sync
 *     responses:
 *       200:
 *         description: Force sync completed successfully
 */
router.post('/force-sync', authenticateToken, [
  body('deviceId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Device ID is required')
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
    const { deviceId } = req.body;

    // Get all sync states
    const syncStates = await SyncState.findAll({
      where: { userId }
    });

    // Get all user data
    const [user, projects] = await Promise.all([
      User.findByPk(userId, {
        attributes: ['name', 'organization', 'subscription']
      }),
      Project.findAll({
        where: { userId },
        attributes: ['id', 'name', 'type', 'description', 'status', 'config', 'updatedAt']
      })
    ]);

    const syncData = {
      settings: {
        name: user.name,
        organization: user.organization,
        subscription: user.subscription
      },
      projects: projects,
      history: [], // TODO: Implement history sync
      preferences: {} // TODO: Implement preferences sync
    };

    // Update device sync map for all data types
    const updates = syncStates.map(syncState => {
      const deviceSyncMap = syncState.deviceSyncMap || {};
      deviceSyncMap[deviceId] = syncState.syncVersion;
      
      return syncState.update({
        deviceSyncMap,
        lastSyncAt: new Date(),
        syncStatus: 'synced'
      });
    });

    await Promise.all(updates);

    logger.info(`Force sync completed for user ${req.user.email} device ${deviceId}`);

    res.json({
      success: true,
      data: {
        syncData,
        versions: syncStates.reduce((acc, state) => {
          acc[state.dataType] = state.syncVersion;
          return acc;
        }, {})
      },
      message: 'Force sync completed successfully'
    });

  } catch (error) {
    logger.error('Force sync failed:', error);
    next(error);
  }
});

module.exports = router;