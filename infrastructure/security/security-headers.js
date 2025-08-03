// Security Headers Configuration for Recoder.xyz
// Comprehensive security headers for all environments

const securityHeaders = {
  // Production security headers
  production: {
    // HTTPS enforcement
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    
    // XSS protection
    'X-XSS-Protection': '1; mode=block',
    
    // Content type sniffing protection
    'X-Content-Type-Options': 'nosniff',
    
    // Clickjacking protection
    'X-Frame-Options': 'DENY',
    
    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Content Security Policy
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "media-src 'self' data: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      "block-all-mixed-content"
    ].join('; '),
    
    // Permissions Policy (formerly Feature Policy)
    'Permissions-Policy': [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'cross-origin-isolated=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'web-share=()',
      'xr-spatial-tracking=()'
    ].join(', '),
    
    // Additional security headers
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    
    // Custom headers for monitoring
    'X-Security-Level': 'high',
    'X-Environment': 'production'
  },

  // Development security headers (less restrictive)
  development: {
    'X-XSS-Protection': '1; mode=block',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "font-src 'self' data: https:",
      "img-src 'self' data: https: blob:",
      "media-src 'self' data: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    'X-Security-Level': 'development',
    'X-Environment': 'development'
  }
};

// Rate limiting configuration
const rateLimiting = {
  // API endpoints
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many API requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: {
      error: 'Too many authentication attempts from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // General endpoints
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
  }
};

// CORS configuration
const corsConfig = {
  production: {
    origin: [
      'https://recoder.xyz',
      'https://www.recoder.xyz',
      'https://web.recoder.xyz',
      'https://cli.recoder.xyz'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Authorization',
      'Accept',
      'X-API-Key',
      'X-Client-Version'
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset'
    ],
    maxAge: 86400 // 24 hours
  },
  
  development: {
    origin: true, // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['*'],
    exposedHeaders: ['*'],
    maxAge: 86400
  }
};

// Security middleware for Express.js
function securityMiddleware(env = 'production') {
  return (req, res, next) => {
    const headers = securityHeaders[env] || securityHeaders.production;
    
    // Apply security headers
    Object.entries(headers).forEach(([header, value]) => {
      res.setHeader(header, value);
    });
    
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Add request ID for tracking
    req.id = req.id || require('crypto').randomUUID();
    res.setHeader('X-Request-ID', req.id);
    
    // Log security events
    if (req.path.includes('admin') || req.path.includes('api/auth')) {
      console.log(`Security Log: ${req.method} ${req.path} from ${req.ip} - Request ID: ${req.id}`);
    }
    
    next();
  };
}

// Security middleware for Next.js
function nextSecurityHeaders(env = 'production') {
  const headers = securityHeaders[env] || securityHeaders.production;
  
  return Object.entries(headers).map(([key, value]) => ({
    key,
    value
  }));
}

// Content Security Policy report handler
function cspReportHandler(req, res) {
  const report = req.body;
  
  // Log CSP violations
  console.error('CSP Violation:', {
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    report: report
  });
  
  // Send to monitoring service
  if (process.env.CSP_REPORT_WEBHOOK) {
    fetch(process.env.CSP_REPORT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'csp_violation',
        timestamp: new Date().toISOString(),
        report: report,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })
    }).catch(console.error);
  }
  
  res.status(204).end();
}

// Export configurations
module.exports = {
  securityHeaders,
  rateLimiting,
  corsConfig,
  securityMiddleware,
  nextSecurityHeaders,
  cspReportHandler
};

// Example usage in Next.js next.config.js:
/*
const { nextSecurityHeaders } = require('./infrastructure/security/security-headers');

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: nextSecurityHeaders(process.env.NODE_ENV)
      }
    ];
  }
};
*/

// Example usage in Express.js:
/*
const express = require('express');
const { securityMiddleware, rateLimiting } = require('./infrastructure/security/security-headers');
const rateLimit = require('express-rate-limit');

const app = express();

// Apply security middleware
app.use(securityMiddleware(process.env.NODE_ENV));

// Apply rate limiting
app.use('/api/', rateLimit(rateLimiting.api));
app.use('/api/auth/', rateLimit(rateLimiting.auth));
app.use('/', rateLimit(rateLimiting.general));
*/