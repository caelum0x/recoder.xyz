/**
 * Developer API Routes for Recoder.ai DaaS Platform
 * Handles user registration, project management, and developer features
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { userService } from '../services/user-service';
import { projectService } from '../services/project-service';
import { realCodeGeneratorService } from '../services/real-code-generator-service';
import { billingService } from '../services/billing-service';
import { rateLimitService } from '../services/rate-limit-service';

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
  
  // In production, validate JWT token
  req.userId = userId || 'demo-user';
  next();
};

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// USER MANAGEMENT ROUTES
// =============================================================================

/**
 * POST /api/dev/auth/register
 * Register a new developer account
 */
router.post('/auth/register', async (req, res) => {
  try {
    const { email, username, password, displayName, referralCode } = req.body;

    if (!email || !username || !password || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'Email, username, password, and display name are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await userService.registerUser({
      email,
      username,
      password,
      displayName,
      referralCode
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'REGISTRATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        message: 'Account created successfully! Welcome to Recoder.ai 🚀'
      }
    });

  } catch (error: any) {
    logger.error('Registration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/dev/auth/login
 * Authenticate developer login
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email/username and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    const result = await userService.loginUser({
      emailOrUsername,
      password,
      deviceInfo: {
        userAgent: req.get('User-Agent') || '',
        ip: req.ip
      }
    });

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: result.error,
        code: 'LOGIN_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        user: result.user,
        session: result.session,
        message: 'Login successful! Welcome back 👋'
      }
    });

  } catch (error: any) {
    logger.error('Login failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/dev/user/profile
 * Get current user profile
 */
router.get('/user/profile', async (req, res) => {
  try {
    const user = userService.getUserProfile(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error: any) {
    logger.error('Get profile failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * PUT /api/dev/user/profile
 * Update user profile
 */
router.put('/user/profile', async (req, res) => {
  try {
    const updates = req.body;
    
    const result = await userService.updateUserProfile(req.userId, updates);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'UPDATE_FAILED'
      });
    }

    res.json({
      success: true,
      data: result.user,
      message: 'Profile updated successfully ✅'
    });

  } catch (error: any) {
    logger.error('Profile update failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/dev/user/analytics
 * Get user analytics and stats
 */
router.get('/user/analytics', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const analytics = userService.getUserAnalytics(req.userId, days);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    logger.error('Get analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// PROJECT MANAGEMENT ROUTES
// =============================================================================

/**
 * POST /api/dev/projects
 * Create a new project
 */
router.post('/projects', async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      framework,
      prompt,
      features = [],
      visibility = 'private',
      teamId,
      templateId
    } = req.body;

    // Validate required fields
    if (!name || !description || !type || !framework || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Name, description, type, framework, and prompt are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Check rate limits
    const rateLimitResult = await rateLimitService.checkRateLimit(
      req.userId,
      'code-generation',
      5000 // Estimated tokens for project creation
    );

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: rateLimitResult.reason,
        code: 'RATE_LIMITED',
        retryAfter: rateLimitResult.retryAfter
      });
    }

    // Create project
    const projectResult = await projectService.createProject(req.userId, {
      name,
      description,
      type,
      framework,
      prompt,
      features,
      visibility,
      teamId,
      templateId
    });

    if (!projectResult.success) {
      return res.status(400).json({
        success: false,
        error: projectResult.error,
        code: 'PROJECT_CREATION_FAILED'
      });
    }

    const project = projectResult.project!;

    // Generate code for the project
    logger.info(`🚀 Starting code generation for project: ${project.name}`);

    try {
      const generationResult = await realCodeGeneratorService.generateCode({
        description: prompt,
        type: type as any,
        framework,
        features,
        outputPath: './generated',
        userId: req.userId
      });

      if (generationResult.success) {
        // Update project with generated code
        await projectService.updateProjectWithCode(project.id, {
          files: generationResult.files,
          readme: generationResult.instructions,
          tokensUsed: generationResult.metadata.tokensUsed,
          generationTime: generationResult.metadata.generationTime,
          aiModel: generationResult.metadata.model
        });

        // Record usage for rate limiting
        rateLimitService.recordUsage(req.userId, generationResult.metadata.tokensUsed);

        // Track usage for billing
        await billingService.trackUsage({
          userId: req.userId,
          requestType: 'code-generation',
          model: generationResult.metadata.model,
          provider: generationResult.metadata.provider,
          projectType: type,
          tokensUsed: generationResult.metadata.tokensUsed,
          cost: generationResult.metadata.tokensUsed * 0.001,
          latency: generationResult.metadata.generationTime,
          success: true,
          metadata: {
            projectSize: generationResult.files.reduce((sum, f) => sum + f.content.length, 0) / 1024,
            complexity: features.length > 3 ? 'high' : features.length > 1 ? 'medium' : 'low',
            features,
            outputFiles: generationResult.files.length
          }
        });

        logger.info(`✅ Code generation completed for project: ${project.name}`);
      }
    } catch (generationError: any) {
      logger.error(`Code generation failed for project ${project.name}:`, generationError);
      // Project still exists, but without generated code
    }

    // Return the project (with or without generated code)
    const updatedProject = projectService.getUserProjects(req.userId, { limit: 1 }).projects[0];
    
    res.status(201).json({
      success: true,
      data: updatedProject || project,
      message: `Project "${name}" created successfully! 🎉`
    });

  } catch (error: any) {
    logger.error('Project creation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/dev/projects
 * Get user's projects
 */
router.get('/projects', async (req, res) => {
  try {
    const {
      type,
      status,
      visibility,
      limit = '20',
      offset = '0'
    } = req.query;

    const result = projectService.getUserProjects(req.userId, {
      type: type as string,
      status: status as string,
      visibility: visibility as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      success: true,
      data: {
        projects: result.projects,
        total: result.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });

  } catch (error: any) {
    logger.error('Get projects failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/dev/projects/:id
 * Get specific project details
 */
router.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's projects to check ownership
    const userProjects = projectService.getUserProjects(req.userId);
    const project = userProjects.projects.find(p => p.id === id);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found or access denied',
        code: 'PROJECT_NOT_FOUND'
      });
    }

    // Increment view count if not owner
    project.views += 1;

    res.json({
      success: true,
      data: project
    });

  } catch (error: any) {
    logger.error('Get project failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/dev/projects/:id/like
 * Like/unlike a project
 */
router.post('/projects/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await projectService.toggleProjectLike(id, req.userId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
        code: 'LIKE_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        liked: result.liked,
        message: result.liked ? 'Project liked! 👍' : 'Project unliked 👎'
      }
    });

  } catch (error: any) {
    logger.error('Toggle like failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/dev/projects/:id/fork
 * Fork a project
 */
router.post('/projects/:id/fork', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, visibility = 'private' } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Fork name is required',
        code: 'MISSING_NAME'
      });
    }

    const result = await projectService.forkProject(id, req.userId, {
      name,
      description,
      visibility
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'FORK_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.project,
      message: `Project forked as "${name}" successfully! 🍴`
    });

  } catch (error: any) {
    logger.error('Fork project failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// PROJECT GALLERY & DISCOVERY ROUTES
// =============================================================================

/**
 * GET /api/dev/gallery
 * Get public project gallery
 */
router.get('/gallery', async (req, res) => {
  try {
    const {
      type,
      framework,
      tags,
      sortBy = 'recent',
      limit = '20',
      offset = '0'
    } = req.query;

    const tagsArray = tags ? (tags as string).split(',') : undefined;

    const result = projectService.getPublicGallery({
      type: type as string,
      framework: framework as string,
      tags: tagsArray,
      sortBy: sortBy as any,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      success: true,
      data: {
        projects: result.projects,
        total: result.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });

  } catch (error: any) {
    logger.error('Get gallery failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/dev/templates
 * Get project templates
 */
router.get('/templates', async (req, res) => {
  try {
    const {
      category,
      type,
      difficulty,
      framework,
      isPremium,
      limit
    } = req.query;

    const templates = projectService.getProjectTemplates({
      category: category as string,
      type: type as string,
      difficulty: difficulty as string,
      framework: framework as string,
      isPremium: isPremium === 'true',
      limit: limit ? parseInt(limit as string) : undefined
    });

    res.json({
      success: true,
      data: templates
    });

  } catch (error: any) {
    logger.error('Get templates failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// ANALYTICS & INSIGHTS ROUTES
// =============================================================================

/**
 * GET /api/dev/analytics/projects
 * Get project analytics
 */
router.get('/analytics/projects', async (req, res) => {
  try {
    const analytics = projectService.generateProjectAnalytics(req.userId);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    logger.error('Get project analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/dev/subscription/status
 * Get user's subscription status
 */
router.get('/subscription/status', async (req, res) => {
  try {
    const subscription = billingService.getUserSubscription(req.userId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'No subscription found',
        code: 'SUBSCRIPTION_NOT_FOUND'
      });
    }

    // Get usage limits check
    const usageCheck = await billingService.checkUsageLimit(req.userId, 'status-check', 0);

    res.json({
      success: true,
      data: {
        subscription,
        usage: usageCheck.usage,
        rateLimits: {
          allowed: usageCheck.allowed,
          reason: usageCheck.reason
        }
      }
    });

  } catch (error: any) {
    logger.error('Get subscription status failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;