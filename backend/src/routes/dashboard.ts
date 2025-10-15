/**
 * Dashboard API Routes
 * Provides real data for all dashboard pages
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateUser } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Helper to get date range
function getDateRange(range: string = '7d') {
  const endDate = new Date();
  const startDate = new Date();

  switch (range) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  return { startDate, endDate };
}

/**
 * GET /api/dashboard/overview
 * Get dashboard overview stats
 */
router.get('/overview', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { range = '7d' } = req.query;
    const { startDate, endDate } = getDateRange(range as string);

    // Get usage stats
    const usageStats = await prisma.usageRecord.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        tokens: true,
        cost: true
      },
      _count: true
    });

    // Get project count
    const projectCount = await prisma.project.count({
      where: { userId }
    });

    // Get API keys count
    const apiKeysCount = await prisma.apiKey.count({
      where: { userId, isActive: true }
    });

    // Get recent usage trend
    const usageTrend = await prisma.usageRecord.groupBy({
      by: ['timestamp'],
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        tokens: true,
        cost: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    // Get subscription info
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: {
        usage: {
          totalRequests: usageStats._count || 0,
          totalTokens: usageStats._sum.tokens || 0,
          totalCost: usageStats._sum.cost || 0
        },
        projects: projectCount,
        apiKeys: apiKeysCount,
        subscription: subscription ? {
          plan: subscription.planId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd
        } : null,
        usageTrend: usageTrend.map(item => ({
          date: item.timestamp,
          tokens: item._sum.tokens || 0,
          cost: item._sum.cost || 0
        }))
      }
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard overview'
    });
  }
});

/**
 * GET /api/dashboard/usage
 * Get detailed usage analytics
 */
router.get('/usage', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { range = '7d', groupBy = 'day' } = req.query;
    const { startDate, endDate } = getDateRange(range as string);

    // Get total usage
    const totalUsage = await prisma.usageRecord.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        tokens: true,
        cost: true,
        duration: true
      },
      _count: true
    });

    // Get usage by type
    const usageByType = await prisma.usageRecord.groupBy({
      by: ['type'],
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        tokens: true,
        cost: true
      },
      _count: true
    });

    // Get usage trend
    const usageTrend = await prisma.usageAnalytics.findMany({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { timestamp: 'asc' },
      take: 100
    });

    // Get AI provider breakdown
    const providerBreakdown = await prisma.usageAnalytics.groupBy({
      by: ['provider'],
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        tokens: true,
        cost: true
      },
      _count: true
    });

    res.json({
      success: true,
      data: {
        total: {
          requests: totalUsage._count,
          tokens: totalUsage._sum.tokens || 0,
          cost: totalUsage._sum.cost || 0,
          duration: totalUsage._sum.duration || 0
        },
        byType: usageByType.map(item => ({
          type: item.type,
          requests: item._count,
          tokens: item._sum.tokens || 0,
          cost: item._sum.cost || 0
        })),
        trend: usageTrend.map(item => ({
          timestamp: item.timestamp,
          tokens: item.tokens || 0,
          cost: item.cost || 0,
          provider: item.provider,
          eventType: item.eventType
        })),
        providers: providerBreakdown.map(item => ({
          provider: item.provider,
          requests: item._count,
          tokens: item._sum.tokens || 0,
          cost: item._sum.cost || 0
        }))
      }
    });
  } catch (error) {
    console.error('Usage analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage analytics'
    });
  }
});

/**
 * GET /api/dashboard/projects
 * Get user projects with stats
 */
router.get('/projects', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { status, search, limit = 50, offset = 0 } = req.query;

    const where: any = { userId };
    
    if (status && status !== 'all') {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          codeGenerations: {
            select: { id: true },
            take: 1
          },
          usageRecords: {
            select: {
              tokens: true,
              cost: true
            },
            take: 100
          },
          _count: {
            select: {
              codeGenerations: true,
              usageRecords: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      }),
      prisma.project.count({ where })
    ]);

    const projectsWithStats = projects.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      status: project.status,
      framework: project.framework,
      language: project.language,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      stats: {
        codeGenerations: project._count.codeGenerations,
        usageRecords: project._count.usageRecords,
        totalTokens: project.usageRecords.reduce((sum, record) => sum + (record.tokens || 0), 0),
        totalCost: project.usageRecords.reduce((sum, record) => sum + (record.cost || 0), 0)
      }
    }));

    res.json({
      success: true,
      data: {
        projects: projectsWithStats,
        total,
        hasMore: (parseInt(offset as string) + projects.length) < total
      }
    });
  } catch (error) {
    console.error('Projects fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects'
    });
  }
});

/**
 * GET /api/dashboard/api-keys
 * Get user API keys
 */
router.get('/api-keys', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        metadata: true
      }
    });

    // Get usage stats for each key
    const keysWithStats = await Promise.all(
      apiKeys.map(async (key) => {
        const usageStats = await prisma.usageRecord.aggregate({
          where: {
            userId,
            metadata: {
              path: ['apiKeyId'],
              equals: key.id
            }
          },
          _sum: {
            tokens: true,
            cost: true
          },
          _count: true
        });

        return {
          ...key,
          stats: {
            requests: usageStats._count || 0,
            tokens: usageStats._sum.tokens || 0,
            cost: usageStats._sum.cost || 0
          }
        };
      })
    );

    res.json({
      success: true,
      data: { apiKeys: keysWithStats }
    });
  } catch (error) {
    console.error('API keys fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API keys'
    });
  }
});

/**
 * POST /api/dashboard/api-keys
 * Create new API key
 */
router.post('/api-keys', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, permissions = [], expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    // Generate API key
    const crypto = require('crypto');
    const apiKey = `rec_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = apiKey.substring(0, 12);
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const newKey = await prisma.apiKey.create({
      data: {
        userId,
        name,
        keyPrefix,
        keyHash,
        permissions,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true
      }
    });

    res.json({
      success: true,
      data: {
        apiKey, // Only returned once!
        keyData: {
          id: newKey.id,
          name: newKey.name,
          keyPrefix: newKey.keyPrefix,
          permissions: newKey.permissions,
          createdAt: newKey.createdAt,
          expiresAt: newKey.expiresAt
        }
      }
    });
  } catch (error) {
    console.error('API key creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key'
    });
  }
});

/**
 * DELETE /api/dashboard/api-keys/:id
 * Delete API key
 */
router.delete('/api-keys/:id', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    await prisma.apiKey.delete({
      where: {
        id,
        userId
      }
    });

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('API key deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

/**
 * GET /api/dashboard/team
 * Get team members (from AI Generated Project collaborations)
 */
router.get('/team', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get user's AI generated projects with collaborators
    const aiProjects = await prisma.aIGeneratedProject.findMany({
      where: { userId },
      include: {
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    // Flatten and deduplicate collaborators
    const collaboratorsMap = new Map();
    
    aiProjects.forEach(project => {
      project.collaborators.forEach(collab => {
        const collabId = collab.user.id;
        if (!collaboratorsMap.has(collabId)) {
          collaboratorsMap.set(collabId, {
            ...collab.user,
            role: collab.role,
            addedAt: collab.invitedAt,
            acceptedAt: collab.acceptedAt,
            projectCount: 1
          });
        } else {
          const existing = collaboratorsMap.get(collabId);
          existing.projectCount += 1;
        }
      });
    });

    const teamMembers = Array.from(collaboratorsMap.values());

    res.json({
      success: true,
      data: { teamMembers }
    });
  } catch (error) {
    console.error('Team fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team members'
    });
  }
});

/**
 * GET /api/dashboard/billing
 * Get billing information
 */
router.get('/billing', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get current subscription
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    // Get recent invoices
    const invoices = await prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Get payment methods
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await prisma.usageRecord.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startOfMonth
        }
      },
      _sum: {
        cost: true,
        tokens: true
      },
      _count: true
    });

    res.json({
      success: true,
      data: {
        subscription,
        invoices,
        paymentMethods,
        currentMonthUsage: {
          requests: monthlyUsage._count,
          tokens: monthlyUsage._sum.tokens || 0,
          cost: monthlyUsage._sum.cost || 0
        }
      }
    });
  } catch (error) {
    console.error('Billing fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch billing information'
    });
  }
});

/**
 * POST /api/dashboard/team/invite
 * Invite a team member
 */
router.post('/team/invite', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { email, role = 'member' } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Find the user to invite
    const invitedUser = await prisma.user.findUnique({
      where: { email }
    });

    if (!invitedUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's projects to add collaborator
    const projects = await prisma.aIGeneratedProject.findMany({
      where: { userId },
      take: 1
    });

    if (projects.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No projects available to add collaborators'
      });
    }

    // Add collaborator
    const collaborator = await prisma.projectCollaborator.create({
      data: {
        projectId: projects[0].id,
        userId: invitedUser.id,
        role,
        invitedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: { collaborator }
    });
  } catch (error) {
    console.error('Team invite error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send invitation'
    });
  }
});

/**
 * DELETE /api/dashboard/team/:id
 * Remove a team member
 */
router.delete('/team/:id', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id: collaboratorId } = req.params;

    // Remove collaborator
    await prisma.projectCollaborator.deleteMany({
      where: {
        userId: collaboratorId,
        project: {
          userId
        }
      }
    });

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });
  } catch (error) {
    console.error('Team member removal error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove team member'
    });
  }
});

/**
 * PATCH /api/dashboard/team/:id/role
 * Change team member role
 */
router.patch('/team/:id/role', authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id: collaboratorId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        error: 'Role is required'
      });
    }

    // Update collaborator role
    await prisma.projectCollaborator.updateMany({
      where: {
        userId: collaboratorId,
        project: {
          userId
        }
      },
      data: { role }
    });

    res.json({
      success: true,
      message: 'Role updated successfully'
    });
  } catch (error) {
    console.error('Role update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update role'
    });
  }
});

export default router;
