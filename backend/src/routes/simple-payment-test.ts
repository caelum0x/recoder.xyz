/**
 * Simple Payment Test Routes
 * Basic endpoints for testing payment system health
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { APIResponse } from '../types';

const router = Router();

// Simple health check without complex dependencies
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const healthChecks = {
      database: false,
      webhookSecret: false
    };

    // Check database connectivity
    try {
      const { prisma } = require('../database/prisma');
      await prisma.$queryRaw`SELECT 1`;
      healthChecks.database = true;
    } catch (error) {
      logger.error('Database health check failed', { error });
    }

    // Check webhook secret
    healthChecks.webhookSecret = !!process.env.DODO_WEBHOOK_SECRET;

    const allHealthy = Object.values(healthChecks).every(check => check);

    res.json({
      success: true,
      data: {
        status: allHealthy ? 'healthy' : 'unhealthy',
        checks: healthChecks,
        timestamp: new Date().toISOString()
      },
      message: `Payment system is ${allHealthy ? 'healthy' : 'unhealthy'}`
    } as APIResponse);

  } catch (error) {
    logger.error('Payment health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    } as APIResponse);
  }
});

// Simple test endpoint
router.get('/ping', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Payment test routes are working',
    timestamp: new Date().toISOString()
  } as APIResponse);
});

export default router;
// CommonJS compatibility
module.exports = router;
