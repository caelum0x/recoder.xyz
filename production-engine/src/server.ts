/**
 * Production Engine Server
 * Real code generation and validation service
 */

// Load environment variables first
import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from './utils/logger';
import { realCodeGeneratorService } from './services/real-code-generator-service';
import { ValidationService } from './services/validation-service';
// import { unifiedBackendAI } from './services/unified-backend-ai';
import { commercialAIHubService } from './services/commercial-ai-hub-service';
import { openRouterService } from './services/openrouter-service';
import { billingService } from './services/billing-service';
import { rateLimitService } from './services/rate-limit-service';

const app = express();
const PORT = process.env.ENGINE_PORT || process.env.PORT || 3002;

// Services
const validationService = new ValidationService();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    service: 'Recoder Production Engine',
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Commercial middleware for API authentication and rate limiting
app.use('/api', async (req, res, next) => {
  const userId = req.headers['x-user-id'] as string;
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!userId && !apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please provide x-user-id or x-api-key header.',
      code: 'AUTH_REQUIRED'
    });
  }
  
  // For API key authentication, extract user ID from key (implement your logic)
  const effectiveUserId = userId || apiKey?.split('-')[1] || 'anonymous';
  req.userId = effectiveUserId;
  
  next();
});

// Generate real code endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const {
      description,
      type,
      framework,
      features = [],
      outputPath = './generated',
      userId
    } = req.body;

    if (!type || !description) {
      return res.status(400).json({
        success: false,
        error: 'Type and description are required',
        files: [],
        instructions: ''
      });
    }

    logger.info('Starting real code generation', {
      type,
      description: description.substring(0, 100),
      framework,
      features: features.length,
      userId
    });

    const request = {
      description,
      type,
      framework,
      features,
      outputPath,
      userId
    };

    const result = await realCodeGeneratorService.generateCode(request);

    logger.info('Real code generation completed', {
      success: result.success,
      files: result.files.length,
      provider: result.metadata.provider,
      generationTime: result.metadata.generationTime
    });

    res.json(result);

  } catch (error: any) {
    logger.error('Real code generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      files: [],
      instructions: '',
      metadata: {
        provider: 'production-engine',
        model: 'failed',
        tokensUsed: 0,
        generationTime: 0
      }
    });
  }
});

// Validate code endpoint
app.post('/api/validate', async (req, res) => {
  try {
    const { files, projectType } = req.body;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({
        error: {
          message: 'Files array is required',
          code: 'MISSING_FILES'
        }
      });
    }

    logger.info('Starting code validation', {
      fileCount: files.length,
      projectType
    });

    const results = await validationService.validateRealFunctionality(files, projectType);
    
    const passedChecks = results.filter(r => r.passed).length;
    const totalChecks = results.length;
    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    logger.info('Code validation completed', {
      totalChecks,
      passedChecks,
      score
    });

    res.json({
      success: true,
      data: {
        results,
        summary: {
          totalChecks,
          passedChecks,
          failedChecks: totalChecks - passedChecks,
          score
        }
      }
    });

  } catch (error: any) {
    logger.error('Code validation failed:', error);
    res.status(500).json({
      error: {
        message: 'Code validation failed',
        code: 'VALIDATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

// Get available AI providers
app.get('/api/providers', async (req, res) => {
  try {
    const providers = await realCodeGeneratorService.getAvailableProviders();
    res.json({
      success: true,
      providers
    });
  } catch (error: any) {
    logger.error('Failed to get providers:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      providers: []
    });
  }
});

// Get available templates
app.get('/api/templates', (req, res) => {
  try {
    const { type } = req.query;
    
    // This would integrate with the template service
    const templates = [
      {
        id: 'react-nextjs',
        name: 'React Next.js App',
        type: 'web',
        description: 'Full-stack React application with Next.js'
      },
      {
        id: 'solana-anchor',
        name: 'Solana Anchor Program',
        type: 'blockchain',
        description: 'Solana smart contract with Anchor framework'
      },
      {
        id: 'node-express',
        name: 'Node.js Express API',
        type: 'backend',
        description: 'RESTful API with Node.js and Express'
      }
    ];

    const filteredTemplates = type ? templates.filter(t => t.type === type) : templates;

    res.json({
      success: true,
      data: filteredTemplates
    });

  } catch (error: any) {
    logger.error('Failed to get templates:', error);
    res.status(500).json({
      error: {
        message: 'Failed to get templates',
        code: 'TEMPLATES_ERROR'
      }
    });
  }
});

// Commercial billing and subscription endpoints
app.get('/api/billing/subscription/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const subscription = billingService.getUserSubscription(userId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found',
        code: 'SUBSCRIPTION_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      data: subscription
    });
  } catch (error: any) {
    logger.error('Failed to get subscription:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'BILLING_ERROR'
    });
  }
});

app.get('/api/billing/pricing', (req, res) => {
  try {
    const tiers = billingService.getPricingTiers();
    
    res.json({
      success: true,
      data: tiers
    });
  } catch (error: any) {
    logger.error('Failed to get pricing tiers:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'PRICING_ERROR'
    });
  }
});

// OpenRouter service endpoints
app.get('/api/openrouter/models', (req, res) => {
  try {
    const models = openRouterService.getAvailableModels();
    
    res.json({
      success: true,
      data: models
    });
  } catch (error: any) {
    logger.error('Failed to get OpenRouter models:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'MODELS_ERROR'
    });
  }
});

// Get service status and metrics
app.get('/api/status', async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    
    // Get commercial service status
    const openRouterHealth = await openRouterService.healthCheck();
    const rateLimitStats = rateLimitService.getUsageStatistics();
    
    res.json({
      success: true,
      data: {
        service: 'Recoder Production Engine (Commercial)',
        version: '2.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
          external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
        },
        cpu: process.cpuUsage(),
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        services: {
          openRouter: {
            status: openRouterHealth.status,
            apiKeyValid: openRouterHealth.apiKeyValid,
            modelsAvailable: openRouterHealth.modelsAvailable,
            averageLatency: openRouterHealth.averageLatency,
            errorRate: openRouterHealth.errorRate
          },
          rateLimiting: {
            totalActiveUsers: rateLimitStats.totalActiveUsers,
            totalRequests: rateLimitStats.totalRequests,
            suspendedUsers: rateLimitStats.suspendedUsers
          },
          billing: {
            enabled: true,
            tiersAvailable: billingService.getPricingTiers().length
          }
        }
      }
    });
  } catch (error: any) {
    logger.error('Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STATUS_ERROR'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      code: 'ROUTE_NOT_FOUND'
    }
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
      code: err.code || 'INTERNAL_ERROR'
    }
  });
});

// Initialize unified AI systems
async function initializeAISystems() {
  try {
    logger.info('🤖 Initializing unified AI systems...');
    
    // Test commercial AI hub health
    const health = await commercialAIHubService.healthCheck();
    const healthyProviders = Object.values(health.unified).filter(Boolean).length + 
                            Object.values(health.legacy).filter(Boolean).length;
    logger.info(`✅ Commercial AI Hub health: ${healthyProviders} providers healthy (${health.overall})`);
    
    logger.info('🚀 All commercial AI systems initialized successfully');
    
  } catch (error) {
    logger.error('⚠️ Failed to initialize AI systems:', error);
  }
}

// Graceful shutdown
const server = app.listen(PORT, async () => {
  logger.info(`🚀 Production Engine running on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid
  });
  
  // Initialize AI systems after server starts
  await initializeAISystems();
});

// Handle shutdown signals
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { promise, reason });
  process.exit(1);
});

export default app;