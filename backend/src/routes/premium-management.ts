/**
 * Premium Management Routes
 * Handles premium subscriptions, API keys, usage analytics, and billing
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Helper to generate API key
function generateApiKey(): { keyId: string; key: string; keyPrefix: string; keyHash: string } {
  const keyId = crypto.randomBytes(16).toString('hex');
  const key = `reco_live_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = key.substring(0, 20); // First 20 chars for display
  const keyHash = bcrypt.hashSync(key, 10);
  
  return { keyId, key, keyPrefix, keyHash };
}

/**
 * GET /api/premium/status
 * Get user's premium status and features
 */
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscription: {
          select: {
            planId: true,
            planName: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            amount: true,
            currency: true,
            interval: true,
            features: true
          }
        },
        apiKeys: {
          where: { isActive: true },
          select: {
            id: true,
            keyPrefix: true,
            name: true,
            createdAt: true,
            lastUsedAt: true,
            usageCount: true,
            rateLimit: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get usage stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayUsage, monthUsage, totalUsage] = await Promise.all([
      prisma.usageRecord.aggregate({
        where: {
          userId,
          timestamp: { gte: today }
        },
        _count: true,
        _sum: {
          tokens: true,
          cost: true
        }
      }),
      prisma.usageRecord.aggregate({
        where: {
          userId,
          timestamp: { gte: monthStart }
        },
        _count: true,
        _sum: {
          tokens: true,
          cost: true
        }
      }),
      prisma.usageRecord.aggregate({
        where: { userId },
        _count: true,
        _sum: {
          tokens: true,
          cost: true
        }
      })
    ]);

    // Define plan limits
    const planLimits: Record<string, any> = {
      free: {
        dailyRequests: 10,
        monthlyRequests: 100,
        tokensPerRequest: 1000,
        maxApiKeys: 1,
        features: ['Basic AI Models', 'Community Support']
      },
      weekly: {
        dailyRequests: 50,
        monthlyRequests: 1000,
        tokensPerRequest: 5000,
        maxApiKeys: 3,
        features: ['All AI Models', 'Priority Support', 'Advanced Analytics']
      },
      monthly: {
        dailyRequests: 100,
        monthlyRequests: 3000,
        tokensPerRequest: 10000,
        maxApiKeys: 5,
        features: ['All AI Models', 'Priority Support', 'Advanced Analytics', 'Team Collaboration']
      },
      pro: {
        dailyRequests: 200,
        monthlyRequests: 5000,
        tokensPerRequest: 50000,
        maxApiKeys: 10,
        features: ['All AI Models', '24/7 Support', 'Advanced Analytics', 'Team Collaboration', 'Custom Integrations']
      },
      enterprise: {
        dailyRequests: -1, // Unlimited
        monthlyRequests: -1,
        tokensPerRequest: 100000,
        maxApiKeys: -1,
        features: ['Everything in Pro', 'Dedicated Support', 'Custom SLA', 'SSO', 'Audit Logs']
      }
    };

    const currentLimits = planLimits[user.subscriptionPlan] || planLimits.free;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      subscription: {
        plan: user.subscriptionPlan,
        status: user.subscriptionStatus,
        details: user.subscription,
        limits: currentLimits
      },
      usage: {
        today: {
          requests: todayUsage._count || 0,
          tokens: todayUsage._sum.tokens || 0,
          cost: todayUsage._sum.cost || 0
        },
        month: {
          requests: monthUsage._count || 0,
          tokens: monthUsage._sum.tokens || 0,
          cost: monthUsage._sum.cost || 0
        },
        total: {
          requests: totalUsage._count || 0,
          tokens: totalUsage._sum.tokens || 0,
          cost: totalUsage._sum.cost || 0
        }
      },
      apiKeys: user.apiKeys
    });

  } catch (error) {
    console.error('Error fetching premium status:', error);
    res.status(500).json({ error: 'Failed to fetch premium status' });
  }
});

/**
 * GET /api/premium/api-keys
 * List user's API keys
 */
router.get('/api-keys', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        rateLimit: true,
        isActive: true,
        lastUsedAt: true,
        usageCount: true,
        expiresAt: true,
        createdAt: true,
        source: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ apiKeys });

  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

/**
 * POST /api/premium/api-keys
 * Generate new API key
 */
router.post('/api-keys', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, permissions = [], rateLimit, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check user's plan and API key limits
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionPlan: true,
        _count: {
          select: {
            apiKeys: { where: { isActive: true } }
          }
        }
      }
    });

    const planLimits: Record<string, number> = {
      free: 1,
      weekly: 3,
      monthly: 5,
      pro: 10,
      enterprise: -1 // Unlimited
    };

    const maxKeys = planLimits[user?.subscriptionPlan || 'free'];
    if (maxKeys !== -1 && (user?._count.apiKeys || 0) >= maxKeys) {
      return res.status(403).json({
        error: 'API key limit reached',
        message: `Your plan allows maximum ${maxKeys} API keys. Upgrade to create more.`
      });
    }

    // Generate API key
    const { keyId, key, keyPrefix, keyHash } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        keyId,
        keyHash,
        keyPrefix,
        name,
        permissions,
        rateLimit: rateLimit || {},
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        source: 'web'
      }
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'api_key_created',
        resource: 'api_key',
        resourceId: apiKey.id,
        metadata: { name, keyPrefix },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({
      success: true,
      apiKey: {
        id: apiKey.id,
        key, // Only returned once!
        keyPrefix,
        name: apiKey.name,
        createdAt: apiKey.createdAt
      },
      message: 'API key created successfully. Save this key securely - you will not be able to see it again.'
    });

  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * PATCH /api/premium/api-keys/:id
 * Update API key (name, permissions, etc.)
 */
router.patch('/api-keys/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { name, permissions, rateLimit } = req.body;

    // Verify ownership
    const existingKey = await prisma.apiKey.findFirst({
      where: { id, userId }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(permissions && { permissions }),
        ...(rateLimit && { rateLimit })
      }
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'api_key_updated',
        resource: 'api_key',
        resourceId: id,
        metadata: { name, permissions, rateLimit },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({ success: true, apiKey: updated });

  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

/**
 * DELETE /api/premium/api-keys/:id
 * Revoke API key
 */
router.delete('/api-keys/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Verify ownership
    const existingKey = await prisma.apiKey.findFirst({
      where: { id, userId }
    });

    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date()
      }
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'api_key_revoked',
        resource: 'api_key',
        resourceId: id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    res.json({ success: true, message: 'API key revoked successfully' });

  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

/**
 * GET /api/premium/usage-analytics
 * Get detailed usage analytics
 */
router.get('/usage-analytics', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get aggregated usage
    const usage = await prisma.usageRecord.groupBy({
      by: ['model', 'provider', 'platform'],
      where: {
        userId,
        timestamp: {
          gte: start,
          lte: end
        }
      },
      _count: true,
      _sum: {
        tokens: true,
        cost: true,
        duration: true
      },
      _avg: {
        tokens: true,
        cost: true,
        duration: true
      }
    });

    // Get time-series data
    const timeSeriesQuery = `
      SELECT
        DATE_TRUNC('${groupBy}', timestamp) as period,
        COUNT(*) as requests,
        SUM(tokens) as tokens,
        SUM(cost) as cost,
        AVG(duration) as avg_duration
      FROM usage_records
      WHERE user_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      GROUP BY period
      ORDER BY period ASC
    `;

    const timeSeries = await prisma.$queryRawUnsafe(timeSeriesQuery, userId, start, end);

    // Get top models
    const topModels = await prisma.usageRecord.groupBy({
      by: ['model'],
      where: {
        userId,
        timestamp: { gte: start, lte: end }
      },
      _count: true,
      _sum: { cost: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 10
    });

    // Calculate costs by platform
    const platformCosts = await prisma.usageRecord.groupBy({
      by: ['platform'],
      where: {
        userId,
        timestamp: { gte: start, lte: end }
      },
      _sum: { cost: true },
      _count: true
    });

    res.json({
      summary: {
        totalRequests: usage.reduce((sum, u) => sum + u._count, 0),
        totalTokens: usage.reduce((sum, u) => sum + (u._sum.tokens || 0), 0),
        totalCost: usage.reduce((sum, u) => sum + (u._sum.cost || 0), 0),
        avgDuration: usage.reduce((sum, u) => sum + (u._avg.duration || 0), 0) / usage.length || 0
      },
      byModel: usage,
      timeSeries,
      topModels,
      platformCosts,
      period: {
        start,
        end,
        groupBy
      }
    });

  } catch (error) {
    console.error('Error fetching usage analytics:', error);
    res.status(500).json({ error: 'Failed to fetch usage analytics' });
  }
});

/**
 * GET /api/premium/cost-breakdown
 * Get cost breakdown by various dimensions
 */
router.get('/cost-breakdown', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { period = 'month' } = req.query;

    let startDate = new Date();
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    const [byModel, byProvider, byPlatform, daily] = await Promise.all([
      // By Model
      prisma.usageRecord.groupBy({
        by: ['model'],
        where: {
          userId,
          timestamp: { gte: startDate },
          success: true
        },
        _sum: { cost: true },
        _count: true,
        orderBy: { _sum: { cost: 'desc' } }
      }),

      // By Provider
      prisma.usageRecord.groupBy({
        by: ['provider'],
        where: {
          userId,
          timestamp: { gte: startDate },
          success: true
        },
        _sum: { cost: true },
        _count: true,
        orderBy: { _sum: { cost: 'desc' } }
      }),

      // By Platform
      prisma.usageRecord.groupBy({
        by: ['platform'],
        where: {
          userId,
          timestamp: { gte: startDate },
          success: true
        },
        _sum: { cost: true },
        _count: true,
        orderBy: { _sum: { cost: 'desc' } }
      }),

      // Daily costs
      prisma.$queryRaw`
        SELECT
          DATE(timestamp) as date,
          SUM(cost) as cost,
          COUNT(*) as requests
        FROM usage_records
        WHERE user_id = ${userId}
          AND timestamp >= ${startDate}
          AND success = true
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `
    ]);

    const totalCost = byModel.reduce((sum, m) => sum + (m._sum.cost || 0), 0);

    res.json({
      totalCost,
      period,
      breakdown: {
        byModel: byModel.map(m => ({
          model: m.model,
          cost: m._sum.cost || 0,
          requests: m._count,
          percentage: totalCost > 0 ? ((m._sum.cost || 0) / totalCost * 100).toFixed(2) : 0
        })),
        byProvider: byProvider.map(p => ({
          provider: p.provider,
          cost: p._sum.cost || 0,
          requests: p._count,
          percentage: totalCost > 0 ? ((p._sum.cost || 0) / totalCost * 100).toFixed(2) : 0
        })),
        byPlatform: byPlatform.map(p => ({
          platform: p.platform,
          cost: p._sum.cost || 0,
          requests: p._count,
          percentage: totalCost > 0 ? ((p._sum.cost || 0) / totalCost * 100).toFixed(2) : 0
        }))
      },
      daily
    });

  } catch (error) {
    console.error('Error fetching cost breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch cost breakdown' });
  }
});

/**
 * POST /api/premium/export-usage
 * Export usage data as CSV/JSON
 */
router.post('/export-usage', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { format = 'csv', startDate, endDate } = req.body;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const records = await prisma.usageRecord.findMany({
      where: {
        userId,
        timestamp: {
          gte: start,
          lte: end
        }
      },
      select: {
        timestamp: true,
        requestType: true,
        model: true,
        provider: true,
        platform: true,
        tokens: true,
        cost: true,
        duration: true,
        success: true
      },
      orderBy: { timestamp: 'desc' }
    });

    if (format === 'csv') {
      const headers = ['Date', 'Type', 'Model', 'Provider', 'Platform', 'Tokens', 'Cost ($)', 'Duration (ms)', 'Success'];
      const csvRows = records.map(r => [
        r.timestamp.toISOString(),
        r.requestType,
        r.model || '',
        r.provider || '',
        r.platform || '',
        r.tokens || 0,
        r.cost || 0,
        r.duration || 0,
        r.success
      ]);

      const csv = [
        headers.join(','),
        ...csvRows.map(row => row.join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=usage-export-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({ records });
    }

  } catch (error) {
    console.error('Error exporting usage:', error);
    res.status(500).json({ error: 'Failed to export usage data' });
  }
});

module.exports = router;
