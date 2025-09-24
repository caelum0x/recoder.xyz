/**
 * Debug server to systematically test each import and identify crash cause
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { logger } = require('./utils/logger');

// Load environment variables
dotenv.config();

const app = express();

// Enhanced performance middleware with intelligent systems
import { intelligentFailover } from './services/intelligent-failover';
import { redisCache } from './services/redis-cache';
import { databaseOptimization } from './services/database-optimization';

// Performance middleware
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

// Middleware stack
app.use(cors({
  origin: process.env['CORS_ORIGIN'] || '*',
  credentials: true
}));

app.use(require('compression')());
app.use(require('helmet')());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use(performanceMiddleware.createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000
}));

// Health check endpoint
app.get('/health', performanceMiddleware.createHealthCheckMiddleware());

// Test endpoint
app.get('/api/test/ping', (req: any, res: any) => {
  res.json({
    success: true,
    message: 'Debug server working',
    timestamp: new Date().toISOString()
  });
});

console.log('[DEBUG] Basic setup complete, starting service imports...');

// Test each service import individually
try {
  console.log('[DEBUG] Importing batch processor...');
  const { batchProcessor } = require('./services/batch-processor');
  console.log('[DEBUG] Batch processor imported successfully');
  
  console.log('[DEBUG] Importing prompt cache...');
  const { promptCache } = require('./services/prompt-cache');
  console.log('[DEBUG] Prompt cache imported successfully');
  
  console.log('[DEBUG] Importing component library...');
  const { componentLibrary } = require('./services/component-library');
  console.log('[DEBUG] Component library imported successfully');
  
  console.log('[DEBUG] Importing real-time usage tracker...');
  const { realTimeUsageTracker } = require('./services/real-time-usage-tracker');
  console.log('[DEBUG] Real-time usage tracker imported successfully');
  
  console.log('[DEBUG] Importing Prisma...');
  const { prisma } = require('./database/prisma');
  console.log('[DEBUG] Prisma imported successfully');
  
  // Make Prisma available to routes
  app.locals.prisma = prisma;
  
  console.log('[DEBUG] All services imported successfully, starting route imports...');
  
} catch (error) {
  console.error('[DEBUG] Service import failed:', error);
  process.exit(1);
}

// Test each route import individually
try {
  console.log('[DEBUG] Importing projects routes...');
  const projectsRoutes = require('./routes/projects');
  app.use('/api/projects', projectsRoutes);
  console.log('[DEBUG] Projects routes imported successfully');
  
  console.log('[DEBUG] Importing openrouter-api routes...');
  const openRouterApiRoutes = require('./routes/openrouter-api');
  app.use('/api/ai', openRouterApiRoutes);
  console.log('[DEBUG] OpenRouter API routes imported successfully');
  
  console.log('[DEBUG] Importing pricing routes...');
  const pricingRoutes = require('./routes/pricing');
  app.use('/api/pricing', pricingRoutes);
  console.log('[DEBUG] Pricing routes imported successfully');
  
  console.log('[DEBUG] Importing batch processing routes...');
  const batchProcessingRoutes = require('./routes/batch-processing');
  app.use('/api/batch', batchProcessingRoutes);
  console.log('[DEBUG] Batch processing routes imported successfully');
  
  console.log('[DEBUG] Importing prompt cache routes...');
  const promptCacheRoutes = require('./routes/prompt-cache');
  app.use('/api/cache', promptCacheRoutes);
  console.log('[DEBUG] Prompt cache routes imported successfully');
  
  console.log('[DEBUG] Importing component library routes...');
  const componentLibraryRoutes = require('./routes/component-library');
  app.use('/api/components', componentLibraryRoutes);
  console.log('[DEBUG] Component library routes imported successfully');
  
  console.log('[DEBUG] Importing usage monitoring routes...');
  const usageMonitoringRoutes = require('./routes/usage-monitoring');
  app.use('/api/usage', usageMonitoringRoutes);
  console.log('[DEBUG] Usage monitoring routes imported successfully');
  
} catch (error) {
  console.error('[DEBUG] Route import failed:', error);
  process.exit(1);
}

console.log('[DEBUG] All core routes imported successfully, starting server...');

// Start server
const PORT = process.env.PORT || 3005;
const server = app.listen(PORT, () => {
  console.log(`✅ Debug server running on port ${PORT}`);
  console.log('[DEBUG] Server started successfully!');
});

server.timeout = 300000; // 5 minutes

// Error handling
process.on('uncaughtException', (error) => {
  console.error('[DEBUG] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[DEBUG] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;