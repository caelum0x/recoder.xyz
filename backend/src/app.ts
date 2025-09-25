/**
 * Recoder Backend Express App
 * Express app configuration without server startup
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { logger } = require('./utils/logger');

// Import performance systems - NOW FULLY INTEGRATED
import { intelligentFailover } from './services/intelligent-failover';
import { redisCache } from './services/redis-cache';
import { databaseOptimization } from './services/database-optimization';

// Load environment variables
dotenv.config();

const app = express();

// Enhanced performance middleware with intelligent systems
const performanceMiddleware = {
  createRateLimitMiddleware: (options: any) => async (req: any, res: any, next: any) => {
    const identifier = `${req.ip}:${req.get('User-Agent')?.slice(0, 50) || 'unknown'}`;
    const count = await redisCache.incrementRateLimit(identifier, Math.floor(options.windowMs / 1000));
    
    if (count > options.max) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.floor(options.windowMs / 1000)
      });
    }
    
    res.set('X-RateLimit-Limit', options.max);
    res.set('X-RateLimit-Remaining', Math.max(0, options.max - count));
    next();
  },
  
  createHealthCheckMiddleware: () => async (req: any, res: any) => {
    const [failoverStatus, cacheHealth, dbHealth] = await Promise.all([
      intelligentFailover.getSystemStatus(),
      redisCache.healthCheck(),
      databaseOptimization.healthCheck()
    ]);
    
    const overall = failoverStatus.overall === 'healthy' && 
                   cacheHealth.status === 'healthy' && 
                   dbHealth.status === 'healthy' ? 'healthy' : 'degraded';
    
    res.json({
      status: overall,
      systems: {
        aiProviders: failoverStatus.overall,
        cache: cacheHealth.status,
        database: dbHealth.status
      },
      timestamp: new Date().toISOString()
    });
  }
};

// Middleware configuration
const middlewareStacks = {
  full: (options: any = {}) => [
    // CORS
    cors({
      origin: process.env['CORS_ORIGIN'] || '*',
      credentials: true
    }),
    
    // Compression
    require('compression')(options.compressionOptions || {}),
    
    // Security headers
    require('helmet')(),
    
    // Request parsing
    express.json({ limit: '50mb' }),
    express.urlencoded({ extended: true, limit: '50mb' }),
    cookieParser(),
    
    // Logging
    morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }),
    
    // Rate limiting
    performanceMiddleware.createRateLimitMiddleware({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000 // requests per window
    })
  ]
};

// Performance and optimization middleware stack
const performanceStack = middlewareStacks.full({
  compressionOptions: {
    level: 6,
    threshold: 1024
  }
});

// Apply middleware
performanceStack.forEach(middleware => app.use(middleware));

// Session middleware for OAuth state management
app.use(session({
  secret: process.env.JWT_SECRET || 'recoder-xyz-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Health check endpoint
app.get('/health', performanceMiddleware.createHealthCheckMiddleware());

// Test endpoint for payment verification
app.get('/api/test/ping', (req: any, res: any) => {
  res.json({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString()
  });
});

// Import routes
import gameDevelopmentRoutes from './routes/game-development-api';
import matchmakingRoutes from './routes/matchmaking-api';
import gameAnalyticsRoutes from './routes/game-analytics-api';
import solidityRoutes from './routes/solidity-api';
import blockchainRoutes from './routes/blockchain-api';
import unifiedPaymentsRoutes from './routes/unified-payments';
import simplePaymentTestRoutes from './routes/simple-payment-test';
import platformIntegrationRoutes from './routes/platform-integration';
import openRouterApiRoutes from './routes/openrouter-api';
import pricingRoutes from './routes/pricing';
import batchProcessingRoutes from './routes/batch-processing';
import promptCacheRoutes from './routes/prompt-cache';
import componentLibraryRoutes from './routes/component-library';
import usageMonitoringRoutes from './routes/usage-monitoring';
import overageBillingRoutes from './routes/overage-billing';
import authRoutes from './routes/auth';
import oauthRoutes from './routes/oauth';
import { batchProcessor } from './services/batch-processor';
import { promptCache } from './services/prompt-cache';
import { componentLibrary } from './services/component-library';
import { realTimeUsageTracker } from './services/real-time-usage-tracker';
import { overageBillingService } from './services/overage-billing';
import { prisma } from './database/prisma';
const projectsRoutes = require('./routes/projects');

// Make Prisma available to routes
app.locals.prisma = prisma;

// Initialize batch processor (singleton, starts automatically)
console.log('[INFO] Batch processor initialized');

// Initialize prompt cache (singleton, starts automatically)
console.log('[INFO] Prompt cache initialized');

// Initialize component library (singleton, starts automatically)
console.log('[INFO] Component library initialized');

// Initialize real-time usage tracker (singleton, starts automatically)
console.log('[INFO] Real-time usage tracker initialized');

// Initialize overage billing service (singleton, starts automatically)
console.log('[INFO] Overage billing service initialized');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/game-development', gameDevelopmentRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/game-analytics', gameAnalyticsRoutes);
app.use('/api/solidity', solidityRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/payments', unifiedPaymentsRoutes);
app.use('/api/payment-test', simplePaymentTestRoutes);
app.use('/api/platform', platformIntegrationRoutes);
app.use('/api/ai', openRouterApiRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/batch', batchProcessingRoutes);
app.use('/api/cache', promptCacheRoutes);
app.use('/api/components', componentLibraryRoutes);
app.use('/api/usage', usageMonitoringRoutes);
app.use('/api/overage', overageBillingRoutes);

// Start server if not in serverless environment
const PORT = process.env.PORT || 3001;
if (!process.env.NETLIFY && !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`✅ Recoder API server running on port ${PORT}`);
  });
  
  server.timeout = 300000; // 5 minutes
} else {
  console.log('Serverless environment detected, skipping server start');
}

module.exports = app;
