/**
 * Multi-Tenant API Routes
 * Handles tenant management, white-label solutions, and enterprise features
 */

import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import MultiTenantService from '../services/multi-tenant-service';
import { authMiddleware } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';

const router = express.Router();
const prisma = new PrismaClient();
const multiTenantService = new MultiTenantService(prisma);

// Rate limiting for tenant operations
const tenantRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many tenant requests, please try again later' }
});

// Apply tenant middleware to all routes
router.use(tenantRateLimit);
router.use('/tenant/*', multiTenantService.tenantMiddleware);

/**
 * @route POST /api/tenants
 * @desc Create a new tenant
 * @access Private (Super Admin only)
 */
router.post('/tenants', [
  authMiddleware,
  body('name').notEmpty().withMessage('Tenant name is required'),
  body('slug').notEmpty().matches(/^[a-z0-9-]+$/).withMessage('Invalid slug format'),
  body('adminEmail').isEmail().withMessage('Valid admin email is required'),
  body('plan').isIn(['starter', 'professional', 'enterprise']).withMessage('Invalid plan'),
  body('domain').optional().isFQDN().withMessage('Invalid domain')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, slug, adminEmail, plan, domain } = req.body;

    // Check if slug is available
    const existingTenant = await multiTenantService.getTenant(slug);
    if (existingTenant) {
      return res.status(409).json({ error: 'Tenant slug already exists' });
    }

    const tenant = await multiTenantService.createTenant({
      name,
      slug,
      adminEmail,
      plan,
      domain
    });

    res.status(201).json({
      success: true,
      data: tenant,
      message: 'Tenant created successfully'
    });

  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({
      error: 'Failed to create tenant',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route GET /api/tenants/:identifier
 * @desc Get tenant by ID, slug, or domain
 * @access Private
 */
router.get('/tenants/:identifier', [
  authMiddleware,
  param('identifier').notEmpty()
], async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;
    
    const tenant = await multiTenantService.getTenant(identifier);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({
      success: true,
      data: tenant
    });

  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant' });
  }
});

/**
 * @route PUT /api/tenants/:tenantId
 * @desc Update tenant configuration
 * @access Private (Tenant Admin only)
 */
router.put('/tenants/:tenantId', [
  authMiddleware,
  param('tenantId').isUUID(),
  body('name').optional().notEmpty(),
  body('domain').optional().isFQDN(),
  body('customDomain').optional().isFQDN(),
  body('plan').optional().isIn(['starter', 'professional', 'enterprise']),
  body('status').optional().isIn(['active', 'suspended', 'trial'])
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId } = req.params;
    const updates = req.body;

    // Check permissions (implement based on your auth system)
    const hasPermission = await multiTenantService.checkPermission(
      (req as any).user.id, 
      tenantId, 
      'tenant.update'
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const updatedTenant = await multiTenantService.updateTenant(tenantId, updates);

    res.json({
      success: true,
      data: updatedTenant,
      message: 'Tenant updated successfully'
    });

  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

/**
 * @route DELETE /api/tenants/:tenantId
 * @desc Delete/suspend tenant
 * @access Private (Super Admin only)
 */
router.delete('/tenants/:tenantId', [
  authMiddleware,
  param('tenantId').isUUID()
], async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    await multiTenantService.deleteTenant(tenantId);

    res.json({
      success: true,
      message: 'Tenant suspended successfully'
    });

  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

/**
 * @route GET /api/tenant/users
 * @desc Get users for the current tenant
 * @access Private
 */
router.get('/tenant/users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    
    const users = await multiTenantService.getTenantUsers(tenant.id);

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Get tenant users error:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant users' });
  }
});

/**
 * @route POST /api/tenant/users
 * @desc Add user to tenant
 * @access Private (Admin only)
 */
router.post('/tenant/users', [
  authMiddleware,
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(['admin', 'developer', 'viewer']).withMessage('Invalid role')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenant = (req as any).tenant;
    const { email, role, permissions } = req.body;

    // Check if user already exists in tenant
    const existingUsers = await multiTenantService.getTenantUsers(tenant.id);
    if (existingUsers.find(u => u.email === email)) {
      return res.status(409).json({ error: 'User already exists in tenant' });
    }

    const user = await multiTenantService.createTenantUser({
      tenantId: tenant.id,
      email,
      role,
      permissions
    });

    res.status(201).json({
      success: true,
      data: user,
      message: 'User added to tenant successfully'
    });

  } catch (error) {
    console.error('Add tenant user error:', error);
    res.status(500).json({ error: 'Failed to add user to tenant' });
  }
});

/**
 * @route PUT /api/tenant/users/:userId
 * @desc Update user permissions within tenant
 * @access Private (Admin only)
 */
router.put('/tenant/users/:userId', [
  authMiddleware,
  param('userId').isUUID(),
  body('role').optional().isIn(['admin', 'developer', 'viewer']),
  body('permissions').optional().isArray(),
  body('status').optional().isIn(['active', 'inactive', 'invited'])
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const updates = req.body;

    const updatedUser = await multiTenantService.updateTenantUser(userId, updates);

    res.json({
      success: true,
      data: updatedUser,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update tenant user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * @route GET /api/tenant/white-label
 * @desc Get white-label configuration for tenant
 * @access Public (for the specific tenant)
 */
router.get('/tenant/white-label', async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    
    const whiteLabelConfig = await multiTenantService.getWhiteLabelConfig(tenant.id);

    res.json({
      success: true,
      data: whiteLabelConfig
    });

  } catch (error) {
    console.error('Get white-label config error:', error);
    res.status(500).json({ error: 'Failed to retrieve white-label configuration' });
  }
});

/**
 * @route GET /api/tenant/usage
 * @desc Get usage statistics for tenant
 * @access Private (Admin only)
 */
router.get('/tenant/usage', [
  authMiddleware,
  query('metric').optional().isIn(['api_calls', 'storage', 'bandwidth', 'users', 'projects']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601()
], async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const { metric, from, to } = req.query;

    // Get usage data from database
    const whereClause: any = { tenantId: tenant.id };
    
    if (metric) {
      whereClause.metric = metric;
    }
    
    if (from || to) {
      whereClause.date = {};
      if (from) whereClause.date.gte = from;
      if (to) whereClause.date.lte = to;
    }

    const usage = await prisma.tenantUsage.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
      take: 100
    });

    // Check current limits
    const limits: any = {};
    if (metric) {
      const limitCheck = await multiTenantService.checkUsageLimit(tenant.id, metric as string);
      limits[metric as string] = limitCheck;
    } else {
      // Get all limits
      const metrics = ['api_calls', 'storage', 'bandwidth', 'users', 'projects'];
      for (const m of metrics) {
        limits[m] = await multiTenantService.checkUsageLimit(tenant.id, m);
      }
    }

    res.json({
      success: true,
      data: {
        usage,
        limits,
        tenant: {
          plan: tenant.plan,
          status: tenant.status
        }
      }
    });

  } catch (error) {
    console.error('Get tenant usage error:', error);
    res.status(500).json({ error: 'Failed to retrieve usage data' });
  }
});

/**
 * @route POST /api/tenant/usage
 * @desc Track usage for tenant
 * @access Private (Internal API only)
 */
router.post('/tenant/usage', [
  authMiddleware,
  body('metric').isIn(['api_calls', 'storage', 'bandwidth', 'users', 'projects']),
  body('amount').optional().isInt({ min: 1 }).toInt()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenant = (req as any).tenant;
    const { metric, amount = 1 } = req.body;

    // Check if within limits before tracking
    const limitCheck = await multiTenantService.checkUsageLimit(tenant.id, metric);
    
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Usage limit exceeded',
        details: {
          metric,
          usage: limitCheck.usage,
          limit: limitCheck.limit
        }
      });
    }

    await multiTenantService.trackUsage(tenant.id, metric, amount);

    res.json({
      success: true,
      message: 'Usage tracked successfully',
      data: {
        metric,
        amount,
        newUsage: limitCheck.usage + amount,
        limit: limitCheck.limit
      }
    });

  } catch (error) {
    console.error('Track usage error:', error);
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

/**
 * @route GET /api/tenant/permissions/:userId
 * @desc Check user permissions within tenant
 * @access Private
 */
router.get('/tenant/permissions/:userId', [
  authMiddleware,
  param('userId').isUUID(),
  query('permission').notEmpty()
], async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    const { userId } = req.params;
    const { permission } = req.query;

    const hasPermission = await multiTenantService.checkPermission(
      userId, 
      tenant.id, 
      permission as string
    );

    res.json({
      success: true,
      data: {
        userId,
        tenantId: tenant.id,
        permission,
        hasPermission
      }
    });

  } catch (error) {
    console.error('Check permission error:', error);
    res.status(500).json({ error: 'Failed to check permission' });
  }
});

// Error handling middleware
router.use((error: any, req: Request, res: Response, next: any) => {
  console.error('Multi-tenant API error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.message
    });
  }

  if (error.code === 'P2002') { // Prisma unique constraint
    return res.status(409).json({
      error: 'Resource already exists',
      details: error.meta?.target
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

export default router;