/**
 * OAuth Authentication Routes
 * Google and GitHub OAuth 2.0 implementation
 */

import { Router, Request, Response } from 'express';
import '../types'; // Import types to extend Request interface
import crypto from 'crypto';
import axios from 'axios';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error-helpers';
import { generateTokens, logSecurityEvent } from '../middleware/auth';

const router = Router();

// OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

/**
 * @route GET /api/oauth/google
 * @desc Initiate Google OAuth flow
 * @access Public
 */
router.get('/google', (req: Request, res: Response): void => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({
      success: false,
      error: 'Google OAuth not configured',
      code: 'OAUTH_NOT_CONFIGURED'
    });
    return;
  }

  const state = crypto.randomBytes(32).toString('hex');
  const redirectUri = `${BASE_URL}/api/oauth/google/callback`;
  
  // Store state for verification
  req.session = req.session || {};
  req.session.oauthState = state;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'email profile');
  authUrl.searchParams.set('state', state);

  logger.info('Google OAuth initiated', { ip: req.ip });
  res.redirect(authUrl.toString());
});

/**
 * @route GET /api/oauth/google/callback
 * @desc Handle Google OAuth callback
 * @access Public
 */
router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      res.status(400).json({
        success: false,
        error: 'Missing OAuth parameters',
        code: 'OAUTH_PARAMS_MISSING'
      });
      return;
    }

    // Verify state parameter
    if (state !== req.session?.oauthState) {
      res.status(400).json({
        success: false,
        error: 'Invalid OAuth state',
        code: 'OAUTH_STATE_INVALID'
      });
      return;
    }

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${BASE_URL}/api/oauth/google/callback`,
    });

    const { access_token } = tokenResponse.data;

    // Get user info from Google
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const googleUser = userResponse.data;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: googleUser.email }
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          name: googleUser.name,
          role: 'user',
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      logger.info('New user created via Google OAuth', {
        userId: user.id,
        email: user.email,
        provider: 'google'
      });
    }

    // Create or update OAuth account
    await prisma.oAuthAccount.upsert({
      where: {
        provider_providerId: {
          provider: 'google',
          providerId: googleUser.id
        }
      },
      update: {
        email: googleUser.email,
        accessToken: access_token,
        updatedAt: new Date()
      },
      create: {
        userId: user.id,
        provider: 'google',
        providerId: googleUser.id,
        email: googleUser.email,
        accessToken: access_token,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Update user email verification
    if (!user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          updatedAt: new Date()
        }
      });
    }

    // Generate tokens
    const tokens = generateTokens(user);

    logSecurityEvent('oauth_login_success', req as Request);

    logger.info('Google OAuth login successful', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });

    // Set JWT tokens as HTTP-only cookies
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to frontend callback page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/oauth/callback?success=true&provider=google`);

  } catch (error) {
    logger.error('Google OAuth callback error', {
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip
    });

    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/oauth/callback?error=oauth_failed&provider=google`);
  }
});

/**
 * @route GET /api/oauth/github
 * @desc Initiate GitHub OAuth flow
 * @access Public
 */
router.get('/github', (req: Request, res: Response): void => {
  if (!GITHUB_CLIENT_ID) {
    res.status(500).json({
      success: false,
      error: 'GitHub OAuth not configured',
      code: 'OAUTH_NOT_CONFIGURED'
    });
    return;
  }

  const state = crypto.randomBytes(32).toString('hex');
  const redirectUri = `${BASE_URL}/api/oauth/github/callback`;
  
  // Store state for verification
  req.session = req.session || {};
  req.session.oauthState = state;

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'user:email');
  authUrl.searchParams.set('state', state);

  logger.info('GitHub OAuth initiated', { ip: req.ip });
  res.redirect(authUrl.toString());
});

/**
 * @route GET /api/oauth/github/callback
 * @desc Handle GitHub OAuth callback
 * @access Public
 */
router.get('/github/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      res.status(400).json({
        success: false,
        error: 'Missing OAuth parameters',
        code: 'OAUTH_PARAMS_MISSING'
      });
      return;
    }

    // Verify state parameter
    if (state !== req.session?.oauthState) {
      res.status(400).json({
        success: false,
        error: 'Invalid OAuth state',
        code: 'OAUTH_STATE_INVALID'
      });
      return;
    }

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }, {
      headers: { Accept: 'application/json' }
    });

    const { access_token } = tokenResponse.data;

    // Get user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    // Get user emails from GitHub
    const emailsResponse = await axios.get('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const githubUser = userResponse.data;
    const emails = emailsResponse.data;
    const primaryEmail = emails.find((email: any) => email.primary)?.email || githubUser.email;

    if (!primaryEmail) {
      res.status(400).json({
        success: false,
        error: 'No email found in GitHub account',
        code: 'OAUTH_NO_EMAIL'
      });
      return;
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: primaryEmail }
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: primaryEmail,
          name: githubUser.name || githubUser.login,
          role: 'user',
          isActive: true,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      logger.info('New user created via GitHub OAuth', {
        userId: user.id,
        email: user.email,
        provider: 'github'
      });
    }

    // Create or update OAuth account
    await prisma.oAuthAccount.upsert({
      where: {
        provider_providerId: {
          provider: 'github',
          providerId: githubUser.id.toString()
        }
      },
      update: {
        email: primaryEmail,
        accessToken: access_token,
        updatedAt: new Date()
      },
      create: {
        userId: user.id,
        provider: 'github',
        providerId: githubUser.id.toString(),
        email: primaryEmail,
        accessToken: access_token,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Update user email verification
    if (!user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          updatedAt: new Date()
        }
      });
    }

    // Generate tokens
    const tokens = generateTokens(user);

    logSecurityEvent('oauth_login_success', req as Request);

    logger.info('GitHub OAuth login successful', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });

    // Set JWT tokens as HTTP-only cookies
    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to frontend callback page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/oauth/callback?success=true&provider=github`);

  } catch (error) {
    logger.error('GitHub OAuth callback error', {
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip
    });

    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/oauth/callback?error=oauth_failed&provider=github`);
  }
});

/**
 * @route POST /api/oauth/link-account
 * @desc Link OAuth provider to existing account
 * @access Protected
 */
router.post('/link-account', async (req: Request, res: Response): Promise<void> => {
  // This would be implemented to link OAuth accounts to existing users
  res.status(501).json({
    success: false,
    message: 'Account linking not yet implemented',
    code: 'NOT_IMPLEMENTED'
  });
});

export default router;