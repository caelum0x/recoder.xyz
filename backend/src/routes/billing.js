const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { billingService } = require('../services/billingService');

const router = express.Router();

/**
 * @swagger
 * /api/billing/subscription:
 *   get:
 *     summary: Get user subscription details
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription details retrieved successfully
 */
router.get('/subscription', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const subscription = await billingService.getUserSubscription(userId);

    res.json({
      success: true,
      data: subscription,
      message: 'Subscription details retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get subscription:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/subscription:
 *   post:
 *     summary: Create or update subscription
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId:
 *                 type: string
 *                 description: Subscription plan ID
 *               paymentMethodId:
 *                 type: string
 *                 description: Payment method ID
 *     responses:
 *       200:
 *         description: Subscription created/updated successfully
 *       400:
 *         description: Invalid input
 */
router.post('/subscription', authenticate, [
  body('planId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Plan ID is required'),
  body('paymentMethodId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Payment method ID is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { planId, paymentMethodId } = req.body;
    const userId = req.user.id;

    const subscription = await billingService.createOrUpdateSubscription(userId, {
      planId,
      paymentMethodId
    });

    logger.info(`Subscription created/updated for user: ${userId}`);

    res.json({
      success: true,
      data: subscription,
      message: 'Subscription created/updated successfully'
    });

  } catch (error) {
    logger.error('Failed to create/update subscription:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/subscription:
 *   delete:
 *     summary: Cancel subscription
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 */
router.delete('/subscription', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    await billingService.cancelSubscription(userId);

    logger.info(`Subscription cancelled for user: ${userId}`);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    logger.error('Failed to cancel subscription:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: Plans retrieved successfully
 */
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await billingService.getAvailablePlans();

    res.json({
      success: true,
      data: plans,
      message: 'Plans retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get plans:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/usage:
 *   get:
 *     summary: Get user usage statistics
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for usage period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for usage period
 *     responses:
 *       200:
 *         description: Usage statistics retrieved successfully
 */
router.get('/usage', authenticate, [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    const usage = await billingService.getUserUsage(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    res.json({
      success: true,
      data: usage,
      message: 'Usage statistics retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get usage:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/invoices:
 *   get:
 *     summary: Get user invoices
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of invoices to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of invoices to skip
 *     responses:
 *       200:
 *         description: Invoices retrieved successfully
 */
router.get('/invoices', authenticate, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user.id;

    const invoices = await billingService.getUserInvoices(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: invoices,
      message: 'Invoices retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get invoices:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/invoices/{invoiceId}:
 *   get:
 *     summary: Get invoice details
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     responses:
 *       200:
 *         description: Invoice details retrieved successfully
 *       404:
 *         description: Invoice not found
 */
router.get('/invoices/:invoiceId', authenticate, [
  param('invoiceId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Invoice ID is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { invoiceId } = req.params;
    const userId = req.user.id;

    const invoice = await billingService.getInvoiceDetails(invoiceId, userId);

    if (!invoice) {
      return res.status(404).json({
        error: {
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: invoice,
      message: 'Invoice details retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get invoice details:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/payment-methods:
 *   get:
 *     summary: Get user payment methods
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment methods retrieved successfully
 */
router.get('/payment-methods', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const paymentMethods = await billingService.getUserPaymentMethods(userId);

    res.json({
      success: true,
      data: paymentMethods,
      message: 'Payment methods retrieved successfully'
    });

  } catch (error) {
    logger.error('Failed to get payment methods:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/payment-methods:
 *   post:
 *     summary: Add payment method
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Payment method token
 *               type:
 *                 type: string
 *                 enum: [card, bank_account]
 *                 description: Payment method type
 *               setDefault:
 *                 type: boolean
 *                 description: Set as default payment method
 *     responses:
 *       201:
 *         description: Payment method added successfully
 *       400:
 *         description: Invalid input
 */
router.post('/payment-methods', authenticate, [
  body('token')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Payment method token is required'),
  body('type')
    .isIn(['card', 'bank_account'])
    .withMessage('Type must be either card or bank_account'),
  body('setDefault')
    .optional()
    .isBoolean()
    .withMessage('SetDefault must be a boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { token, type, setDefault } = req.body;
    const userId = req.user.id;

    const paymentMethod = await billingService.addPaymentMethod(userId, {
      token,
      type,
      setDefault
    });

    logger.info(`Payment method added for user: ${userId}`);

    res.status(201).json({
      success: true,
      data: paymentMethod,
      message: 'Payment method added successfully'
    });

  } catch (error) {
    logger.error('Failed to add payment method:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/billing/payment-methods/{paymentMethodId}:
 *   delete:
 *     summary: Delete payment method
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentMethodId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment method ID
 *     responses:
 *       200:
 *         description: Payment method deleted successfully
 *       404:
 *         description: Payment method not found
 */
router.delete('/payment-methods/:paymentMethodId', authenticate, [
  param('paymentMethodId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Payment method ID is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const { paymentMethodId } = req.params;
    const userId = req.user.id;

    await billingService.deletePaymentMethod(paymentMethodId, userId);

    logger.info(`Payment method deleted: ${paymentMethodId} for user: ${userId}`);

    res.json({
      success: true,
      message: 'Payment method deleted successfully'
    });

  } catch (error) {
    logger.error('Failed to delete payment method:', error);
    next(error);
  }
});

module.exports = router;