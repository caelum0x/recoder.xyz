// Authentication and Authorization Middleware
// Updated for Prisma and TypeScript with subscription checks

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        subscriptionPlan?: string;
        subscriptionStatus?: string;
        role: string;
        isActive: boolean;
        emailVerified: boolean;
        createdAt: Date;
        updatedAt: Date;
      };
    }
  }
}

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