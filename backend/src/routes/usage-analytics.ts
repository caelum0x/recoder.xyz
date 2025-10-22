import express, { Request, Response } from 'express';
import * as usageAnalyticsService from '../services/usage-analytics.service';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/usage-analytics
 * Get usage analytics for date range
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const analytics = await usageAnalyticsService.getUserUsageAnalytics(userId, start, end);

    res.json(analytics);
  } catch (error) {
    console.error('Get usage analytics error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage analytics'
    });
  }
});

/**
 * GET /api/usage-analytics/summary
 * Get usage summary
 */
router.get('/summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const analytics = await usageAnalyticsService.getUserUsageAnalytics(userId, start, end);

    res.json({
      summary: analytics.summary,
      dateRange: analytics.dateRange
    });
  } catch (error) {
    console.error('Get usage summary error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage summary'
    });
  }
});

/**
 * GET /api/usage-analytics/by-provider
 * Get usage breakdown by provider
 */
router.get('/by-provider', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const breakdown = await usageAnalyticsService.getUsageByProvider(userId, start, end);

    res.json({ breakdown });
  } catch (error) {
    console.error('Get usage by provider error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage by provider'
    });
  }
});

/**
 * GET /api/usage-analytics/by-model
 * Get usage breakdown by model
 */
router.get('/by-model', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const breakdown = await usageAnalyticsService.getUsageByModel(userId, start, end);

    res.json({ breakdown });
  } catch (error) {
    console.error('Get usage by model error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage by model'
    });
  }
});

/**
 * GET /api/usage-analytics/cost
 * Get cost breakdown
 */
router.get('/cost', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const costBreakdown = await usageAnalyticsService.getCostBreakdown(userId, start, end);

    res.json(costBreakdown);
  } catch (error) {
    console.error('Get cost breakdown error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get cost breakdown'
    });
  }
});

/**
 * GET /api/usage-analytics/trends
 * Get usage trends
 */
router.get('/trends', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const days = parseInt(req.query.days as string) || 30;

    const trends = await usageAnalyticsService.getUsageTrends(userId, days);

    res.json({ trends, days });
  } catch (error) {
    console.error('Get usage trends error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage trends'
    });
  }
});

/**
 * POST /api/usage-analytics/export
 * Export usage data
 */
router.post('/export', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { format, startDate, endDate } = req.body;

    if (!format || !['csv', 'json'].includes(format)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Valid format (csv or json) is required'
      });
    }

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const exportData = await usageAnalyticsService.exportUsageData(userId, format, start, end);

    // Set appropriate content type
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `usage-export-${new Date().toISOString().split('T')[0]}.${format}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData.data);
  } catch (error) {
    console.error('Export usage data error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to export usage data'
    });
  }
});

/**
 * GET /api/usage-analytics/alerts
 * Get usage alerts
 */
router.get('/alerts', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const alerts = await usageAnalyticsService.getUsageAlerts(userId);

    res.json({ alerts });
  } catch (error) {
    console.error('Get usage alerts error:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage alerts'
    });
  }
});

export default router;
