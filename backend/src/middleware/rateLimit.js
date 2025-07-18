const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const { logger } = require('../utils/logger');

let redisClient;

if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 60000,
      lazyConnect: true
    }
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected for rate limiting');
  });
}

const createRateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: {
        message: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user ? `user:${req.user.id}` : req.ip;
    }
  };

  if (redisClient) {
    defaultOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  }

  return rateLimit({
    ...defaultOptions,
    ...options
  });
};

// General API rate limiting
const apiLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
  message: {
    error: {
      message: 'Too many API requests, please try again later',
      code: 'API_RATE_LIMIT_EXCEEDED'
    }
  }
});

// Authentication rate limiting
const authLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: {
    error: {
      message: 'Too many authentication attempts, please try again later',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    }
  },
  skipSuccessfulRequests: true
});

// Registration rate limiting
const registerLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour
  message: {
    error: {
      message: 'Too many registration attempts, please try again later',
      code: 'REGISTER_RATE_LIMIT_EXCEEDED'
    }
  }
});

// AI model usage rate limiting
const modelLimiter = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    error: {
      message: 'Too many AI model requests, please try again later',
      code: 'MODEL_RATE_LIMIT_EXCEEDED'
    }
  }
});

// Premium model rate limiting (higher limits)
const premiumModelLimiter = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 requests per minute for premium users
  message: {
    error: {
      message: 'Too many AI model requests, please try again later',
      code: 'MODEL_RATE_LIMIT_EXCEEDED'
    }
  },
  skip: (req) => {
    // Skip if user is not premium
    return !req.user || (req.user.subscription !== 'premium' && req.user.subscription !== 'pro');
  }
});

// Code generation rate limiting
const codeGenerationLimiter = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 code generations per minute
  message: {
    error: {
      message: 'Too many code generation requests, please try again later',
      code: 'CODE_GENERATION_RATE_LIMIT_EXCEEDED'
    }
  }
});

// Project creation rate limiting
const projectLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 projects per hour
  message: {
    error: {
      message: 'Too many project creation requests, please try again later',
      code: 'PROJECT_RATE_LIMIT_EXCEEDED'
    }
  }
});

// Template creation rate limiting
const templateLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 templates per hour
  message: {
    error: {
      message: 'Too many template creation requests, please try again later',
      code: 'TEMPLATE_RATE_LIMIT_EXCEEDED'
    }
  }
});

// File upload rate limiting
const uploadLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 uploads per 15 minutes
  message: {
    error: {
      message: 'Too many file uploads, please try again later',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
    }
  }
});

// Webhook rate limiting
const webhookLimiter = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 webhooks per minute
  message: {
    error: {
      message: 'Too many webhook requests, please try again later',
      code: 'WEBHOOK_RATE_LIMIT_EXCEEDED'
    }
  }
});

// Admin operations rate limiting
const adminLimiter = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 admin operations per minute
  message: {
    error: {
      message: 'Too many admin operations, please try again later',
      code: 'ADMIN_RATE_LIMIT_EXCEEDED'
    }
  },
  skip: (req) => {
    // Skip if user is not admin
    return !req.user || req.user.role !== 'admin';
  }
});

// Dynamic rate limiting based on user subscription
const dynamicLimiter = (req, res, next) => {
  const user = req.user;
  
  if (!user) {
    return apiLimiter(req, res, next);
  }

  let maxRequests = 100; // default
  
  switch (user.subscription) {
    case 'free':
      maxRequests = 100;
      break;
    case 'pro':
      maxRequests = 500;
      break;
    case 'premium':
      maxRequests = 2000;
      break;
    case 'enterprise':
      maxRequests = 10000;
      break;
  }

  const userLimiter = createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: maxRequests,
    message: {
      error: {
        message: 'Rate limit exceeded for your subscription tier',
        code: 'SUBSCRIPTION_RATE_LIMIT_EXCEEDED'
      }
    }
  });

  return userLimiter(req, res, next);
};

// IP-based rate limiting for public endpoints
const publicLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes per IP
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later',
      code: 'IP_RATE_LIMIT_EXCEEDED'
    }
  },
  keyGenerator: (req) => req.ip
});

// Strict rate limiting for sensitive operations
const strictLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: {
    error: {
      message: 'Too many sensitive operations, please try again later',
      code: 'STRICT_RATE_LIMIT_EXCEEDED'
    }
  }
});

module.exports = {
  createRateLimit,
  apiLimiter,
  authLimiter,
  registerLimiter,
  modelLimiter,
  premiumModelLimiter,
  codeGenerationLimiter,
  projectLimiter,
  templateLimiter,
  uploadLimiter,
  webhookLimiter,
  adminLimiter,
  dynamicLimiter,
  publicLimiter,
  strictLimiter
};