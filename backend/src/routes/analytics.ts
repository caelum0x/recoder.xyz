// Analytics API Routes
// Enterprise usage analytics and billing monitoring

const express = require('express');
const { query, validationResult } = require('express-validator');
const { authenticateUser, requireSubscription } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { prisma } = require('../database/prisma');
const { Parser } = require('json2csv');
const { getErrorMessage } = require('../utils/error-helpers');

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
    return;
  }
  next();
};

// Helper function to get date range
const getDateRange = (range) => {
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
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  return { startDate, endDate };
};

/**
 * GET /api/analytics/metrics
 * Get key usage metrics
 */
router.get('/metrics',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  [query('range').optional().isIn(['24h', '7d', '30d', '90d', '1y'])],
  validateRequest,
  async (req, res) => {
    try {
      const range = req.query.range as string || '7d';
      const { startDate, endDate } = getDateRange(range);
      const userId = req.user.id;

      // Get usage metrics
      const usageMetrics = await prisma.usageRecord.aggregate({
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
        _avg: {
          tokens: true,
          cost: true
        }
      });

      // Get unique active users in the period
      const activeUsers = await prisma.usageRecord.findMany({
        where: {
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        select: { userId: true },
        distinct: ['userId']
      });

      // Get most used service type
      const topProvider = await prisma.usageRecord.groupBy({
        by: ['type'],
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        _count: {
          type: true
        },
        orderBy: {
          _count: {
            type: 'desc'
          }
        },
        take: 1
      });

      // Calculate session duration (mock for now)
      const averageSessionDuration = 12.5; // minutes

      const totalTokens = usageMetrics._sum.tokens || 0;
      const totalCost = usageMetrics._sum.cost || 0;
      const avgDuration = (usageMetrics._avg as any)?.duration || 0;

      res.json({
        success: true,
        data: {
          totalTokens,
          totalCost,
          averageDuration: avgDuration,
          activeUsers: activeUsers.length,
          averageSessionDuration,
          topServiceType: topProvider[0]?.type || 'Unknown',
          costPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
          usageCount: activeUsers.length
        }
      });
    } catch (error) {
      logger.error('Failed to get usage metrics', { error: getErrorMessage(error), userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get usage metrics'
      });
    }
  }
);

/**
 * GET /api/analytics/timeseries
 * Get time series usage data
 */
router.get('/timeseries',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  [query('range').optional().isIn(['24h', '7d', '30d', '90d', '1y'])],
  validateRequest,
  async (req, res) => {
    try {
      const range = req.query.range as string || '7d';
      const { startDate, endDate } = getDateRange(range);
      const userId = req.user.id;

      // Group by day for most ranges
      const groupBy = range === '24h' ? 'hour' : 'day';
      
      let timeSeriesData;

      if (groupBy === 'day') {
        timeSeriesData = await prisma.$queryRaw`
          SELECT 
            DATE(created_at) as date,
            COALESCE(SUM(tokens_used), 0) as tokens,
            COALESCE(SUM(requests_made), 0) as requests,
            COALESCE(SUM(cost_cents), 0) / 100.0 as cost,
            COUNT(DISTINCT user_id) as users
          FROM usage 
          WHERE user_id = ${userId}
            AND created_at >= ${startDate}
            AND created_at <= ${endDate}
          GROUP BY DATE(created_at)
          ORDER BY date ASC
        `;
      } else {
        timeSeriesData = await prisma.$queryRaw`
          SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            DATE(created_at) as date,
            COALESCE(SUM(tokens_used), 0) as tokens,
            COALESCE(SUM(requests_made), 0) as requests,
            COALESCE(SUM(cost_cents), 0) / 100.0 as cost,
            COUNT(DISTINCT user_id) as users
          FROM usage 
          WHERE user_id = ${userId}
            AND created_at >= ${startDate}
            AND created_at <= ${endDate}
          GROUP BY DATE(created_at), EXTRACT(HOUR FROM created_at)
          ORDER BY date ASC, hour ASC
        `;
      }

      // Format the data
      const formattedData = timeSeriesData.map((row: any) => ({
        date: groupBy === 'day' ? row.date.toISOString().split('T')[0] : 
              `${row.date.toISOString().split('T')[0]} ${row.hour}:00`,
        tokens: parseInt(row.tokens),
        requests: parseInt(row.requests),
        cost: parseFloat(row.cost),
        users: parseInt(row.users)
      }));

      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      logger.error('Failed to get time series data', { error: getErrorMessage(error), userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get time series data'
      });
    }
  }
);

/**
 * GET /api/analytics/providers
 * Get AI provider usage breakdown
 */
router.get('/providers',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  [query('range').optional().isIn(['24h', '7d', '30d', '90d', '1y'])],
  validateRequest,
  async (req, res) => {
    try {
      const range = req.query.range as string || '7d';
      const { startDate, endDate } = getDateRange(range);
      const userId = req.user.id;

      const providerData = await prisma.usageRecord.groupBy({
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
        orderBy: {
          _sum: {
            tokens: 'desc'
          }
        }
      });

      // Calculate percentages
      const totalTokens = providerData.reduce((sum, item) => sum + (item._sum.tokens || 0), 0);

      const formattedData = providerData.map(item => ({
        provider: (item as any).aiProvider || 'Unknown',
        tokens: item._sum.tokens || 0,
        requests: 1, // Each record represents one request
        cost: (item._sum.cost || 0),
        percentage: totalTokens > 0 ? Math.round(((item._sum.tokens || 0) / totalTokens) * 100) : 0
      }));

      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      logger.error('Failed to get provider usage', { error: getErrorMessage(error), userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get provider usage'
      });
    }
  }
);

/**
 * GET /api/analytics/users
 * Get user usage analytics (Enterprise only)
 */
router.get('/users',
  authenticateUser,
  requireSubscription(['enterprise']),
  [query('range').optional().isIn(['24h', '7d', '30d', '90d', '1y'])],
  validateRequest,
  async (req, res) => {
    try {
      const range = req.query.range as string || '7d';
      const { startDate, endDate } = getDateRange(range);

      // For enterprise users, show organization-wide data
      const userUsageData = await prisma.$queryRaw`
        SELECT 
          u.id as user_id,
          u.name as user_name,
          u.email,
          u.subscription_plan as plan,
          u.updated_at as last_active,
          COALESCE(SUM(usage.tokens_used), 0) as tokens,
          COALESCE(SUM(usage.requests_made), 0) as requests,
          COALESCE(SUM(usage.cost_cents), 0) / 100.0 as cost
        FROM users u
        LEFT JOIN usage ON u.id = usage.user_id 
          AND usage.created_at >= ${startDate}
          AND usage.created_at <= ${endDate}
        WHERE u.subscription_status = 'active'
        GROUP BY u.id, u.name, u.email, u.subscription_plan, u.updated_at
        HAVING COALESCE(SUM(usage.tokens_used), 0) > 0
        ORDER BY cost DESC
        LIMIT 50
      `;

      const formattedData = (userUsageData as any[]).map((row: any) => ({
        userId: row.user_id.toString(),
        userName: row.user_name,
        email: row.email,
        tokens: parseInt(row.tokens),
        requests: parseInt(row.requests),
        cost: parseFloat(row.cost),
        plan: row.plan || 'free',
        lastActive: row.last_active?.toISOString() || new Date().toISOString()
      }));

      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      logger.error('Failed to get user analytics', { error: getErrorMessage(error), userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get user analytics'
      });
    }
  }
);

/**
 * GET /api/analytics/costs
 * Get cost breakdown analysis
 */
router.get('/costs',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  [query('range').optional().isIn(['24h', '7d', '30d', '90d', '1y'])],
  validateRequest,
  async (req, res) => {
    try {
      const range = req.query.range as string || '7d';
      const { startDate, endDate } = getDateRange(range);
      const userId = req.user.id;

      // Get cost breakdown by feature/provider
      const costData = await prisma.usageRecord.groupBy({
        by: ['type'], // Group by usage type instead of featureUsed and aiProvider
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        _sum: {
          cost: true,
          tokens: true
        }
      });

      // Aggregate by category
      const categoryMap: { [key: string]: number } = {};
      let totalCost = 0;

      costData.forEach(item => {
        const cost = (item._sum.cost || 0);
        const category = (item as any).type || 'General';
        
        categoryMap[category] = (categoryMap[category] || 0) + cost;
        totalCost += cost;
      });

      const formattedData = Object.entries(categoryMap).map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
        percentage: totalCost > 0 ? Math.round((amount / totalCost) * 100) : 0,
        color: `#${Math.floor(Math.random() * 16777215).toString(16)}`
      }));

      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      logger.error('Failed to get cost analysis', { error: getErrorMessage(error), userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get cost analysis'
      });
    }
  }
);

/**
 * GET /api/analytics/export
 * Export analytics data
 */
router.get('/export',
  authenticateUser,
  requireSubscription(['monthly', 'enterprise']),
  [
    query('format').isIn(['csv', 'json']),
    query('range').optional().isIn(['24h', '7d', '30d', '90d', '1y'])
  ],
  validateRequest,
  async (req, res) => {
    try {
      const format = req.query.format as string;
      const range = req.query.range as string || '7d';
      const { startDate, endDate } = getDateRange(range);
      const userId = req.user.id;

      // Get detailed usage data
      const usageData = await prisma.usageRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: 10000 // Limit to prevent huge exports
      });

      const exportData = usageData.map(usage => ({
        date: usage.timestamp.toISOString(),
        aiProvider: (usage.metadata as any)?.aiProvider || 'unknown',
        feature: usage.type,
        tokens: usage.tokens || 0,
        requests: 1, // Each record represents one request
        cost: usage.cost || 0,
        periodStart: usage.timestamp.toISOString().split('T')[0],
        periodEnd: usage.timestamp.toISOString().split('T')[0]
      }));

      if (format === 'csv') {
        const fields = [
          'date',
          'aiProvider',
          'feature',
          'tokens',
          'requests',
          'cost',
          'periodStart',
          'periodEnd'
        ];
        
        const parser = new Parser({ fields });
        const csv = parser.parse(exportData);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=recoder-analytics-${range}.csv`);
        res.send(csv);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=recoder-analytics-${range}.json`);
        res.json({
          exportDate: new Date().toISOString(),
          range,
          totalRecords: exportData.length,
          data: exportData
        });
      }

      logger.info('Analytics data exported', {
        userId,
        format,
        range,
        recordCount: exportData.length
      });
    } catch (error) {
      logger.error('Failed to export analytics', { error: getErrorMessage(error), userId: req.user?.id });
      res.status(500).json({
        success: false,
        error: 'Failed to export analytics data'
      });
    }
  }
);

module.exports = router;