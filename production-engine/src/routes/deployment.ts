/**
 * One-Click Deployment API Routes for Recoder.ai DaaS Platform
 * Handles deployments to multiple cloud platforms with automated setup
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { deploymentService } from '../services/deployment-service';
import { userService } from '../services/user-service';

const router = Router();

// Authentication middleware
const authenticate = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'] as string;
  
  if (!token && !userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  req.userId = userId || 'demo-user';
  next();
};

router.use(authenticate);

// =============================================================================
// DEPLOYMENT PLATFORM ROUTES
// =============================================================================

/**
 * GET /api/deployment/platforms
 * Get available deployment platforms
 */
router.get('/platforms', async (req, res) => {
  try {
    const {
      category,
      framework,
      free
    } = req.query;

    const filters = {
      category: category as string,
      framework: framework as string,
      free: free === 'true' ? true : free === 'false' ? false : undefined
    };

    const platforms = deploymentService.getAvailablePlatforms(filters);

    res.json({
      success: true,
      data: {
        platforms,
        total: platforms.length,
        categories: ['hosting', 'serverless', 'container', 'edge'],
        popularFrameworks: ['Next.js', 'React', 'Vue.js', 'Angular', 'Node.js']
      }
    });

  } catch (error: any) {
    logger.error('Get deployment platforms failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/deployment/platforms/:platformId
 * Get specific platform details
 */
router.get('/platforms/:platformId', async (req, res) => {
  try {
    const { platformId } = req.params;
    
    const platforms = deploymentService.getAvailablePlatforms();
    const platform = platforms.find(p => p.id === platformId);

    if (!platform) {
      return res.status(404).json({
        success: false,
        error: 'Platform not found',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: platform
    });

  } catch (error: any) {
    logger.error('Get platform details failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// DEPLOYMENT CONFIGURATION ROUTES
// =============================================================================

/**
 * POST /api/deployment/configurations
 * Create deployment configuration
 */
router.post('/configurations', async (req, res) => {
  try {
    const {
      platformId,
      name,
      credentials,
      buildConfig,
      domain,
      advanced
    } = req.body;

    if (!platformId || !name || !credentials || !buildConfig) {
      return res.status(400).json({
        success: false,
        error: 'Platform ID, name, credentials, and build config are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await deploymentService.createDeploymentConfiguration(req.userId, {
      platformId,
      name,
      credentials,
      buildConfig,
      domain,
      advanced
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'CONFIGURATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.configuration,
      message: `Deployment configuration "${name}" created successfully! 🚀`
    });

  } catch (error: any) {
    logger.error('Create deployment configuration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/deployment/configurations
 * Get user's deployment configurations
 */
router.get('/configurations', async (req, res) => {
  try {
    // Mock implementation - in real app, this would fetch from database
    const configurations = [
      {
        id: 'config_1',
        name: 'My Vercel Config',
        platformId: 'vercel',
        isActive: true,
        createdAt: new Date()
      },
      {
        id: 'config_2',
        name: 'Netlify Production',
        platformId: 'netlify',
        isActive: true,
        createdAt: new Date()
      }
    ];

    res.json({
      success: true,
      data: {
        configurations,
        total: configurations.length
      }
    });

  } catch (error: any) {
    logger.error('Get deployment configurations failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// DEPLOYMENT EXECUTION ROUTES
// =============================================================================

/**
 * POST /api/deployment/deploy
 * Deploy project to platform
 */
router.post('/deploy', async (req, res) => {
  try {
    const {
      projectId,
      platformId,
      configurationId,
      branch = 'main',
      buildConfig,
      environmentVariables
    } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID'
      });
    }

    if (!platformId && !configurationId) {
      return res.status(400).json({
        success: false,
        error: 'Either platform ID or configuration ID is required',
        code: 'MISSING_DEPLOYMENT_TARGET'
      });
    }

    const result = await deploymentService.deployProject(req.userId, projectId, {
      platformId,
      configurationId,
      branch,
      buildConfig,
      environmentVariables
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'DEPLOYMENT_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.deployment,
      message: 'Deployment started successfully! 🚀 Check status for updates.'
    });

  } catch (error: any) {
    logger.error('Deploy project failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/deployment/deployments
 * Get user's deployments
 */
router.get('/deployments', async (req, res) => {
  try {
    const {
      projectId,
      platformId,
      status,
      limit = '20'
    } = req.query;

    const filters = {
      projectId: projectId as string,
      platformId: platformId as string,
      status: status as string,
      limit: parseInt(limit as string)
    };

    const deployments = deploymentService.getUserDeployments(req.userId, filters);

    res.json({
      success: true,
      data: {
        deployments,
        total: deployments.length,
        filters: {
          statuses: ['pending', 'building', 'deploying', 'success', 'failed', 'cancelled'],
          platforms: ['vercel', 'netlify', 'github_pages', 'firebase']
        }
      }
    });

  } catch (error: any) {
    logger.error('Get deployments failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/deployment/deployments/:deploymentId
 * Get deployment details
 */
router.get('/deployments/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    
    const deployment = deploymentService.getDeployment(req.userId, deploymentId);

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: 'Deployment not found',
        code: 'DEPLOYMENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: deployment
    });

  } catch (error: any) {
    logger.error('Get deployment details failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/deployment/deployments/:deploymentId/cancel
 * Cancel deployment
 */
router.post('/deployments/:deploymentId/cancel', async (req, res) => {
  try {
    const { deploymentId } = req.params;

    const result = await deploymentService.cancelDeployment(req.userId, deploymentId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'CANCEL_FAILED'
      });
    }

    res.json({
      success: true,
      message: 'Deployment cancelled successfully'
    });

  } catch (error: any) {
    logger.error('Cancel deployment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// DEPLOYMENT ANALYTICS ROUTES
// =============================================================================

/**
 * GET /api/deployment/analytics
 * Get deployment analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const { timeframe = '30' } = req.query;
    
    const analytics = deploymentService.getDeploymentAnalytics(
      req.userId, 
      parseInt(timeframe as string)
    );

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    logger.error('Get deployment analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// DEPLOYMENT LOGS ROUTES
// =============================================================================

/**
 * GET /api/deployment/deployments/:deploymentId/logs
 * Get deployment build logs
 */
router.get('/deployments/:deploymentId/logs', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    
    const deployment = deploymentService.getDeployment(req.userId, deploymentId);

    if (!deployment) {
      return res.status(404).json({
        success: false,
        error: 'Deployment not found',
        code: 'DEPLOYMENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        logs: deployment.buildLog,
        status: deployment.status,
        duration: deployment.buildDuration,
        error: deployment.error
      }
    });

  } catch (error: any) {
    logger.error('Get deployment logs failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// DEPLOYMENT TEMPLATES ROUTES
// =============================================================================

/**
 * GET /api/deployment/templates
 * Get deployment templates for different project types
 */
router.get('/templates', async (req, res) => {
  try {
    const { projectType, framework } = req.query;

    const templates = [
      {
        id: 'nextjs_vercel',
        name: 'Next.js to Vercel',
        description: 'Optimized Next.js deployment to Vercel with SSR',
        projectType: 'web',
        framework: 'Next.js',
        platform: 'vercel',
        buildConfig: {
          buildCommand: 'npm run build',
          outputDirectory: '.next',
          installCommand: 'npm ci'
        },
        environmentVariables: [
          { name: 'NODE_ENV', value: 'production', required: true },
          { name: 'DATABASE_URL', description: 'Database connection string', required: false }
        ],
        estimatedTime: '2-5 minutes',
        isRecommended: true
      },
      {
        id: 'react_netlify',
        name: 'React SPA to Netlify',
        description: 'Static React app deployment with redirect rules',
        projectType: 'web',
        framework: 'React',
        platform: 'netlify',
        buildConfig: {
          buildCommand: 'npm run build',
          outputDirectory: 'build',
          installCommand: 'npm ci'
        },
        environmentVariables: [
          { name: 'REACT_APP_API_URL', description: 'API endpoint URL', required: false }
        ],
        estimatedTime: '1-3 minutes',
        isRecommended: true
      },
      {
        id: 'static_github_pages',
        name: 'Static Site to GitHub Pages',
        description: 'Deploy static sites using GitHub Actions',
        projectType: 'web',
        framework: 'Static',
        platform: 'github_pages',
        buildConfig: {
          buildCommand: 'npm run build',
          outputDirectory: 'dist',
          installCommand: 'npm ci'
        },
        environmentVariables: [],
        estimatedTime: '3-7 minutes',
        isRecommended: false
      }
    ];

    let filteredTemplates = templates;

    if (projectType) {
      filteredTemplates = filteredTemplates.filter(t => t.projectType === projectType);
    }

    if (framework) {
      filteredTemplates = filteredTemplates.filter(t => 
        t.framework.toLowerCase() === (framework as string).toLowerCase()
      );
    }

    res.json({
      success: true,
      data: {
        templates: filteredTemplates,
        total: filteredTemplates.length,
        categories: {
          projectTypes: ['web', 'mobile', 'backend', 'fullstack'],
          frameworks: ['Next.js', 'React', 'Vue.js', 'Angular', 'Static'],
          platforms: ['vercel', 'netlify', 'github_pages', 'firebase']
        }
      }
    });

  } catch (error: any) {
    logger.error('Get deployment templates failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/deployment/quick-deploy
 * Quick deployment using template
 */
router.post('/quick-deploy', async (req, res) => {
  try {
    const {
      projectId,
      templateId,
      customizations = {}
    } = req.body;

    if (!projectId || !templateId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID and template ID are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Get template configuration
    const templates = [
      { id: 'nextjs_vercel', platformId: 'vercel' },
      { id: 'react_netlify', platformId: 'netlify' },
      { id: 'static_github_pages', platformId: 'github_pages' }
    ];

    const template = templates.find(t => t.id === templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND'
      });
    }

    // Deploy using template
    const result = await deploymentService.deployProject(req.userId, projectId, {
      platformId: template.platformId,
      buildConfig: customizations.buildConfig,
      environmentVariables: customizations.environmentVariables
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'QUICK_DEPLOY_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.deployment,
      message: 'Quick deployment started successfully! 🚀'
    });

  } catch (error: any) {
    logger.error('Quick deploy failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;