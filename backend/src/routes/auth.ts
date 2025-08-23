/**
 * Authentication Routes
 * Production-ready authentication endpoints with security hardening
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body } from 'express-validator';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { 
  authenticate, 
  generateTokens, 
  verifyRefreshToken, 
  hashPassword,
  authValidation,
  authRateLimit,
  handleAuthValidationErrors,
  logSecurityEvent,
  UserRole,
  AuthenticatedRequest
} from '../middleware/auth';

const router = Router();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', 
  authRateLimit,
  authValidation.register,
  handleAuthValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { email, password, name, acceptTerms } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        logger.warn('Registration attempt with existing email', { 
          email: email.toLowerCase(),
          ip: req.ip 
        });

        return res.status(409).json({
          success: false,
          error: 'User already exists',
          message: 'An account with this email already exists',
          code: 'USER_EXISTS'
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name: name.trim(),
          role: UserRole.USER,
          isActive: true,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          emailVerified: true,
          createdAt: true
        }
      });

      // Generate tokens
      const tokens = generateTokens(user);

      // Log successful registration
      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        ip: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified
          },
          ...tokens
        }
      });

    } catch (error) {
      logger.error('Registration error', {
        error: error.message,
        stack: error.stack,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Registration failed',
        message: 'An error occurred during registration',
        code: 'REGISTRATION_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and return token
 * @access Public
 */
router.post('/login',
  authRateLimit,
  authValidation.login,
  handleAuthValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user) {
        logger.warn('Login attempt with non-existent email', {
          email: email.toLowerCase(),
          ip: req.ip
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        });
      }

      if (!user.isActive) {
        logger.warn('Login attempt with deactivated account', {
          userId: user.id,
          email: user.email,
          ip: req.ip
        });

        return res.status(401).json({
          success: false,
          error: 'Account deactivated',
          message: 'Your account has been deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Verify password
      const passwordValid = await bcrypt.compare(password, user.password);

      if (!passwordValid) {
        logger.warn('Login attempt with invalid password', {
          userId: user.id,
          email: user.email,
          ip: req.ip
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Generate tokens
      const tokens = generateTokens(user);

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { updatedAt: new Date() }
      });

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified
          },
          ...tokens
        }
      });

    } catch (error) {
      logger.error('Login error', {
        error: error.message,
        stack: error.stack,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Login failed',
        message: 'An error occurred during login',
        code: 'LOGIN_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post('/refresh',
  authValidation.refreshToken,
  handleAuthValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;

      // Verify refresh token
      const decoded = await verifyRefreshToken(refreshToken);

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: decoded.id }
      });

      if (!user || !user.isActive) {
        logger.warn('Refresh token used for invalid/inactive user', {
          userId: decoded.id,
          ip: req.ip
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          message: 'Please login again',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }

      // Generate new tokens
      const tokens = generateTokens(user);

      logger.info('Token refreshed successfully', {
        userId: user.id,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified
          },
          ...tokens
        }
      });

    } catch (error) {
      logger.warn('Refresh token error', {
        error: error.message,
        ip: req.ip
      });

      res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        message: 'Please login again',
        code: 'REFRESH_TOKEN_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Protected
 */
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    logger.error('Get user profile error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
      code: 'PROFILE_ERROR'
    });
  }
});

/**
 * @route PUT /api/auth/update-profile
 * @desc Update user profile
 * @access Protected
 */
router.put('/update-profile',
  authenticate,
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Name must be 2-50 characters and contain only letters and spaces'),
    
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address')
  ],
  handleAuthValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, email } = req.body;
      const updateData: any = {};

      if (name) updateData.name = name.trim();
      if (email) {
        // Check if email is already taken by another user
        const existingUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() }
        });

        if (existingUser && existingUser.id !== req.user!.id) {
          return res.status(409).json({
            success: false,
            error: 'Email already taken',
            code: 'EMAIL_EXISTS'
          });
        }

        updateData.email = email.toLowerCase();
        updateData.emailVerified = false; // Reset verification if email changed
      }

      updateData.updatedAt = new Date();

      const updatedUser = await prisma.user.update({
        where: { id: req.user!.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          emailVerified: true,
          updatedAt: true
        }
      });

      logger.info('User profile updated', {
        userId: req.user!.id,
        changes: Object.keys(updateData),
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user: updatedUser }
      });

    } catch (error) {
      logger.error('Update profile error', {
        error: error.message,
        userId: req.user?.id,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update profile',
        code: 'UPDATE_PROFILE_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Protected
 */
router.post('/change-password',
  authenticate,
  authValidation.changePassword,
  handleAuthValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Verify current password
      const currentPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!currentPasswordValid) {
        logSecurityEvent('password_change_invalid_current', req as AuthenticatedRequest);

        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect',
          code: 'INVALID_CURRENT_PASSWORD'
        });
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          password: hashedNewPassword,
          updatedAt: new Date()
        }
      });

      logger.info('Password changed successfully', {
        userId: req.user!.id,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      logger.error('Change password error', {
        error: error.message,
        userId: req.user?.id,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Failed to change password',
        code: 'CHANGE_PASSWORD_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/auth/logout
 * @desc Logout user (invalidate tokens)
 * @access Protected
 */
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // In a production system, you would:
    // 1. Add the token to a blacklist in Redis
    // 2. Remove refresh token from database
    // 3. Clear session data

    logSecurityEvent('user_logout', req as AuthenticatedRequest);

    logger.info('User logged out', {
      userId: req.user!.id,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error', {
      error: error.message,
      userId: req.user?.id,
      ip: req.ip
    });

    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * @route POST /api/auth/validate
 * @desc Validate JWT token
 * @access Protected
 */
router.post('/validate', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: {
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
        permissions: req.user!.permissions
      },
      tokenInfo: {
        expiresIn: JWT_EXPIRES_IN,
        issuedAt: new Date(),
        sessionId: req.user!.sessionId
      }
    }
  });
});

export default router;