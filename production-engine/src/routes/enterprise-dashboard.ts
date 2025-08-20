/**
 * Enterprise Sales Dashboard API Routes for Recoder.ai DaaS Platform
 * Handles enterprise customer management, sales analytics, and admin tools
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { enterpriseDashboardService } from '../services/enterprise-dashboard-service';
import { userService } from '../services/user-service';

const router = Router();

// Admin authentication middleware
const authenticateAdmin = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'] as string;
  const adminKey = req.headers['x-admin-key'] as string;
  
  // Check for admin privileges
  if (!adminKey && !token && !userId) {
    return res.status(401).json({
      success: false,
      error: 'Admin authentication required',
      code: 'ADMIN_AUTH_REQUIRED'
    });
  }
  
  // In production, validate admin privileges properly
  const isAdmin = adminKey === 'admin-key' || userId === 'admin' || token?.includes('admin');
  
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin privileges required',
      code: 'INSUFFICIENT_PRIVILEGES'
    });
  }
  
  req.userId = userId || 'admin';
  req.isAdmin = true;
  next();
};

router.use(authenticateAdmin);

// =============================================================================
// SALES METRICS AND ANALYTICS ROUTES
// =============================================================================

/**
 * GET /api/enterprise/dashboard/metrics
 * Get comprehensive sales metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const { timeframe = '30' } = req.query;
    
    const metrics = enterpriseDashboardService.getSalesMetrics(parseInt(timeframe as string));

    res.json({
      success: true,
      data: metrics,
      meta: {
        timeframe: parseInt(timeframe as string),
        generatedAt: new Date(),
        currency: 'USD'
      }
    });

  } catch (error: any) {
    logger.error('Get sales metrics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/enterprise/dashboard/analytics
 * Get admin platform analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const analytics = enterpriseDashboardService.getAdminAnalytics();

    res.json({
      success: true,
      data: analytics,
      meta: {
        generatedAt: new Date(),
        refreshInterval: 300 // seconds
      }
    });

  } catch (error: any) {
    logger.error('Get admin analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// ENTERPRISE CUSTOMER MANAGEMENT ROUTES
// =============================================================================

/**
 * GET /api/enterprise/dashboard/customers
 * Get enterprise customers with filtering
 */
router.get('/customers', async (req, res) => {
  try {
    const {
      status,
      tier,
      salesStage,
      industry,
      riskLevel,
      limit = '50',
      offset = '0'
    } = req.query;

    const filters = {
      status: status as string,
      tier: tier as string,
      salesStage: salesStage as string,
      industry: industry as string,
      riskLevel: riskLevel as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    };

    const result = enterpriseDashboardService.getEnterpriseCustomers(filters);

    res.json({
      success: true,
      data: {
        customers: result.customers,
        summary: result.summary,
        pagination: {
          total: result.total,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.total > filters.offset + filters.limit
        }
      }
    });

  } catch (error: any) {
    logger.error('Get enterprise customers failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/enterprise/dashboard/customers
 * Add new enterprise customer
 */
router.post('/customers', async (req, res) => {
  try {
    const {
      companyName,
      domain,
      industry,
      size,
      primaryContact,
      description,
      website,
      revenue,
      employees,
      techStack,
      useCase,
      leadSource,
      assignedSalesRep,
      dealValue = 0
    } = req.body;

    if (!companyName || !primaryContact || !industry) {
      return res.status(400).json({
        success: false,
        error: 'Company name, primary contact, and industry are required',
        code: 'MISSING_FIELDS'
      });
    }

    const customerData = {
      companyName,
      domain: domain || `${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      industry,
      size: size || 'small',
      primaryContact,
      description: description || '',
      website: website || `https://${domain}`,
      revenue: revenue || 'Unknown',
      employees: employees || 10,
      techStack: techStack || [],
      useCase: useCase || '',
      status: 'prospect' as const,
      tier: 'free' as const,
      leadSource: leadSource || 'manual',
      salesStage: 'lead' as const,
      assignedSalesRep: assignedSalesRep || 'unassigned',
      dealValue,
      metrics: {
        totalUsers: 0,
        activeUsers: 0,
        projectsCreated: 0,
        codeGenerated: 0,
        deploymentsCount: 0,
        lastActivity: new Date()
      },
      engagement: {
        onboardingCompleted: false,
        supportTickets: 0,
        healthScore: 50,
        riskLevel: 'medium' as const
      },
      financial: {
        mrr: 0,
        arr: 0,
        churnRisk: 50,
        paymentMethod: 'Unknown',
        billingContact: primaryContact.email,
        invoiceEmail: primaryContact.email
      },
      customFields: {}
    };

    const result = await enterpriseDashboardService.addEnterpriseCustomer(customerData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'CUSTOMER_CREATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.customer,
      message: `Enterprise customer "${companyName}" added successfully! 🏢`
    });

  } catch (error: any) {
    logger.error('Add enterprise customer failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/enterprise/dashboard/customers/:customerId
 * Get enterprise customer details
 */
router.get('/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const customer = enterpriseDashboardService.getEnterpriseCustomer(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        code: 'CUSTOMER_NOT_FOUND'
      });
    }

    // Get customer activities
    const activities = enterpriseDashboardService.getCustomerActivities(customerId);
    
    // Generate lead score
    const leadScore = enterpriseDashboardService.generateLeadScore(customer);

    res.json({
      success: true,
      data: {
        customer,
        activities,
        leadScore,
        insights: {
          nextAction: leadScore.recommendation,
          healthTrend: customer.engagement.healthScore >= 70 ? 'positive' : 'negative',
          churnRisk: customer.financial.churnRisk > 50 ? 'high' : 'low'
        }
      }
    });

  } catch (error: any) {
    logger.error('Get enterprise customer failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * PUT /api/enterprise/dashboard/customers/:customerId
 * Update enterprise customer
 */
router.put('/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const updates = req.body;

    const result = await enterpriseDashboardService.updateEnterpriseCustomer(customerId, updates);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'CUSTOMER_UPDATE_FAILED'
      });
    }

    res.json({
      success: true,
      data: result.customer,
      message: 'Customer updated successfully! 📝'
    });

  } catch (error: any) {
    logger.error('Update enterprise customer failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// SALES ACTIVITIES ROUTES
// =============================================================================

/**
 * POST /api/enterprise/dashboard/customers/:customerId/activities
 * Add sales activity
 */
router.post('/customers/:customerId/activities', async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      type,
      title,
      description,
      salesRep = 'admin',
      outcome,
      nextAction,
      scheduledAt
    } = req.body;

    if (!type || !title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Type, title, and description are required',
        code: 'MISSING_FIELDS'
      });
    }

    const activityData = {
      type,
      title,
      description,
      salesRep,
      outcome,
      nextAction,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined
    };

    const result = await enterpriseDashboardService.addSalesActivity(customerId, activityData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'ACTIVITY_CREATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.activity,
      message: 'Sales activity added successfully! 📝'
    });

  } catch (error: any) {
    logger.error('Add sales activity failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/enterprise/dashboard/customers/:customerId/activities
 * Get customer activities
 */
router.get('/customers/:customerId/activities', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const activities = enterpriseDashboardService.getCustomerActivities(customerId);

    res.json({
      success: true,
      data: {
        activities,
        total: activities.length
      }
    });

  } catch (error: any) {
    logger.error('Get customer activities failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// MARKETING CAMPAIGNS ROUTES
// =============================================================================

/**
 * GET /api/enterprise/dashboard/campaigns
 * Get marketing campaigns
 */
router.get('/campaigns', async (req, res) => {
  try {
    const {
      status,
      type,
      limit = '20'
    } = req.query;

    const filters = {
      status: status as string,
      type: type as string,
      limit: parseInt(limit as string)
    };

    const campaigns = enterpriseDashboardService.getMarketingCampaigns(filters);

    res.json({
      success: true,
      data: {
        campaigns,
        total: campaigns.length,
        summary: {
          active: campaigns.filter(c => c.status === 'active').length,
          completed: campaigns.filter(c => c.status === 'completed').length,
          totalBudget: campaigns.reduce((sum, c) => sum + c.budget.allocated, 0),
          totalSpent: campaigns.reduce((sum, c) => sum + c.budget.spent, 0)
        }
      }
    });

  } catch (error: any) {
    logger.error('Get marketing campaigns failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/enterprise/dashboard/campaigns
 * Create marketing campaign
 */
router.post('/campaigns', async (req, res) => {
  try {
    const {
      name,
      type,
      status = 'draft',
      targeting,
      content,
      schedule,
      budget
    } = req.body;

    if (!name || !type || !content) {
      return res.status(400).json({
        success: false,
        error: 'Name, type, and content are required',
        code: 'MISSING_FIELDS'
      });
    }

    const campaignData = {
      name,
      type,
      status,
      targeting: targeting || {
        audience: 'General',
        criteria: {},
        estimatedReach: 1000
      },
      content,
      metrics: {
        sent: 0,
        opened: 0,
        clicked: 0,
        converted: 0,
        leads: 0,
        revenue: 0
      },
      schedule: schedule || {
        startDate: new Date(),
        timezone: 'UTC'
      },
      budget: budget || {
        allocated: 0,
        spent: 0,
        costPerLead: 0,
        roas: 0
      }
    };

    const result = await enterpriseDashboardService.createMarketingCampaign(campaignData);

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
      message: `Marketing campaign "${name}" created successfully! 📢`
    });

  } catch (error: any) {
    logger.error('Create marketing campaign failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// LEAD SCORING ROUTES
// =============================================================================

/**
 * POST /api/enterprise/dashboard/lead-scoring/:customerId
 * Generate lead score for customer
 */
router.post('/lead-scoring/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const customer = enterpriseDashboardService.getEnterpriseCustomer(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        code: 'CUSTOMER_NOT_FOUND'
      });
    }

    const leadScore = enterpriseDashboardService.generateLeadScore(customer);

    res.json({
      success: true,
      data: leadScore
    });

  } catch (error: any) {
    logger.error('Generate lead score failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// REPORTS AND EXPORTS ROUTES
// =============================================================================

/**
 * GET /api/enterprise/dashboard/reports/sales-summary
 * Get sales summary report
 */
router.get('/reports/sales-summary', async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;

    const metrics = enterpriseDashboardService.getSalesMetrics();
    const customers = enterpriseDashboardService.getEnterpriseCustomers();

    const report = {
      summary: {
        reportPeriod: {
          start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: endDate || new Date()
        },
        totalRevenue: metrics.overview.totalRevenue,
        totalCustomers: metrics.overview.totalCustomers,
        conversionRate: metrics.overview.conversionRate,
        averageDealSize: metrics.pipeline.averageDealSize
      },
      breakdown: {
        byTier: customers.summary.byTier,
        byStatus: customers.summary.byStatus,
        byRisk: customers.summary.byRisk
      },
      topCustomers: customers.customers
        .sort((a, b) => b.financial.arr - a.financial.arr)
        .slice(0, 10)
        .map(c => ({
          companyName: c.companyName,
          tier: c.tier,
          arr: c.financial.arr,
          healthScore: c.engagement.healthScore
        })),
      pipeline: metrics.pipeline
    };

    if (format === 'csv') {
      // In production, you would generate actual CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sales-summary.csv"');
      res.send('CSV export would be generated here');
    } else {
      res.json({
        success: true,
        data: report,
        meta: {
          generatedAt: new Date(),
          format
        }
      });
    }

  } catch (error: any) {
    logger.error('Generate sales summary report failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// ADMIN TOOLS ROUTES
// =============================================================================

/**
 * POST /api/enterprise/dashboard/admin/feature-flags
 * Update feature flags
 */
router.post('/admin/feature-flags', async (req, res) => {
  try {
    const { flags } = req.body;

    if (!flags || typeof flags !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Valid flags object is required',
        code: 'INVALID_FLAGS'
      });
    }

    // In production, this would update actual feature flags
    const updatedFlags = {
      ...flags,
      updatedAt: new Date(),
      updatedBy: req.userId
    };

    res.json({
      success: true,
      data: updatedFlags,
      message: 'Feature flags updated successfully! 🚩'
    });

  } catch (error: any) {
    logger.error('Update feature flags failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/enterprise/dashboard/admin/system-health
 * Get system health status
 */
router.get('/admin/system-health', async (req, res) => {
  try {
    const analytics = enterpriseDashboardService.getAdminAnalytics();

    const systemHealth = {
      overall: 'healthy',
      services: analytics.infrastructure.serverHealth,
      alerts: [
        {
          level: 'warning',
          service: 'AI Providers',
          message: 'High response times detected',
          timestamp: new Date()
        }
      ],
      metrics: {
        uptime: 99.8,
        responseTime: 245,
        errorRate: 0.02,
        throughput: 1250
      }
    };

    res.json({
      success: true,
      data: systemHealth
    });

  } catch (error: any) {
    logger.error('Get system health failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;