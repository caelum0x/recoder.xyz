const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { logger } = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: {
          message: 'Access token required',
          code: 'TOKEN_REQUIRED'
        }
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password', 'refreshToken'] }
    });

    if (!user) {
      return res.status(401).json({
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: {
          message: 'Account is deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: {
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        }
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        }
      });
    }

    return res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          message: 'Admin access required',
          code: 'ADMIN_REQUIRED'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Admin authorization error:', error);
    return res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};

const requirePremium = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }

    if (req.user.subscription !== 'premium' && req.user.subscription !== 'pro') {
      return res.status(403).json({
        error: {
          message: 'Premium subscription required',
          code: 'PREMIUM_REQUIRED'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Premium authorization error:', error);
    return res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.userId, {
        attributes: { exclude: ['password', 'refreshToken'] }
      });

      if (user && user.isActive) {
        req.user = user;
      } else {
        req.user = null;
      }
    } catch (tokenError) {
      req.user = null;
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    req.user = null;
    next();
  }
};

const checkApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        error: {
          message: 'API key required',
          code: 'API_KEY_REQUIRED'
        }
      });
    }

    const user = await User.findOne({
      where: { apiKey },
      attributes: { exclude: ['password', 'refreshToken'] }
    });

    if (!user) {
      return res.status(401).json({
        error: {
          message: 'Invalid API key',
          code: 'INVALID_API_KEY'
        }
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: {
          message: 'Account is deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    return res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};

const requireVerifiedEmail = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }

    if (!req.user.emailVerified) {
      return res.status(403).json({
        error: {
          message: 'Email verification required',
          code: 'EMAIL_VERIFICATION_REQUIRED'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Email verification error:', error);
    return res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  requirePremium,
  optionalAuth,
  checkApiKey,
  requireVerifiedEmail
};