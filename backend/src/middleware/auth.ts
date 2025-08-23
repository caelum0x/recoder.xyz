/**
 * Authentication & Authorization Middleware
 * Production-ready JWT-based authentication for Recoder.xyz
 * Enhanced with security hardening and comprehensive validation
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

// JWT Configuration with enhanced security
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// User roles and permissions
export enum UserRole {
  ADMIN = 'admin',
  PREMIUM = 'premium',
  USER = 'user',
  DEVELOPER = 'developer'
}

export const ROLE_PERMISSIONS = {
  [UserRole.ADMIN]: [
    'user:read', 'user:write', 'user:delete',
    'system:read', 'system:write', 'system:admin',
    'ai:unlimited', 'analytics:read'
  ],
  [UserRole.PREMIUM]: [
    'user:read', 'user:write',
    'ai:premium', 'projects:unlimited',
    'analytics:basic'
  ],
  [UserRole.DEVELOPER]: [
    'user:read', 'user:write',
    'ai:developer', 'api:extended'
  ],
  [UserRole.USER]: [
    'user:read', 'user:write',
    'ai:basic', 'projects:limited'
  ]
};

// Use the global Express.Request extension instead of custom interface

// Helper functions for authentication system
// Note: authenticate will be defined after authenticateUser function

export const generateTokens = (user: any) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    sessionId: crypto.randomBytes(16).toString('hex')
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
  const refreshToken = jwt.sign(
    { id: user.id, sessionId: payload.sessionId },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
  );

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRES_IN
  };
};

export const verifyRefreshToken = async (token: string) => {
  return jwt.verify(token, JWT_REFRESH_SECRET) as any;
};

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
};

// Enhanced validation with express-validator
export const authValidation = {
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .isLength({ min: 8, max: 128 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be 8+ chars with uppercase, lowercase, number, and special char'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Name must be 2-50 characters and contain only letters and spaces'),
    body('acceptTerms')
      .isBoolean()
      .custom((value) => value === true)
      .withMessage('You must accept the terms and conditions')
  ],
  
  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  
  refreshToken: [
    body('refreshToken')
      .notEmpty()
      .isJWT()
      .withMessage('Valid refresh token is required')
  ],
  
  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8, max: 128 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must be 8+ chars with uppercase, lowercase, number, and special char')
  ]
};

// Rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Enhanced error handling for validation
export const handleAuthValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Authentication validation errors', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: (error as any).path || (error as any).param,
        message: error.msg,
        value: (error as any).value
      }))
    });
  }
  
  next();
};

// Security event logging
export const logSecurityEvent = (event: string, req: Request) => {
  logger.warn(`Security event: ${event}`, {
    userId: req.user?.id,
    email: req.user?.email,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
};

// Use global Express types from types/index.ts

/**
 * Authenticate user with JWT token
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'TOKEN_REQUIRED'
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
       // subscriptionPlan: true,
       // subscriptionStatus: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({
        success: false,
        error: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', { error: error.message });
    
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
      return;
    }
    
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

// Export authenticate as alias for authenticateUser
export const authenticate = authenticateUser;

/**
 * Require admin role
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Require specific subscription plans
 */
export const requireSubscription = (allowedPlans: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const userPlan = req.user.subscriptionPlan || 'free';
    
    if (!allowedPlans.includes(userPlan)) {
      res.status(403).json({
        success: false,
        error: `Subscription required. Available plans: ${allowedPlans.join(', ')}`,
        code: 'SUBSCRIPTION_REQUIRED',
        requiredPlans: allowedPlans,
        currentPlan: userPlan
      });
      return;
    }

    // Check if subscription is active
    if (req.user.subscriptionStatus !== 'active' && userPlan !== 'free') {
      res.status(403).json({
        success: false,
        error: 'Active subscription required',
        code: 'SUBSCRIPTION_INACTIVE',
        currentStatus: req.user.subscriptionStatus
      });
      return;
    }

    next();
  };
};

/**
 * Require email verification
 */
export const requireEmailVerification = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (!req.user.emailVerified) {
    res.status(403).json({
      success: false,
      error: 'Email verification required',
      code: 'EMAIL_VERIFICATION_REQUIRED'
    });
    return;
  }

  next();
};

/**
 * Optional authentication (doesn't fail if no token)
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = undefined;
      next();
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          // subscriptionPlan: true,
          // subscriptionStatus: true,
          role: true,
          isActive: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (user && user.isActive) {
        req.user = user;
      } else {
        req.user = undefined;
      }
    } catch (tokenError) {
      req.user = undefined;
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', { error: error.message });
    req.user = undefined;
    next();
  }
};

/**
 * Check usage limits for user's plan
 */
export const checkUsageLimits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    next();
    return;
  }

  try {
    const userPlan = req.user.subscriptionPlan || 'free';
    
    // Define usage limits per plan
    const dailyLimits = {
      free: 10,
      weekly: 500,
      monthly: 2000,
      enterprise: 10000
    };

    const limit = dailyLimits[userPlan as keyof typeof dailyLimits] || dailyLimits.free;

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayUsage = await prisma.usageRecord.count({
      where: {
        userId: req.user.id,
        timestamp: {
          gte: today
        }
      }
    });

    if (todayUsage >= limit) {
      res.status(429).json({
        success: false,
        error: 'Daily usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        limit,
        used: todayUsage,
        resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
      });
      return;
    }

    // Add usage info to request
    req.usageInfo = {
      limit,
      used: todayUsage,
      remaining: limit - todayUsage
    };

    next();
  } catch (error) {
    logger.error('Usage limit check error:', { error: error.message, userId: req.user.id });
    next(); // Continue on error to avoid blocking requests
  }
};

// Extend Request type for usage info
declare global {
  namespace Express {
    interface Request {
      usageInfo?: {
        limit: number;
        used: number;
        remaining: number;
      };
    }
  }
}