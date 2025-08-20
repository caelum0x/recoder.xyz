/**
 * Viral Growth API Routes for Recoder.ai DaaS Platform
 * Handles referrals, sharing campaigns, and growth mechanics
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { viralGrowthService } from '../services/viral-growth-service';
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

// Optional authentication for public endpoints
const optionalAuth = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'] as string;
  
  req.userId = userId || null;
  next();
};

// =============================================================================
// REFERRAL ROUTES
// =============================================================================

/**
 * POST /api/growth/referrals/code
 * Create or get user's referral code
 */
router.post('/referrals/code', authenticate, async (req, res) => {
  try {
    const result = await viralGrowthService.createUserReferralCode(req.userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'REFERRAL_CODE_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        referralCode: result.referralCode,
        referralUrl: `https://recoder.ai/signup?ref=${result.referralCode}`,
        message: 'Referral code generated successfully! 🎯'
      }
    });

  } catch (error: any) {
    logger.error('Create referral code failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/growth/referrals/signup
 * Process referral signup (public endpoint)
 */
router.post('/referrals/signup', async (req, res) => {
  try {
    const { referralCode, userId, email, metadata } = req.body;

    if (!referralCode || !userId || !email) {
      return res.status(400).json({
        success: false,
        error: 'Referral code, user ID, and email are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await viralGrowthService.processReferralSignup(referralCode, {
      userId,
      email,
      metadata: {
        ...metadata,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'REFERRAL_SIGNUP_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.referral,
      message: 'Welcome to Recoder.ai! Your referral rewards have been credited 🎉'
    });

  } catch (error: any) {
    logger.error('Process referral signup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/growth/referrals/stats
 * Get user's referral statistics
 */
router.get('/referrals/stats', authenticate, async (req, res) => {
  try {
    const stats = viralGrowthService.getUserReferralStats(req.userId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    logger.error('Get referral stats failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// SHARING CAMPAIGN ROUTES
// =============================================================================

/**
 * POST /api/growth/sharing/campaigns
 * Create sharing campaign
 */
router.post('/sharing/campaigns', authenticate, async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      targetUrl,
      imageUrl,
      platforms = ['twitter', 'linkedin', 'facebook'],
      expiresAt
    } = req.body;

    if (!type || !title || !description || !targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Type, title, description, and target URL are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await viralGrowthService.createSharingCampaign(req.userId, {
      type,
      title,
      description,
      targetUrl,
      imageUrl,
      platforms,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'CAMPAIGN_CREATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.campaign,
      message: 'Sharing campaign created successfully! 📢'
    });

  } catch (error: any) {
    logger.error('Create sharing campaign failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/growth/sharing/track
 * Track sharing activity
 */
router.post('/sharing/track', optionalAuth, async (req, res) => {
  try {
    const { campaignId, platform, metadata } = req.body;

    if (!campaignId || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Campaign ID and platform are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await viralGrowthService.trackShare(campaignId, platform, {
      ...metadata,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date()
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'TRACKING_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        reward: result.reward,
        message: result.reward ? `You earned ${result.reward} credits for sharing! 🎁` : 'Share tracked successfully'
      }
    });

  } catch (error: any) {
    logger.error('Track share failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// GROWTH ANALYTICS ROUTES
// =============================================================================

/**
 * GET /api/growth/metrics
 * Get platform growth metrics (admin only - simplified for demo)
 */
router.get('/metrics', authenticate, async (req, res) => {
  try {
    const metrics = viralGrowthService.getGrowthMetrics();

    res.json({
      success: true,
      data: metrics
    });

  } catch (error: any) {
    logger.error('Get growth metrics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// VIRAL MECHANICS ROUTES
// =============================================================================

/**
 * GET /api/growth/leaderboard
 * Get referral leaderboard
 */
router.get('/leaderboard', optionalAuth, async (req, res) => {
  try {
    const { timeframe = 'all', limit = '10' } = req.query;

    const metrics = viralGrowthService.getGrowthMetrics();
    const leaderboard = metrics.referrals.topReferrers.slice(0, parseInt(limit as string));

    res.json({
      success: true,
      data: {
        leaderboard,
        timeframe,
        total: leaderboard.length,
        lastUpdated: new Date()
      }
    });

  } catch (error: any) {
    logger.error('Get leaderboard failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/growth/viral-content
 * Get trending viral content
 */
router.get('/viral-content', optionalAuth, async (req, res) => {
  try {
    const { limit = '20' } = req.query;

    const metrics = viralGrowthService.getGrowthMetrics();
    const viralContent = metrics.sharing.viralContent.slice(0, parseInt(limit as string));

    res.json({
      success: true,
      data: {
        content: viralContent,
        platformBreakdown: metrics.sharing.platformBreakdown,
        totalShares: metrics.sharing.totalShares,
        totalClicks: metrics.sharing.totalClicks
      }
    });

  } catch (error: any) {
    logger.error('Get viral content failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// PRESET SHARING TEMPLATES
// =============================================================================

/**
 * GET /api/growth/sharing/templates
 * Get sharing templates for different content types
 */
router.get('/sharing/templates', optionalAuth, async (req, res) => {
  try {
    const templates = {
      project: [
        {
          id: 'project_showcase',
          title: '🚀 Check out my latest project built with AI!',
          description: 'I just created {projectName} using Recoder.ai in minutes. The future of development is here!',
          hashtags: ['RecoderAI', 'AI', 'CodeGeneration', 'Development'],
          platforms: ['twitter', 'linkedin', 'facebook']
        },
        {
          id: 'technical_share',
          title: 'Built {projectName} with {framework}',
          description: 'Generated a complete {projectType} application using AI. Features include {features}. Check it out!',
          hashtags: ['Programming', 'AI', 'Development', 'Tech'],
          platforms: ['twitter', 'linkedin', 'reddit', 'hackernews']
        }
      ],
      achievement: [
        {
          id: 'milestone_reached',
          title: '🎉 Just reached {milestone} on Recoder.ai!',
          description: 'Loving how AI is transforming my development workflow. What took hours now takes minutes!',
          hashtags: ['RecoderAI', 'Milestone', 'Development', 'AI'],
          platforms: ['twitter', 'linkedin']
        }
      ],
      profile: [
        {
          id: 'developer_showcase',
          title: '👨‍💻 Developer Profile: Building the future with AI',
          description: 'Check out my developer profile and projects on Recoder.ai. Join me in the AI development revolution!',
          hashtags: ['Developer', 'AI', 'Profile', 'Programming'],
          platforms: ['twitter', 'linkedin', 'facebook']
        }
      ]
    };

    res.json({
      success: true,
      data: templates
    });

  } catch (error: any) {
    logger.error('Get sharing templates failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/growth/sharing/quick-share
 * Quick share with preset template
 */
router.post('/sharing/quick-share', authenticate, async (req, res) => {
  try {
    const {
      templateId,
      variables = {},
      platforms = ['twitter', 'linkedin'],
      targetUrl
    } = req.body;

    if (!templateId || !targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Template ID and target URL are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Get user profile for personalization
    const user = userService.getUserProfile(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Create quick sharing campaign
    const title = `Check out what I built with Recoder.ai!`;
    const description = `I just created an amazing project using AI-powered code generation. The future of development is here! 🚀`;

    const result = await viralGrowthService.createSharingCampaign(req.userId, {
      type: 'project',
      title,
      description,
      targetUrl,
      platforms
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'QUICK_SHARE_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: {
        campaign: result.campaign,
        shareUrls: result.campaign?.platforms.map(p => ({
          platform: p.platform,
          url: p.shareUrl,
          message: p.message
        }))
      },
      message: 'Quick share campaign created! Start sharing to earn rewards 📢'
    });

  } catch (error: any) {
    logger.error('Quick share failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;