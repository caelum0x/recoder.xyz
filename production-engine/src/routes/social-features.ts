/**
 * Social Features API Routes for Recoder.ai DaaS Platform
 * Handles project sharing, comments, follows, and social interactions
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { projectSharingService } from '../services/project-sharing-service';
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

// Optional authentication middleware
const optionalAuth = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'] as string;
  
  req.userId = userId || null;
  next();
};

// =============================================================================
// PROJECT SHARING ROUTES
// =============================================================================

/**
 * POST /api/social/projects/:projectId/share
 * Create project share configuration
 */
router.post('/projects/:projectId/share', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      shareType = 'public',
      permissions = {
        canView: true,
        canFork: true,
        canComment: true,
        canSuggestEdits: false,
        canDownload: true
      },
      allowedUsers,
      allowedTeams,
      expiresAt,
      maxViews,
      requireAuth = false,
      allowAnonymous = true
    } = req.body;

    const result = await projectSharingService.createShareConfiguration(
      projectId,
      req.userId,
      {
        shareType,
        permissions,
        allowedUsers,
        allowedTeams,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        maxViews,
        requireAuth,
        allowAnonymous
      }
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'SHARE_CREATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.shareConfig,
      message: 'Project share configuration created successfully! 📤'
    });

  } catch (error: any) {
    logger.error('Create share failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/social/share/:shareUrl
 * Access shared project (public endpoint)
 */
router.get('/share/:shareUrl', optionalAuth, async (req, res) => {
  try {
    const { shareUrl } = req.params;
    const { accessCode } = req.query;

    const result = await projectSharingService.accessSharedProject(
      `/${shareUrl}`,
      req.userId,
      accessCode as string
    );

    if (!result.success) {
      return res.status(403).json({
        success: false,
        error: result.error,
        code: 'ACCESS_DENIED'
      });
    }

    res.json({
      success: true,
      data: {
        project: result.project,
        shareConfig: {
          ...result.shareConfig,
          accessCode: undefined // Don't expose access code
        }
      }
    });

  } catch (error: any) {
    logger.error('Access shared project failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/social/projects/:projectId/sharing/analytics
 * Get project sharing analytics
 */
router.get('/projects/:projectId/sharing/analytics', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const analytics = projectSharingService.getProjectSharingAnalytics(projectId, req.userId);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Project not found or access denied',
        code: 'PROJECT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    logger.error('Get sharing analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// COMMENT ROUTES
// =============================================================================

/**
 * POST /api/social/projects/:projectId/comments
 * Add comment to project
 */
router.post('/projects/:projectId/comments', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      content,
      type = 'general',
      file,
      line,
      parentId
    } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required',
        code: 'MISSING_CONTENT'
      });
    }

    const result = await projectSharingService.addProjectComment(
      projectId,
      req.userId,
      {
        content,
        type,
        file,
        line,
        parentId
      }
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'COMMENT_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.comment,
      message: 'Comment added successfully! 💬'
    });

  } catch (error: any) {
    logger.error('Add comment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/social/projects/:projectId/comments
 * Get project comments
 */
router.get('/projects/:projectId/comments', optionalAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { type, file, parentId } = req.query;

    let comments = projectSharingService.getProjectComments(projectId);

    // Apply filters
    if (type) {
      comments = comments.filter(c => c.type === type);
    }
    if (file) {
      comments = comments.filter(c => c.file === file);
    }
    if (parentId) {
      comments = comments.filter(c => c.parentId === parentId);
    }

    // Group comments by thread for better organization
    const threads = new Map();
    comments.forEach(comment => {
      if (!threads.has(comment.threadId)) {
        threads.set(comment.threadId, []);
      }
      threads.get(comment.threadId).push(comment);
    });

    const threadedComments = Array.from(threads.values()).map(threadComments => ({
      threadId: threadComments[0].threadId,
      comments: threadComments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    }));

    res.json({
      success: true,
      data: {
        comments,
        threads: threadedComments,
        total: comments.length
      }
    });

  } catch (error: any) {
    logger.error('Get comments failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// FOLLOW/SOCIAL ROUTES
// =============================================================================

/**
 * POST /api/social/users/:userId/follow
 * Follow/unfollow user
 */
router.post('/users/:userId/follow', authenticate, async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;

    const result = await projectSharingService.toggleUserFollow(
      req.userId,
      targetUserId
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'FOLLOW_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        following: result.following,
        message: result.following ? 'User followed successfully! 👥' : 'User unfollowed 👋'
      }
    });

  } catch (error: any) {
    logger.error('Toggle follow failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/social/feed
 * Get user's social activity feed
 */
router.get('/feed', authenticate, async (req, res) => {
  try {
    const { limit = '50' } = req.query;

    const feed = projectSharingService.getUserSocialFeed(
      req.userId,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: {
        activities: feed,
        total: feed.length
      }
    });

  } catch (error: any) {
    logger.error('Get social feed failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// TRENDING ROUTES
// =============================================================================

/**
 * GET /api/social/trending
 * Get trending projects
 */
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const {
      timeframe = 'week',
      category,
      limit = '20'
    } = req.query;

    const trendingProjects = projectSharingService.getTrendingProjects(
      timeframe as 'day' | 'week' | 'month',
      category as string,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: {
        projects: trendingProjects,
        total: trendingProjects.length,
        timeframe,
        category: category || 'all'
      }
    });

  } catch (error: any) {
    logger.error('Get trending failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/social/trending/categories
 * Get trending categories and stats
 */
router.get('/trending/categories', async (req, res) => {
  try {
    const categories = [
      {
        id: 'web',
        name: 'Web Apps',
        description: 'Modern web applications and SPAs',
        count: 1247,
        growth: '+15%',
        trending: true,
        icon: '🌐',
        examples: ['React', 'Vue', 'Angular']
      },
      {
        id: 'saas',
        name: 'SaaS Platforms',
        description: 'Software-as-a-Service applications',
        count: 892,
        growth: '+28%',
        trending: true,
        icon: '🚀',
        examples: ['Dashboard', 'CRM', 'Analytics']
      },
      {
        id: 'ecommerce',
        name: 'E-commerce',
        description: 'Online stores and marketplaces',
        count: 634,
        growth: '+12%',
        trending: false,
        icon: '🛒',
        examples: ['Store', 'Cart', 'Payments']
      },
      {
        id: 'mobile',
        name: 'Mobile Apps',
        description: 'React Native and mobile solutions',
        count: 423,
        growth: '+22%',
        trending: true,
        icon: '📱',
        examples: ['React Native', 'Expo', 'Flutter']
      },
      {
        id: 'blockchain',
        name: 'Blockchain',
        description: 'DeFi, NFT, and Web3 applications',
        count: 312,
        growth: '+45%',
        trending: true,
        icon: '⛓️',
        examples: ['Solana', 'Ethereum', 'DeFi']
      },
      {
        id: 'ai',
        name: 'AI/ML',
        description: 'Artificial Intelligence applications',
        count: 278,
        growth: '+67%',
        trending: true,
        icon: '🤖',
        examples: ['ChatBot', 'Image Gen', 'Analytics']
      }
    ];

    res.json({
      success: true,
      data: {
        categories,
        totalCategories: categories.length,
        totalProjects: categories.reduce((sum, cat) => sum + cat.count, 0)
      }
    });

  } catch (error: any) {
    logger.error('Get trending categories failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// SOCIAL STATS ROUTES
// =============================================================================

/**
 * GET /api/social/stats/platform
 * Get platform-wide social statistics
 */
router.get('/stats/platform', async (req, res) => {
  try {
    // In production, these would be calculated from actual data
    const stats = {
      projects: {
        total: 12847,
        public: 8932,
        shared: 4521,
        trending: 156
      },
      users: {
        total: 15234,
        active: 8943,
        developers: 12456,
        organizations: 789
      },
      engagement: {
        totalViews: 245678,
        totalLikes: 34521,
        totalComments: 18934,
        totalShares: 9876,
        totalForks: 15423
      },
      growth: {
        projectsThisWeek: 234,
        usersThisWeek: 456,
        engagementGrowth: '+24%',
        popularityGrowth: '+18%'
      },
      topTags: [
        { tag: 'react', count: 3421, growth: '+15%' },
        { tag: 'nextjs', count: 2789, growth: '+28%' },
        { tag: 'saas', count: 1987, growth: '+32%' },
        { tag: 'ecommerce', count: 1654, growth: '+12%' },
        { tag: 'dashboard', count: 1432, growth: '+22%' }
      ]
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    logger.error('Get platform stats failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;