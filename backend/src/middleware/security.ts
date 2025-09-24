/**
 * Production Security Middleware
 * Comprehensive security hardening for Recoder.xyz backend
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
const slowDown = require('express-slow-down');
import { body, query, param, validationResult } from 'express-validator';
import { logger } from '../utils/logger';

// Security configuration based on environment
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Helmet Security Headers Configuration
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Allow for development - remove in production
        "https://cdn.jsdelivr.net",
        "https://unpkg.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:"
      ],
      connectSrc: [
        "'self'",
        "https://api.anthropic.com",
        "https://api.groq.com",
        "https://generativelanguage.googleapis.com",
        "https://api.deepseek.com",
        "https://openrouter.ai"
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  
  // HTTPS enforcement
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  
  // Prevent MIME type sniffing
  noSniff: true,
  
  // XSS protection
  xssFilter: true,
  
  // Hide X-Powered-By header
  hidePoweredBy: true,
  
  // Referrer policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

/**
 * CORS Configuration
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allowed origins for production
    const allowedOrigins = [
      'https://recoder.xyz',
      'https://www.recoder.xyz',
      'https://chat.recoder.xyz',
      'https://api.recoder.xyz'
    ];

    // Development origins
    const developmentOrigins = [
      'http://localhost:3000',
      'http://localhost:3010',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3010'
    ];

    const validOrigins = isProduction ? allowedOrigins : [...allowedOrigins, ...developmentOrigins];

    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (validOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from unauthorized origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Platform',
    'X-Device-Type',
    'X-Device-Info',
    'X-Request-Source'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset'
  ]
});

/**
 * Rate Limiting Configuration
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // limit each IP to 100 requests per windowMs in production
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP, please try again later',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * API Rate Limiting (stricter for API endpoints)
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isProduction ? 60 : 300, // 60 requests per minute in production
  message: {
    error: 'API rate limit exceeded',
    retryAfter: '1 minute'
  },
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

/**
 * Authentication Rate Limiting (very strict)
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true
});

/**
 * Slow Down Middleware (progressive delay)
 */
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 2, // allow 2 requests per windowMs without delay
  delayMs: 500 // add 500ms delay per request after delayAfter
});

/**
 * Input Validation Helpers
 */
export const validateJSON = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (req.get('Content-Type')?.includes('application/json')) {
      // Check if body was parsed correctly
      if (req.body === undefined) {
        res.status(400).json({
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        });
        return;
      }
    }
  }
  
  return next();
};

/**
 * Common validation rules
 */
export const commonValidation = {
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email'),
  
  password: body('password')
    .isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be 8+ chars with uppercase, lowercase, number, and special char'),
  
  uuid: param('id')
    .isUUID()
    .withMessage('Must be a valid UUID'),
  
  mongoId: param('id')
    .isMongoId()
    .withMessage('Must be a valid MongoDB ObjectId'),
  
  sanitizeString: (field: string) => 
    body(field)
      .trim()
      .escape()
      .isLength({ min: 1, max: 1000 })
      .withMessage(`${field} must be between 1 and 1000 characters`),
  
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be a positive integer <= 1000'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ]
};

/**
 * Validation Error Handler
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation errors', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
      ip: req.ip
    });
    
    res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: (error as any).path || (error as any).param || 'unknown',
        message: error.msg,
        value: (error as any).value || 'unknown'
      }))
    });
    return;
  }
  
  return next();
};

/**
 * Security Logging Middleware
 */
export const securityLogger = (req: Request, res: Response, next: NextFunction) => {
  // Log potentially suspicious activity
  const suspiciousPatterns = [
    /\.\./,           // Path traversal
    /<script/i,       // XSS attempts
    /union.*select/i, // SQL injection
    /exec\s*\(/i,     // Code injection
    /eval\s*\(/i      // Code injection
  ];
  
  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  if (suspiciousPatterns.some(pattern => pattern.test(requestData))) {
    logger.warn('Suspicious request detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      body: req.body,
      query: req.query
    });
  }
  
  return next();
};

/**
 * Request Size Limiter
 */
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const maxSize = 10 * 1024 * 1024; // 10MB max request size
  
  if (req.get('content-length') && parseInt(req.get('content-length')!) > maxSize) {
    logger.warn('Request size exceeded', {
      ip: req.ip,
      size: req.get('content-length'),
      path: req.path
    });
    
    res.status(413).json({
      error: 'Request too large',
      message: 'Request body exceeds maximum allowed size'
    });
    return;
  }
  
  return next();
};

/**
 * IP Whitelist/Blacklist
 */
export const ipFilter = (req: Request, res: Response, next: NextFunction): void => {
  const clientIP = req.ip;
  
  // Blacklisted IPs (in production, this would come from database/redis)
  const blacklistedIPs: string[] = [];
  
  if (clientIP && blacklistedIPs.includes(clientIP)) {
    logger.warn('Blocked request from blacklisted IP', { ip: clientIP });
    res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address has been blocked'
    });
    return;
  }
  
  return next();
};

/**
 * Complete Security Middleware Stack
 */
export const applySecurity = (app: any) => {
  // Trust proxy for correct IP addresses
  app.set('trust proxy', 1);
  
  // Apply security headers
  app.use(securityHeaders);
  
  // Apply CORS
  app.use(corsMiddleware);
  
  // Request size limiting
  app.use(requestSizeLimiter);
  
  // IP filtering
  app.use(ipFilter);
  
  // JSON validation
  app.use(validateJSON);
  
  // Security logging
  app.use(securityLogger);
  
  // Global rate limiting
  app.use(rateLimiter);
  
  // Speed limiting
  app.use(speedLimiter);
  
  logger.info('Security middleware applied successfully');
};

/**
 * Security Headers Check Endpoint
 */
export const securityHealthCheck = (req: Request, res: Response) => {
  const securityHeaders = {
    'X-Content-Type-Options': res.get('X-Content-Type-Options'),
    'X-Frame-Options': res.get('X-Frame-Options'),
    'X-XSS-Protection': res.get('X-XSS-Protection'),
    'Strict-Transport-Security': res.get('Strict-Transport-Security'),
    'Content-Security-Policy': res.get('Content-Security-Policy'),
    'Referrer-Policy': res.get('Referrer-Policy')
  };
  
  res.json({
    status: 'secure',
    timestamp: new Date(),
    securityHeaders,
    rateLimiting: 'enabled',
    cors: 'configured',
    validation: 'active'
  });
};

export default {
  applySecurity,
  rateLimiter,
  apiRateLimiter,
  authRateLimiter,
  commonValidation,
  handleValidationErrors,
  securityHealthCheck
};