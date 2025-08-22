const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, ApiKey, UsageRecord } = require('../models');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * CLI Device Flow Authentication
 * Step 1: Generate device code for CLI
 */
router.post('/device/code', async (req, res, next) => {
  try {
    const deviceCode = crypto.randomBytes(32).toString('hex');
    const userCode = crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 8);
    const verificationUri = `${process.env.NEXT_PUBLIC_WEB_URL || 'https://recoder.xyz'}/auth/device`;
    const verificationUriComplete = `${verificationUri}?user_code=${userCode}`;
    
    // Store device code temporarily (5 minutes)
    const deviceData = {
      deviceCode,
      userCode,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      status: 'pending'
    };
    
    // In production, use Redis for this
    // For now, store in memory (you'd want to use a cache service)
    global.deviceCodes = global.deviceCodes || new Map();
    global.deviceCodes.set(deviceCode, deviceData);
    
    logger.info('Generated device code for CLI authentication', { deviceCode, userCode });
    
    res.json({
      success: true,
      data: {
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: verificationUri,
        verification_uri_complete: verificationUriComplete,
        expires_in: 300, // 5 minutes
        interval: 5 // Poll every 5 seconds
      }
    });
    
  } catch (error) {
    logger.error('Device code generation failed:', error);
    next(error);
  }
});

/**
 * CLI Device Flow Authentication
 * Step 2: Web app confirms device code
 */
router.post('/device/authorize', authenticateToken, async (req, res, next) => {
  try {
    const { userCode } = req.body;
    const userId = req.user.id;
    
    if (!userCode) {
      return res.status(400).json({
        error: { message: 'User code is required', code: 'MISSING_USER_CODE' }
      });
    }
    
    // Log authentication attempt for monitoring
    logger.info('CLI device authorization attempt', { userId, userCode: userCode.substring(0, 4) + '****' });
    
    // Find device code by user code
    global.deviceCodes = global.deviceCodes || new Map();
    let deviceData = null;
    let deviceCode = null;
    
    for (const [code, data] of global.deviceCodes.entries()) {
      if (data.userCode === userCode.toUpperCase()) {
        deviceCode = code;
        deviceData = data;
        break;
      }
    }
    
    if (!deviceData || deviceData.expiresAt < new Date()) {
      return res.status(400).json({
        error: { message: 'Invalid or expired user code', code: 'INVALID_USER_CODE' }
      });
    }
    
    // Mark as authorized
    deviceData.status = 'authorized';
    deviceData.userId = userId;
    global.deviceCodes.set(deviceCode, deviceData);
    
    logger.info('Device code authorized', { deviceCode, userId, userCode });
    
    res.json({
      success: true,
      message: 'Device authorized successfully'
    });
    
  } catch (error) {
    logger.error('Device authorization failed:', error);
    next(error);
  }
});

/**
 * CLI Device Flow Authentication
 * Step 3: CLI polls for token
 */
router.post('/device/token', async (req, res, next) => {
  try {
    const { device_code } = req.body;
    
    if (!device_code) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'device_code is required'
      });
    }
    
    global.deviceCodes = global.deviceCodes || new Map();
    const deviceData = global.deviceCodes.get(device_code);
    
    if (!deviceData || deviceData.expiresAt < new Date()) {
      return res.status(400).json({
        error: 'expired_token',
        error_description: 'The device code has expired'
      });
    }
    
    if (deviceData.status === 'pending') {
      return res.status(400).json({
        error: 'authorization_pending',
        error_description: 'User has not yet authorized the device'
      });
    }
    
    if (deviceData.status !== 'authorized') {
      return res.status(400).json({
        error: 'access_denied',
        error_description: 'Device authorization was denied'
      });
    }
    
    // Generate API key for CLI
    const user = await User.findByPk(deviceData.userId);
    if (!user) {
      return res.status(404).json({
        error: 'invalid_grant',
        error_description: 'User not found'
      });
    }
    
    // Create or update API key for CLI
    const keyPrefix = `reco_${crypto.randomBytes(4).toString('hex')}`;
    const keySecret = crypto.randomBytes(32).toString('hex');
    const fullKey = `${keyPrefix}_${keySecret}`;
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    
    await ApiKey.upsert({
      userId: user.id,
      name: 'CLI Access',
      keyPrefix,
      keyHash,
      permissions: ['ai:generate', 'projects:read', 'projects:write'],
      rateLimit: { requestsPerMinute: 60, tokensPerMinute: 50000 },
      metadata: { source: 'device_flow', deviceCode: device_code.substring(0, 8) },
      isActive: true,
      expiresAt: null // CLI keys don't expire
    }, {
      where: { userId: user.id, name: 'CLI Access' }
    });
    
    // Clean up device code
    global.deviceCodes.delete(device_code);
    
    logger.info('CLI API key generated successfully', { userId: user.id, keyPrefix });
    
    res.json({
      access_token: fullKey,
      token_type: 'Bearer',
      scope: 'ai:generate projects:read projects:write',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.subscription
      }
    });
    
  } catch (error) {
    logger.error('Device token generation failed:', error);
    next(error);
  }
});

/**
 * CLI Quick Registration
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').isLength({ min: 2 }).withMessage('Name is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array() }
      });
    }

    const { email, password, name } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        error: { message: 'Email already registered', code: 'EMAIL_EXISTS' }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with free subscription
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      subscription: 'free',
      isActive: true,
      emailVerified: true // CLI users are auto-verified
    });

    // Generate CLI API key
    const keyPrefix = `reco_${crypto.randomBytes(4).toString('hex')}`;
    const keySecret = crypto.randomBytes(32).toString('hex');
    const fullKey = `${keyPrefix}_${keySecret}`;
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    
    await ApiKey.create({
      userId: user.id,
      name: 'CLI Access',
      keyPrefix,
      keyHash,
      permissions: ['ai:generate', 'projects:read', 'projects:write'],
      rateLimit: { requestsPerMinute: 20, tokensPerMinute: 5000 }, // Free tier limits
      metadata: { source: 'cli_registration' },
      isActive: true
    });

    logger.info(`CLI user registered successfully: ${email}`);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: user.subscription
        },
        apiKey: fullKey,
        message: 'Registration successful! Your CLI is ready to use.'
      }
    });

  } catch (error) {
    logger.error('CLI registration failed:', error);
    next(error);
  }
});

/**
 * CLI Login
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array() }
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }
      });
    }

    // Find or create CLI API key
    let apiKey = await ApiKey.findOne({ 
      where: { userId: user.id, name: 'CLI Access', isActive: true }
    });

    let fullKey;
    if (!apiKey) {
      // Generate new CLI API key
      const keyPrefix = `reco_${crypto.randomBytes(4).toString('hex')}`;
      const keySecret = crypto.randomBytes(32).toString('hex');
      fullKey = `${keyPrefix}_${keySecret}`;
      const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
      
      const rateLimit = user.subscription === 'free' ? 
        { requestsPerMinute: 20, tokensPerMinute: 5000 } :
        { requestsPerMinute: 60, tokensPerMinute: 50000 };
      
      apiKey = await ApiKey.create({
        userId: user.id,
        name: 'CLI Access',
        keyPrefix,
        keyHash,
        permissions: ['ai:generate', 'projects:read', 'projects:write'],
        rateLimit,
        metadata: { source: 'cli_login' },
        isActive: true
      });
    } else {
      fullKey = `${apiKey.keyPrefix}_[EXISTING_KEY]`; // Don't expose existing keys
    }

    logger.info(`CLI user logged in: ${email}`);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: user.subscription
        },
        apiKey: apiKey.isActive ? fullKey : '[KEY_REGENERATION_REQUIRED]',
        message: 'Login successful! Your CLI is ready to use.'
      }
    });

  } catch (error) {
    logger.error('CLI login failed:', error);
    next(error);
  }
});

/**
 * Check API key validity
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { api_key } = req.body;
    
    if (!api_key) {
      return res.status(400).json({
        error: { message: 'API key is required', code: 'MISSING_API_KEY' }
      });
    }
    
    // Parse API key
    const [keyPrefix, keySecret] = api_key.split('_');
    if (!keyPrefix || !keySecret) {
      return res.status(401).json({
        error: { message: 'Invalid API key format', code: 'INVALID_API_KEY_FORMAT' }
      });
    }
    
    // Hash the full key
    const keyHash = crypto.createHash('sha256').update(api_key).digest('hex');
    
    // Find API key
    const apiKey = await ApiKey.findOne({ 
      where: { keyHash, isActive: true },
      include: [{ model: User, as: 'user' }]
    });
    
    if (!apiKey || !apiKey.user) {
      return res.status(401).json({
        error: { message: 'Invalid or inactive API key', code: 'INVALID_API_KEY' }
      });
    }
    
    // Update last used
    await apiKey.update({ lastUsedAt: new Date() });
    
    res.json({
      success: true,
      data: {
        valid: true,
        user: {
          id: apiKey.user.id,
          email: apiKey.user.email,
          name: apiKey.user.name,
          subscription: apiKey.user.subscription
        },
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit
      }
    });
    
  } catch (error) {
    logger.error('API key verification failed:', error);
    next(error);
  }
});

/**
 * Get CLI user subscription status
 */
router.get('/subscription/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: { message: 'User not found', code: 'USER_NOT_FOUND' }
      });
    }
    
    // Get usage for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const usage = await UsageRecord.count({
      where: {
        userId,
        timestamp: { [require('sequelize').Op.gte]: startOfMonth }
      }
    });
    
    const subscriptionLimits = {
      free: { requests: 100, tokens: 10000 },
      professional: { requests: 10000, tokens: 1000000 },
      business: { requests: 50000, tokens: 5000000 },
      enterprise: { requests: 500000, tokens: 50000000 }
    };
    
    const limits = subscriptionLimits[user.subscription] || subscriptionLimits.free;
    
    res.json({
      success: true,
      data: {
        subscription: {
          plan: user.subscription,
          status: 'active',
          quotas: {
            used: usage,
            limit: limits.requests,
            resetDate: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1)
          }
        }
      }
    });
    
  } catch (error) {
    logger.error('Subscription check failed:', error);
    next(error);
  }
});

module.exports = router;