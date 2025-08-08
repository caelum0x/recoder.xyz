const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { User, OAuthAccount } = require('../models/index');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/oauth/google:
 *   post:
 *     summary: Authenticate with Google OAuth
 *     tags: [OAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: OAuth authorization code from Google
 *               redirectUri:
 *                 type: string
 *                 description: Redirect URI used in OAuth flow
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Invalid authorization code
 */
router.post('/google', [
  body('code')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Authorization code is required'),
  body('redirectUri')
    .isURL()
    .withMessage('Valid redirect URI is required')
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

    const { code, redirectUri } = req.body;

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;

    // Get user info from Google
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const googleUser = userResponse.data;
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Find or create user
    let user = await User.findOne({ where: { email: googleUser.email } });
    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await User.create({
        email: googleUser.email,
        name: googleUser.name,
        emailVerified: googleUser.verified_email,
        password: null // OAuth users don't have passwords
      });
      isNewUser = true;
    }

    // Find or create OAuth account
    let oauthAccount = await OAuthAccount.findOne({
      where: {
        provider: 'google',
        providerId: googleUser.id,
        userId: user.id
      }
    });

    if (!oauthAccount) {
      oauthAccount = await OAuthAccount.create({
        provider: 'google',
        providerId: googleUser.id,
        email: googleUser.email,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt,
        scope,
        userId: user.id
      });
    } else {
      // Update existing OAuth account
      await oauthAccount.update({
        accessToken: access_token,
        refreshToken: refresh_token || oauthAccount.refreshToken,
        tokenExpiresAt,
        scope
      });
    }

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Update user with refresh token and last login
    await user.update({
      refreshToken,
      lastLoginAt: new Date()
    });

    logger.info(`Google OAuth successful for user: ${user.email}`);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          organization: user.organization,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          lastLoginAt: user.lastLoginAt
        },
        accessToken,
        refreshToken,
        isNewUser
      },
      message: 'Google authentication successful'
    });

  } catch (error) {
    logger.error('Google OAuth failed:', error);
    
    if (error.response?.data?.error) {
      return res.status(400).json({
        error: {
          message: 'Google OAuth failed',
          code: 'OAUTH_ERROR',
          details: error.response.data.error_description
        }
      });
    }
    
    next(error);
  }
});

/**
 * @swagger
 * /api/oauth/github:
 *   post:
 *     summary: Authenticate with GitHub OAuth
 *     tags: [OAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: OAuth authorization code from GitHub
 *               state:
 *                 type: string
 *                 description: OAuth state parameter for security
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Invalid authorization code
 */
router.post('/github', [
  body('code')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Authorization code is required'),
  body('state')
    .optional()
    .isString()
    .withMessage('State must be a string')
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

    const { code, state } = req.body;

    // Exchange code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      state
    }, {
      headers: { Accept: 'application/json' }
    });

    const { access_token, scope } = tokenResponse.data;

    if (!access_token) {
      return res.status(400).json({
        error: {
          message: 'Failed to get access token from GitHub',
          code: 'OAUTH_ERROR'
        }
      });
    }

    // Get user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${access_token}` }
    });

    const githubUser = userResponse.data;

    // Get user email (might be private)
    const emailResponse = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `token ${access_token}` }
    });

    const primaryEmail = emailResponse.data.find(email => email.primary);
    const userEmail = primaryEmail?.email || githubUser.email;

    if (!userEmail) {
      return res.status(400).json({
        error: {
          message: 'GitHub account must have a public or primary email address',
          code: 'EMAIL_REQUIRED'
        }
      });
    }

    // Find or create user
    let user = await User.findOne({ where: { email: userEmail } });
    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await User.create({
        email: userEmail,
        name: githubUser.name || githubUser.login,
        emailVerified: primaryEmail?.verified || false,
        password: null // OAuth users don't have passwords
      });
      isNewUser = true;
    }

    // Find or create OAuth account
    let oauthAccount = await OAuthAccount.findOne({
      where: {
        provider: 'github',
        providerId: githubUser.id.toString(),
        userId: user.id
      }
    });

    if (!oauthAccount) {
      oauthAccount = await OAuthAccount.create({
        provider: 'github',
        providerId: githubUser.id.toString(),
        email: userEmail,
        accessToken: access_token,
        scope,
        userId: user.id
      });
    } else {
      // Update existing OAuth account
      await oauthAccount.update({
        accessToken: access_token,
        scope
      });
    }

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Update user with refresh token and last login
    await user.update({
      refreshToken,
      lastLoginAt: new Date()
    });

    logger.info(`GitHub OAuth successful for user: ${user.email}`);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          organization: user.organization,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          lastLoginAt: user.lastLoginAt
        },
        accessToken,
        refreshToken,
        isNewUser
      },
      message: 'GitHub authentication successful'
    });

  } catch (error) {
    logger.error('GitHub OAuth failed:', error);
    
    if (error.response?.data?.error) {
      return res.status(400).json({
        error: {
          message: 'GitHub OAuth failed',
          code: 'OAUTH_ERROR',
          details: error.response.data.error_description
        }
      });
    }
    
    next(error);
  }
});

/**
 * @swagger
 * /api/oauth/disconnect/{provider}:
 *   delete:
 *     summary: Disconnect OAuth provider
 *     tags: [OAuth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [google, github]
 *         description: OAuth provider to disconnect
 *     responses:
 *       200:
 *         description: Provider disconnected successfully
 *       404:
 *         description: OAuth account not found
 */
router.delete('/disconnect/:provider', authenticateToken, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

    if (!['google', 'github'].includes(provider)) {
      return res.status(400).json({
        error: {
          message: 'Invalid OAuth provider',
          code: 'INVALID_PROVIDER'
        }
      });
    }

    const oauthAccount = await OAuthAccount.findOne({
      where: {
        provider,
        userId
      }
    });

    if (!oauthAccount) {
      return res.status(404).json({
        error: {
          message: `${provider} account not found`,
          code: 'OAUTH_ACCOUNT_NOT_FOUND'
        }
      });
    }

    // Check if user has a password or other OAuth accounts
    const user = await User.findByPk(userId, {
      include: [{ model: OAuthAccount }]
    });

    const hasPassword = !!user.password;
    const otherOAuthAccounts = user.oauthAccounts.filter(acc => acc.id !== oauthAccount.id);

    if (!hasPassword && otherOAuthAccounts.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Cannot disconnect the only authentication method',
          code: 'LAST_AUTH_METHOD'
        }
      });
    }

    // Deactivate OAuth account
    await oauthAccount.update({ isActive: false });

    logger.info(`${provider} OAuth disconnected for user: ${user.email}`);

    res.json({
      success: true,
      message: `${provider} account disconnected successfully`
    });

  } catch (error) {
    logger.error('OAuth disconnect failed:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/oauth/accounts:
 *   get:
 *     summary: Get connected OAuth accounts
 *     tags: [OAuth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connected OAuth accounts retrieved
 */
router.get('/accounts', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const oauthAccounts = await OAuthAccount.findAll({
      where: { userId, isActive: true },
      attributes: ['id', 'provider', 'email', 'createdAt', 'updatedAt']
    });

    res.json({
      success: true,
      data: oauthAccounts,
      message: 'OAuth accounts retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get OAuth accounts:', error);
    next(error);
  }
});

module.exports = router;