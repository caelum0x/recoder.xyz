/**
 * Simple Security Middleware (CommonJS)
 * Basic security hardening for startup
 */

const helmet = require('helmet');
const cors = require('cors');
const { logger } = require('../utils/logger');

// Basic helmet configuration
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Basic CORS configuration
const corsMiddleware = cors({
  origin: [
    'https://recoder.xyz',
    'https://www.recoder.xyz', 
    'https://web.recoder.xyz',
    'https://chat.recoder.xyz',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID']
});

// Apply security middleware to Express app
const applySecurity = (app) => {
  try {
    console.log('🔍 DEBUG: Applying basic security headers...');
    
    // Trust proxy for correct IP addresses
    app.set('trust proxy', 1);
    
    // Apply security headers
    app.use(securityHeaders);
    console.log('🔍 DEBUG: Helmet security headers applied');
    
    // Apply CORS
    app.use(corsMiddleware);
    console.log('🔍 DEBUG: CORS middleware applied');
    
    logger.info('Security middleware applied successfully');
  } catch (error) {
    logger.error('Failed to apply security middleware:', error);
    console.error('🔍 DEBUG: Security middleware failed:', error);
  }
};

module.exports = {
  applySecurity,
  securityHeaders,
  corsMiddleware
};