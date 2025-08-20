/**
 * Git Integration API Routes for Recoder.ai DaaS Platform
 * Handles GitHub and GitLab integrations, project exports, and deployments
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { unifiedGitIntegrationService } from '../services/unified-git-integration';

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
// INTEGRATION STATUS ROUTES
// =============================================================================

/**
 * GET /api/git/status
 * Get user's Git integration status
 */
router.get('/status', async (req, res) => {
  try {
    const status = unifiedGitIntegrationService.getIntegrationStatus(req.userId);

    res.json({
      success: true,
      data: status
    });

  } catch (error: any) {
    logger.error('Get Git status failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/git/auth/:provider
 * Get OAuth authorization URL for Git provider
 */
router.get('/auth/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { redirectUri, scopes } = req.query;

    if (!['github', 'gitlab'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be "github" or "gitlab"',
        code: 'INVALID_PROVIDER'
      });
    }

    if (!redirectUri) {
      return res.status(400).json({
        success: false,
        error: 'redirectUri is required',
        code: 'MISSING_REDIRECT_URI'
      });
    }

    const authUrl = unifiedGitIntegrationService.getAuthorizationUrl(
      provider as 'github' | 'gitlab',
      req.userId,
      redirectUri as string,
      scopes ? (scopes as string).split(',') : undefined
    );

    res.json({
      success: true,
      data: {
        authUrl,
        provider,
        userId: req.userId
      }
    });

  } catch (error: any) {
    logger.error('Get auth URL failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/git/auth/:provider/callback
 * Handle OAuth callback and exchange code for token
 */
router.post('/auth/:provider/callback', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, redirectUri } = req.body;

    if (!['github', 'gitlab'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be "github" or "gitlab"',
        code: 'INVALID_PROVIDER'
      });
    }

    if (!code || !state || !redirectUri) {
      return res.status(400).json({
        success: false,
        error: 'code, state, and redirectUri are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await unifiedGitIntegrationService.exchangeCodeForToken(
      provider as 'github' | 'gitlab',
      code,
      state,
      redirectUri
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'AUTH_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        user: result.user,
        provider,
        message: `${provider === 'github' ? 'GitHub' : 'GitLab'} integration successful! 🎉`
      }
    });

  } catch (error: any) {
    logger.error('OAuth callback failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * DELETE /api/git/auth/:provider
 * Disconnect Git provider integration
 */
router.delete('/auth/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    if (!['github', 'gitlab'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be "github" or "gitlab"',
        code: 'INVALID_PROVIDER'
      });
    }

    unifiedGitIntegrationService.disconnectProvider(
      req.userId,
      provider as 'github' | 'gitlab'
    );

    res.json({
      success: true,
      message: `${provider === 'github' ? 'GitHub' : 'GitLab'} integration disconnected successfully`
    });

  } catch (error: any) {
    logger.error('Disconnect provider failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// REPOSITORY ROUTES
// =============================================================================

/**
 * GET /api/git/repositories
 * Get all repositories from connected providers
 */
router.get('/repositories', async (req, res) => {
  try {
    const {
      provider,
      page = '1',
      perPage = '20'
    } = req.query;

    const result = await unifiedGitIntegrationService.getAllRepositories(
      req.userId,
      {
        provider: provider as 'github' | 'gitlab' | undefined,
        page: parseInt(page as string),
        perPage: parseInt(perPage as string)
      }
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'REPOSITORIES_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        repositories: result.repositories,
        total: result.totalCount,
        providers: result.providers,
        pagination: {
          page: parseInt(page as string),
          perPage: parseInt(perPage as string),
          total: result.totalCount
        }
      }
    });

  } catch (error: any) {
    logger.error('Get repositories failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// PROJECT EXPORT ROUTES
// =============================================================================

/**
 * POST /api/git/projects/:projectId/export
 * Export project to Git provider
 */
router.post('/projects/:projectId/export', async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      provider,
      name,
      description,
      visibility = 'private',
      includeReadme = true,
      includeCICD = false,
      deploymentTarget,
      namespaceId
    } = req.body;

    if (!provider || !['github', 'gitlab'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Valid provider is required (github or gitlab)',
        code: 'INVALID_PROVIDER'
      });
    }

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        error: 'Repository name and description are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await unifiedGitIntegrationService.exportProject(
      req.userId,
      projectId,
      provider as 'github' | 'gitlab',
      {
        name,
        description,
        visibility: visibility as 'public' | 'private' | 'internal',
        includeReadme,
        includeCICD,
        deploymentTarget,
        namespaceId: namespaceId ? parseInt(namespaceId) : undefined
      }
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'EXPORT_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result,
      message: `Project exported to ${provider === 'github' ? 'GitHub' : 'GitLab'} successfully! 🚀`
    });

  } catch (error: any) {
    logger.error('Export project failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// DEPLOYMENT ROUTES
// =============================================================================

/**
 * GET /api/git/deployment-targets
 * Get available deployment targets for all providers
 */
router.get('/deployment-targets', async (req, res) => {
  try {
    const targets = unifiedGitIntegrationService.getDeploymentTargets();

    res.json({
      success: true,
      data: targets
    });

  } catch (error: any) {
    logger.error('Get deployment targets failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/git/deployment-targets/:provider
 * Get deployment targets for specific provider
 */
router.get('/deployment-targets/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    if (!['github', 'gitlab'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be "github" or "gitlab"',
        code: 'INVALID_PROVIDER'
      });
    }

    const allTargets = unifiedGitIntegrationService.getDeploymentTargets();
    const providerTargets = allTargets[provider as 'github' | 'gitlab'];

    res.json({
      success: true,
      data: {
        provider,
        targets: providerTargets
      }
    });

  } catch (error: any) {
    logger.error('Get provider deployment targets failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// CONFIGURATION ROUTES
// =============================================================================

/**
 * GET /api/git/config
 * Get Git integration configuration and capabilities
 */
router.get('/config', async (req, res) => {
  try {
    const config = {
      providers: [
        {
          id: 'github',
          name: 'GitHub',
          description: 'The world\'s leading software development platform',
          icon: '🐱',
          features: [
            'Public & private repositories',
            'GitHub Actions CI/CD',
            'GitHub Pages hosting',
            'Issue tracking',
            'Pull requests',
            'Code review',
            'Project management'
          ],
          deploymentOptions: [
            'GitHub Pages',
            'Vercel',
            'Netlify',
            'AWS',
            'Azure'
          ],
          documentation: 'https://docs.github.com'
        },
        {
          id: 'gitlab',
          name: 'GitLab',
          description: 'Complete DevOps platform with built-in CI/CD',
          icon: '🦊',
          features: [
            'Public, internal & private repositories',
            'GitLab CI/CD pipelines',
            'GitLab Pages hosting',
            'Issue boards',
            'Merge requests',
            'Code quality analysis',
            'Security scanning',
            'Container registry'
          ],
          deploymentOptions: [
            'GitLab Pages',
            'Vercel',
            'Netlify',
            'Heroku',
            'AWS',
            'Azure'
          ],
          documentation: 'https://docs.gitlab.com'
        }
      ],
      supportedProjectTypes: [
        'web',
        'mobile',
        'backend',
        'fullstack',
        'blockchain',
        'ai',
        'saas',
        'ecommerce'
      ],
      cicdTemplates: [
        'Node.js',
        'React',
        'Next.js',
        'Vue.js',
        'Angular',
        'Python',
        'Java',
        'Go',
        'Rust',
        'PHP'
      ]
    };

    res.json({
      success: true,
      data: config
    });

  } catch (error: any) {
    logger.error('Get Git config failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;