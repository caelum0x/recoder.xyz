/**
 * Payment Testing Routes
 * API endpoints for testing payment flow end-to-end
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { paymentFlowTester } from '../services/payment-flow-tester';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { APIResponse } from '../types';

const router = Router();

// Require authentication for all test routes
router.use(authenticate);

/**
 * POST /api/payment-test/flow
 * Run complete payment flow test
 */
router.post('/flow', [
  body('userId').isString().notEmpty().withMessage('User ID is required'),
  body('planId').isString().notEmpty().withMessage('Plan ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('paymentType').isIn(['subscription', 'one_time', 'usage']).withMessage('Invalid payment type'),
  body('frontend').isString().notEmpty().withMessage('Frontend is required')
], async (req: Request, res: Response): Promise<void> => {
  try {
    // Only allow in non-production environments
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: 'Payment testing not available in production'
      } as APIResponse);
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const { userId, planId, amount, currency, paymentType, frontend } = req.body;

    logger.info('Starting payment flow test', {
      userId,
      planId,
      amount,
      paymentType,
      frontend,
      requestedBy: req.user?.id
    });

    const testResults = await paymentFlowTester.runCompleteTest({
      userId,
      planId,
      amount,
      currency,
      paymentType,
      frontend
    });

    // Generate test report
    const report = paymentFlowTester.generateTestReport(testResults);

    res.json({
      success: true,
      data: {
        ...testResults,
        report
      },
      message: `Payment flow test completed. ${testResults.summary.passedStages}/${testResults.summary.totalStages} stages passed.`
    } as APIResponse);

  } catch (error) {
    logger.error('Payment flow test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Payment flow test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    } as APIResponse);
  }
});

/**
 * POST /api/payment-test/scenarios
 * Run predefined payment scenarios
 */
router.post('/scenarios', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: 'Payment testing not available in production'
      } as APIResponse);
      return;
    }

    logger.info('Starting payment scenario tests', {
      requestedBy: req.user?.id
    });

    const scenarioResults = await paymentFlowTester.runScenarioTests();

    res.json({
      success: true,
      data: scenarioResults,
      message: `Scenario tests completed. ${scenarioResults.passedScenarios}/${scenarioResults.totalScenarios} scenarios passed.`
    } as APIResponse);

  } catch (error) {
    logger.error('Payment scenario tests failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Payment scenario tests failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    } as APIResponse);
  }
});

/**
 * POST /api/payment-test/webhook-security
 * Test webhook security and signature verification
 */
router.post('/webhook-security', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: 'Payment testing not available in production'
      } as APIResponse);
      return;
    }

    logger.info('Starting webhook security test', {
      requestedBy: req.user?.id
    });

    const securityResults = await paymentFlowTester.testWebhookSecurity();

    res.json({
      success: true,
      data: securityResults,
      message: `Webhook security test completed. All tests ${securityResults.allPassed ? 'passed' : 'failed'}.`
    } as APIResponse);

  } catch (error) {
    logger.error('Webhook security test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Webhook security test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    } as APIResponse);
  }
});

/**
 * GET /api/payment-test/health
 * Check payment system health
 */
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const healthChecks = {
      database: false,
      dodoApi: false,
      webhookSecret: false,
      subscriptionPlans: false
    };

    // Check database connectivity
    try {
      const { prisma } = require('../database/prisma');
      await prisma.$queryRaw`SELECT 1`;
      healthChecks.database = true;
    } catch (error) {
      logger.error('Database health check failed', { error });
    }

    // Check DODO API
    try {
      const { dodoPayments } = require('../services/dodo-payments');
      healthChecks.dodoApi = await dodoPayments.validateApiKey();
    } catch (error) {
      logger.error('DODO API health check failed', { error });
    }

    // Check webhook secret
    healthChecks.webhookSecret = !!process.env.DODO_WEBHOOK_SECRET;

    // Check subscription plans
    try {
      const { unifiedPaymentService } = require('../services/unified-payment-service');
      const plans = await unifiedPaymentService.getSubscriptionPlans();
      healthChecks.subscriptionPlans = plans && plans.length > 0;
    } catch (error) {
      logger.error('Subscription plans health check failed', { error });
    }

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

/**
 * POST /api/payment-test/create-test-user
 * Create a test user for payment testing
 */
router.post('/create-test-user', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('plan').optional().isString().withMessage('Plan must be a string')
], async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: 'Test user creation not available in production'
      } as APIResponse);
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      } as APIResponse);
      return;
    }

    const { email, name, plan = 'free' } = req.body;
    const { prisma } = require('../database/prisma');

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      res.json({
        success: true,
        data: {
          userId: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          subscription: existingUser.subscription,
          message: 'User already exists'
        }
      } as APIResponse);
      return;
    }

    // Create test user
    const testUser = await prisma.user.create({
      data: {
        email,
        name,
        subscription: plan,
        emailVerified: true,
        role: 'user',
        isActive: true
      }
    });

    logger.info('Test user created', {
      userId: testUser.id,
      email: testUser.email,
      createdBy: req.user?.id
    });

    res.json({
      success: true,
      data: {
        userId: testUser.id,
        email: testUser.email,
        name: testUser.name,
        subscription: testUser.subscription
      },
      message: 'Test user created successfully'
    } as APIResponse);

  } catch (error) {
    logger.error('Test user creation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestedBy: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: 'Test user creation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    } as APIResponse);
  }
});

export default router;