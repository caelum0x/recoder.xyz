/**
 * Team Collaboration API Routes for Recoder.ai DaaS Platform
 * Handles teams, workspaces, invitations, and real-time collaboration
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { teamCollaborationService } from '../services/team-collaboration-service';
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
// TEAM MANAGEMENT ROUTES
// =============================================================================

/**
 * POST /api/teams
 * Create a new team
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      slug,
      visibility = 'private',
      subscriptionTier = 'free'
    } = req.body;

    if (!name || !description || !slug) {
      return res.status(400).json({
        success: false,
        error: 'Name, description, and slug are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await teamCollaborationService.createTeam(req.userId, {
      name,
      description,
      slug,
      visibility,
      subscriptionTier
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'TEAM_CREATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.team,
      message: `Team "${name}" created successfully! 🎉`
    });

  } catch (error: any) {
    logger.error('Team creation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/teams
 * Get user's teams
 */
router.get('/', async (req, res) => {
  try {
    const teams = teamCollaborationService.getUserTeams(req.userId);

    res.json({
      success: true,
      data: {
        teams,
        total: teams.length
      }
    });

  } catch (error: any) {
    logger.error('Get user teams failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/teams/:teamIdOrSlug
 * Get team details
 */
router.get('/:teamIdOrSlug', async (req, res) => {
  try {
    const { teamIdOrSlug } = req.params;
    const team = teamCollaborationService.getTeam(teamIdOrSlug);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found',
        code: 'TEAM_NOT_FOUND'
      });
    }

    // Check if user has access
    const member = team.members.find(m => m.userId === req.userId);
    const isPublic = team.visibility === 'public';
    
    if (!member && !isPublic) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    res.json({
      success: true,
      data: team
    });

  } catch (error: any) {
    logger.error('Get team failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/teams/:teamId/analytics
 * Get team analytics
 */
router.get('/:teamId/analytics', async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = teamCollaborationService.getTeam(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Team not found',
        code: 'TEAM_NOT_FOUND'
      });
    }

    // Check if user has access
    const member = team.members.find(m => m.userId === req.userId);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const analytics = teamCollaborationService.getTeamAnalytics(teamId);

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    logger.error('Get team analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// TEAM INVITATION ROUTES
// =============================================================================

/**
 * POST /api/teams/:teamId/invitations
 * Invite user to team
 */
router.post('/:teamId/invitations', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email, role = 'editor', message } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: 'MISSING_EMAIL'
      });
    }

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be admin, editor, or viewer',
        code: 'INVALID_ROLE'
      });
    }

    const result = await teamCollaborationService.inviteToTeam(
      teamId,
      req.userId,
      email,
      role,
      message
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'INVITATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.invitation,
      message: `Invitation sent to ${email} successfully! 📧`
    });

  } catch (error: any) {
    logger.error('Team invitation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/teams/invitations/:invitationId/accept
 * Accept team invitation
 */
router.post('/invitations/:invitationId/accept', async (req, res) => {
  try {
    const { invitationId } = req.params;

    const result = await teamCollaborationService.acceptInvitation(
      invitationId,
      req.userId
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'ACCEPT_FAILED'
      });
    }

    res.json({
      success: true,
      data: result.team,
      message: `Welcome to ${result.team?.name}! 🎉`
    });

  } catch (error: any) {
    logger.error('Accept invitation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// PROJECT SHARING ROUTES
// =============================================================================

/**
 * POST /api/teams/:teamId/projects/share
 * Share project with team
 */
router.post('/:teamId/projects/share', async (req, res) => {
  try {
    const { teamId } = req.params;
    const {
      projectId,
      permissions = {
        canEdit: true,
        canFork: true,
        canComment: true
      }
    } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID'
      });
    }

    const result = await teamCollaborationService.shareProjectWithTeam(
      projectId,
      teamId,
      req.userId,
      permissions
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'SHARE_FAILED'
      });
    }

    res.json({
      success: true,
      message: 'Project shared with team successfully! 🔄'
    });

  } catch (error: any) {
    logger.error('Share project failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// COLLABORATION SESSION ROUTES
// =============================================================================

/**
 * POST /api/teams/:teamId/collaborations/start
 * Start collaboration session
 */
router.post('/:teamId/collaborations/start', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID'
      });
    }

    const result = await teamCollaborationService.startCollaborationSession(
      projectId,
      req.userId,
      teamId
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'COLLABORATION_FAILED'
      });
    }

    res.json({
      success: true,
      data: result.session,
      message: 'Collaboration session started! 🤝'
    });

  } catch (error: any) {
    logger.error('Start collaboration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// WORKSPACE ROUTES
// =============================================================================

/**
 * POST /api/teams/:teamId/workspaces
 * Create team workspace
 */
router.post('/:teamId/workspaces', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        error: 'Name and description are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await teamCollaborationService.createWorkspace(teamId, {
      name,
      description
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'WORKSPACE_CREATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.workspace,
      message: `Workspace "${name}" created successfully! 🏢`
    });

  } catch (error: any) {
    logger.error('Workspace creation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// PUBLIC TEAM DISCOVERY ROUTES
// =============================================================================

/**
 * GET /api/teams/public/discover
 * Discover public teams
 */
router.get('/public/discover', async (req, res) => {
  try {
    const {
      category,
      size,
      sortBy = 'popular',
      limit = '20',
      offset = '0'
    } = req.query;

    // In production, this would query the database for public teams
    const mockPublicTeams = [
      {
        id: 'team_startup_accelerator',
        name: 'Startup Accelerator',
        description: 'Building the next generation of SaaS applications',
        slug: 'startup-accelerator',
        visibility: 'public',
        memberCount: 15,
        projectCount: 23,
        tags: ['saas', 'startup', 'react', 'nextjs'],
        avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=startup',
        stats: {
          totalProjects: 23,
          totalMembers: 15,
          activeMembers: 12
        }
      },
      {
        id: 'team_oss_collective',
        name: 'Open Source Collective',
        description: 'Contributing to open source projects worldwide',
        slug: 'oss-collective',
        visibility: 'public',
        memberCount: 32,
        projectCount: 67,
        tags: ['opensource', 'community', 'javascript', 'python'],
        avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=opensource',
        stats: {
          totalProjects: 67,
          totalMembers: 32,
          activeMembers: 28
        }
      }
    ];

    res.json({
      success: true,
      data: {
        teams: mockPublicTeams,
        total: mockPublicTeams.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });

  } catch (error: any) {
    logger.error('Discover teams failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;