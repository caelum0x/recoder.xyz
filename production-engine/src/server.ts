/**
 * Production Engine Server
 * Real codeapp.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(compression() as express.RequestHandler);
app.use(express.json({ limit: '50mb' }));ation and validation service
 */

// Load environment variables first
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from './utils/logger';
import { CodeGenerationResult, realCodeGeneratorService } from './services/real-code-generator-service';
import { ValidationService } from './services/validation-service';
// import { unifiedBackendAI } from './services/unified-backend-ai';
import { commercialAIHubService } from './services/commercial-ai-hub-service';
import { openRouterService } from './services/openrouter-service';
import { billingService } from './services/billing-service';
import { rateLimitService } from './services/rate-limit-service';
import { userService } from './services/user-service';
import { projectService } from './services/project-service';
import developerApiRoutes from './routes/developer-api';
import developerDashboardRoutes from './routes/developer-dashboard';
import teamCollaborationRoutes from './routes/team-collaboration';
import socialFeaturesRoutes from './routes/social-features';
import gitIntegrationRoutes from './routes/git-integration';
import viralGrowthRoutes from './routes/viral-growth';
import onboardingRoutes from './routes/onboarding';
import templateMarketplaceRoutes from './routes/template-marketplace';
import deploymentRoutes from './routes/deployment';
import enterpriseDashboardRoutes from './routes/enterprise-dashboard';
import cliApiRoutes from './routes/cli-api';
import authSyncRoutes from './routes/auth-sync';
import { subscriptionAuthStack, authenticateSubscription } from './middleware/subscription-auth';

const app = express();
const PORT = process.env.PRODUCTION_ENGINE_PORT || process.env.ENGINE_PORT || process.env.PORT || 8001;

// Services
const validationService = new ValidationService();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(compression() as any);
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

// Apply subscription authentication to all API routes
app.use('/api', authenticateSubscription);

// Mount developer API routes
app.use('/api/dev', developerApiRoutes);
app.use('/api/dashboard', developerDashboardRoutes);
app.use('/api/teams', teamCollaborationRoutes);
app.use('/api/social', socialFeaturesRoutes);
app.use('/api/git', gitIntegrationRoutes);
app.use('/api/growth', viralGrowthRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/templates', templateMarketplaceRoutes);
app.use('/api/deployment', deploymentRoutes);
app.use('/api/enterprise/dashboard', enterpriseDashboardRoutes);

// CLI API routes - for published npm packages
app.use('/api/ai', cliApiRoutes);

// Auth sync routes - PUBLIC (no auth required for sync)
app.use('/api/auth', authSyncRoutes);

// Generate real code endpoint with full subscription validation
app.post('/api/generate', subscriptionAuthStack, async (req: express.Request, res: express.Response) => {
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
    const models = openRouterService.instance.getAvailableModels();
    
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
    const openRouterHealth = await openRouterService.instance.healthCheck();
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

// Compliance API endpoints for backend service integration
app.post('/api/compliance/validate', async (req: express.Request, res: express.Response) => {
  try {
    const { files, request } = req.body;

    if (!files || !request) {
      return res.status(400).json({
        success: false,
        error: 'Files and request are required for compliance validation'
      });
    }

    logger.info('Processing compliance validation request', {
      filesCount: files.length,
      requestType: request.type
    });

    // Use the realCodeGeneratorService to validate compliance
    const complianceResult = await realCodeGeneratorService['validateCompliance'](files, request);

    res.json({
      success: true,
      complianceValidation: complianceResult.complianceValidation,
      blockedByCompliance: complianceResult.blockedByCompliance,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('Compliance validation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Compliance validation failed',
      details: error.message
    });
  }
});

app.post('/api/compliance/scan-project', async (req: express.Request, res: express.Response) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path is required for compliance scanning'
      });
    }

    logger.info('Processing project compliance scan', { projectPath });

    const scanResults = await realCodeGeneratorService.scanProjectCompliance(projectPath);

    res.json({
      success: true,
      scanResults: Array.from(scanResults.entries()),
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('Project compliance scan failed:', error);
    res.status(500).json({
      success: false,
      error: 'Project compliance scan failed',
      details: error.message
    });
  }
});

app.post('/api/compliance/dashboard', async (req: express.Request, res: express.Response) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path is required for compliance dashboard'
      });
    }

    logger.info('Generating compliance dashboard', { projectPath });

    const dashboard = await realCodeGeneratorService.generateComplianceDashboard(projectPath);

    res.json({
      success: true,
      dashboard,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('Compliance dashboard generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Compliance dashboard generation failed',
      details: error.message
    });
  }
});

app.get('/api/compliance/config', async (req: express.Request, res: express.Response) => {
  try {
    const configuration = realCodeGeneratorService.getComplianceConfiguration();

    res.json({
      success: true,
      configuration,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('Failed to get compliance configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get compliance configuration',
      details: error.message
    });
  }
});

app.post('/api/compliance/config', async (req: express.Request, res: express.Response) => {
  try {
    const { configuration } = req.body;

    if (!configuration) {
      return res.status(400).json({
        success: false,
        error: 'Configuration is required'
      });
    }

    realCodeGeneratorService.updateComplianceConfiguration(configuration);

    res.json({
      success: true,
      message: 'Compliance configuration updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('Failed to update compliance configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update compliance configuration',
      details: error.message
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
    const healthyProviders = Object.values(health.services).filter(service => service.healthy).length;
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