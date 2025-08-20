/**
 * Router API Routes
 * Backend endpoints for CLI router integration and shared API key management
 * Supports enterprise features, analytics, and cost optimization
 */

import express from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();

// Rate limiting for router endpoints
const routerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each router to 100 requests per windowMs
  message: 'Too many requests from this router, please try again later'
});

// Apply rate limiting to all router routes
router.use(routerRateLimit);

// In-memory storage for demo (replace with database in production)
const routers = new Map();
const apiKeyPools = new Map();
const routerMetrics = new Map();

/**
 * Register a new router instance
 */
router.post('/register', [
  body('router_id').isString().notEmpty(),
  body('user_id').optional().isString(),
  body('version').isString().notEmpty(),
  body('enterprise_mode').isBoolean(),
  body('capabilities').isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: errors.array()
      });
    }

    const {
      router_id,
      user_id,
      version,
      enterprise_mode,
      capabilities,
      metadata
    } = req.body;

    // Validate authentication
    if (enterprise_mode && !req.headers.authorization) {
      return res.status(401).json({
        success: false,
        error: 'Enterprise mode requires API key authentication'
      });
    }

    if (!enterprise_mode && !user_id) {
      return res.status(400).json({
        success: false,
        error: 'Individual mode requires user_id'
      });
    }

    // Register router
    const routerData = {
      router_id,
      user_id,
      version,
      enterprise_mode,
      capabilities,
      metadata: {
        ...metadata,
        registered_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      },
      status: 'active'
    };

    routers.set(router_id, routerData);

    // Initialize API key pools for this router if enterprise mode
    if (enterprise_mode) {
      await initializeEnterpriseAPIKeyPools(router_id);
    } else {
      await initializeIndividualAPIKeyPools(router_id, user_id);
    }

    console.log(`📋 Router registered: ${router_id} (${enterprise_mode ? 'enterprise' : 'individual'})`);

    res.json({
      success: true,
      message: 'Router registered successfully',
      router_data: {
        router_id,
        enterprise_mode,
        capabilities_enabled: capabilities,
        api_key_pools_available: apiKeyPools.has(router_id)
      }
    });

  } catch (error: any) {
    console.error('Router registration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get API key pools for a router
 */
router.get('/:routerId/api-keys', [
  param('routerId').isString().notEmpty()
], async (req, res) => {
  try {
    const { routerId } = req.params;

    if (!routers.has(routerId)) {
      return res.status(404).json({
        success: false,
        error: 'Router not found'
      });
    }

    const pools = apiKeyPools.get(routerId) || [];
    
    res.json({
      success: true,
      pools: pools,
      last_updated: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Failed to get API key pools:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve API key pools'
    });
  }
});

/**
 * Request shared API key for specific provider
 */
router.post('/:routerId/request-key', [
  param('routerId').isString().notEmpty(),
  body('provider').isString().notEmpty(),
  body('model').optional().isString(),
  body('request_id').isString().notEmpty()
], async (req, res) => {
  try {
    const { routerId } = req.params;
    const { provider, model, request_id } = req.body;

    if (!routers.has(routerId)) {
      return res.status(404).json({
        success: false,
        error: 'Router not found'
      });
    }

    const routerData = routers.get(routerId);
    
    // Check if router has access to shared keys
    if (!routerData.enterprise_mode && !hasIndividualAccess(routerId, provider)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to shared API keys'
      });
    }

    // Get optimal key from pool
    const keyData = await getOptimalSharedKey(routerId, provider, model);
    
    if (!keyData) {
      return res.status(404).json({
        success: false,
        error: `No available API key for ${provider}`
      });
    }

    // Log key request
    await logKeyRequest(routerId, provider, model, request_id);

    res.json({
      success: true,
      key_data: keyData
    });

  } catch (error: any) {
    console.error('API key request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to provide API key'
    });
  }
});

/**
 * Report API key usage
 */
router.post('/key-usage', [
  body('router_id').isString().notEmpty(),
  body('key_id').isString().notEmpty(),
  body('usage.tokens_used').isNumeric(),
  body('usage.cost').isNumeric(),
  body('usage.success').isBoolean()
], async (req, res) => {
  try {
    const { router_id, key_id, usage, timestamp } = req.body;

    // Update usage metrics
    await updateKeyUsageMetrics(router_id, key_id, usage);

    // Update router metrics
    await updateRouterMetrics(router_id, usage);

    res.json({
      success: true,
      message: 'Usage reported successfully'
    });

  } catch (error: any) {
    console.error('Usage reporting failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to report usage'
    });
  }
});

/**
 * Sync router data with backend
 */
router.post('/sync', [
  body('router_id').isString().notEmpty(),
  body('version').isString(),
  body('uptime').isNumeric(),
  body('requests_processed').isNumeric(),
  body('cost_savings').isObject(),
  body('performance_metrics').isObject()
], async (req, res) => {
  try {
    const syncData = req.body;
    const { router_id } = syncData;

    if (!routers.has(router_id)) {
      return res.status(404).json({
        success: false,
        error: 'Router not found'
      });
    }

    // Update router data
    const routerData = routers.get(router_id);
    routerData.last_sync = new Date().toISOString();
    routerData.sync_data = syncData;
    routers.set(router_id, routerData);

    // Store metrics
    routerMetrics.set(router_id, {
      ...syncData,
      synced_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Router data synced successfully',
      next_sync_in: 300000 // 5 minutes
    });

  } catch (error: any) {
    console.error('Router sync failed:', error);
    res.status(500).json({
      success: false,
      error: 'Sync failed'
    });
  }
});

/**
 * Send heartbeat
 */
router.post('/:routerId/heartbeat', [
  param('routerId').isString().notEmpty(),
  body('timestamp').isISO8601(),
  body('status').isIn(['active', 'idle', 'busy'])
], async (req, res) => {
  try {
    const { routerId } = req.params;
    const { timestamp, status } = req.body;

    if (!routers.has(routerId)) {
      return res.status(404).json({
        success: false,
        error: 'Router not found'
      });
    }

    // Update last seen
    const routerData = routers.get(routerId);
    routerData.last_seen = timestamp;
    routerData.status = status;
    routers.set(routerId, routerData);

    res.json({
      success: true,
      message: 'Heartbeat received'
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Heartbeat processing failed'
    });
  }
});

/**
 * Get cost optimization recommendations
 */
router.get('/:routerId/optimize', [
  param('routerId').isString().notEmpty()
], async (req, res) => {
  try {
    const { routerId } = req.params;

    if (!routers.has(routerId)) {
      return res.status(404).json({
        success: false,
        error: 'Router not found'
      });
    }

    const recommendations = await generateCostOptimizationRecommendations(routerId);

    res.json({
      success: true,
      ...recommendations
    });

  } catch (error: any) {
    console.error('Optimization recommendations failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations'
    });
  }
});

/**
 * Check for updates
 */
router.get('/:routerId/updates', [
  param('routerId').isString().notEmpty()
], async (req, res) => {
  try {
    const { routerId } = req.params;

    if (!routers.has(routerId)) {
      return res.status(404).json({
        success: false,
        error: 'Router not found'
      });
    }

    const routerData = routers.get(routerId);
    const currentVersion = routerData.version;

    // Check for version updates
    const latestVersion = '2.1.0'; // This would come from version service
    const updatesAvailable = currentVersion !== latestVersion;

    // Check for configuration updates
    const configUpdates = await getConfigurationUpdates(routerId);

    res.json({
      success: true,
      updates_available: updatesAvailable,
      updates: updatesAvailable ? [{
        type: 'version',
        from_version: currentVersion,
        to_version: latestVersion,
        description: 'Performance improvements and bug fixes'
      }] : [],
      config_updates: configUpdates
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to check for updates'
    });
  }
});

/**
 * Report usage data in bulk
 */
router.post('/usage', [
  body('router_id').isString().notEmpty(),
  body('usage_data').isObject(),
  body('reported_at').isISO8601()
], async (req, res) => {
  try {
    const { router_id, usage_data, reported_at } = req.body;

    // Process usage data
    await processBulkUsageData(router_id, usage_data);

    res.json({
      success: true,
      message: 'Usage data processed successfully',
      processed_requests: usage_data.requests?.length || 0
    });

  } catch (error: any) {
    console.error('Bulk usage processing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process usage data'
    });
  }
});

/**
 * Store cost optimization analytics from CLI router
 */
router.post('/cost-analytics', [
  body('router_id').isString().notEmpty(),
  body('cost_data').isObject(),
  body('timestamp').isISO8601()
], async (req, res) => {
  try {
    const { router_id, cost_data, timestamp } = req.body;

    if (!routers.has(router_id)) {
      return res.status(404).json({
        success: false,
        error: 'Router not found'
      });
    }

    // Store cost analytics data
    console.log(`📊 Received cost analytics from router ${router_id}:`, {
      total_requests: cost_data.cost_summary?.total_requests || 0,
      total_cost: cost_data.cost_summary?.total_cost || 0,
      savings_percentage: cost_data.optimization_metrics?.savings_percentage || 0,
      recommendations: cost_data.recommendations?.length || 0
    });

    // In production, store this in a time-series database
    const analyticsKey = `${router_id}_analytics`;
    const existingAnalytics = routerMetrics.get(analyticsKey) || [];
    existingAnalytics.push({
      timestamp: new Date(timestamp),
      cost_data,
      processed_at: new Date()
    });

    // Keep only last 100 analytics records per router
    if (existingAnalytics.length > 100) {
      existingAnalytics.splice(0, existingAnalytics.length - 100);
    }

    routerMetrics.set(analyticsKey, existingAnalytics);

    res.json({
      success: true,
      message: 'Cost analytics stored successfully'
    });

  } catch (error: any) {
    console.error('Store cost analytics failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store cost analytics'
    });
  }
});

/**
 * Helper functions
 */

async function initializeEnterpriseAPIKeyPools(routerId: string) {
  // Enterprise routers get access to shared pools
  const pools = [
    {
      provider: 'openai',
      keys: [
        {
          id: 'key_openai_1',
          key_masked: 'sk-proj-****',
          rate_limit: 1000,
          cost_per_token: 0.00002,
          current_usage: 0.3,
          health_score: 9.2,
          priority: 1
        }
      ],
      optimization_settings: {
        cost_threshold: 0.001,
        quality_threshold: 8.0,
        latency_threshold: 2000
      }
    },
    {
      provider: 'anthropic',
      keys: [
        {
          id: 'key_anthropic_1',
          key_masked: 'sk-ant-****',
          rate_limit: 500,
          cost_per_token: 0.00003,
          current_usage: 0.2,
          health_score: 9.5,
          priority: 1
        }
      ],
      optimization_settings: {
        cost_threshold: 0.002,
        quality_threshold: 9.0,
        latency_threshold: 3000
      }
    }
  ];

  apiKeyPools.set(routerId, pools);
  console.log(`🔑 Initialized enterprise API key pools for router ${routerId}`);
}

async function initializeIndividualAPIKeyPools(routerId: string, userId: string) {
  // Individual routers get limited access based on subscription
  const userSubscription = await getUserSubscription(userId);
  
  if (userSubscription?.plan === 'pro' || userSubscription?.plan === 'team') {
    // Pro/Team users get some shared access
    const pools = [
      {
        provider: 'openai',
        keys: [
          {
            id: 'key_openai_shared',
            key_masked: 'sk-shared-****',
            rate_limit: 100,
            cost_per_token: 0.00003,
            current_usage: 0.5,
            health_score: 8.5,
            priority: 2
          }
        ],
        optimization_settings: {
          cost_threshold: 0.002,
          quality_threshold: 7.5,
          latency_threshold: 3000
        }
      }
    ];
    
    apiKeyPools.set(routerId, pools);
    console.log(`🔑 Initialized individual API key pools for router ${routerId} (${userSubscription.plan})`);
  }
}

async function getOptimalSharedKey(routerId: string, provider: string, model?: string) {
  const pools = apiKeyPools.get(routerId) || [];
  const pool = pools.find((p: any) => p.provider === provider);
  
  if (!pool || pool.keys.length === 0) {
    return null;
  }

  // Sort keys by cost and health score
  const sortedKeys = pool.keys.sort((a: any, b: any) => {
    const scoreA = a.health_score * (1 - a.current_usage) * a.priority;
    const scoreB = b.health_score * (1 - b.current_usage) * b.priority;
    return scoreB - scoreA;
  });

  const selectedKey = sortedKeys[0];

  return {
    api_key: `${provider}_demo_key_${selectedKey.id}`, // Demo key
    rate_limit: selectedKey.rate_limit,
    cost_per_token: selectedKey.cost_per_token,
    expires_at: new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
  };
}

function hasIndividualAccess(routerId: string, provider: string): boolean {
  const pools = apiKeyPools.get(routerId) || [];
  return pools.some((pool: any) => pool.provider === provider);
}

async function logKeyRequest(routerId: string, provider: string, model?: string, requestId?: string) {
  console.log(`🔑 Key requested: ${routerId} -> ${provider}/${model || 'default'} (${requestId})`);
}

async function updateKeyUsageMetrics(routerId: string, keyId: string, usage: any) {
  // Update usage metrics in database
  console.log(`📊 Usage updated: ${routerId}/${keyId} - ${usage.tokens_used} tokens, $${usage.cost.toFixed(6)}`);
}

async function updateRouterMetrics(routerId: string, usage: any) {
  // Update router-level metrics
  const metrics = routerMetrics.get(routerId) || { total_requests: 0, total_cost: 0, total_tokens: 0 };
  metrics.total_requests++;
  metrics.total_cost += usage.cost;
  metrics.total_tokens += usage.tokens_used;
  routerMetrics.set(routerId, metrics);
}

async function generateCostOptimizationRecommendations(routerId: string) {
  const metrics = routerMetrics.get(routerId);
  
  if (!metrics) {
    return {
      recommendations: [],
      current_efficiency: 0,
      projected_savings: 0
    };
  }

  const recommendations = [
    {
      type: 'model_switch',
      description: 'Switch to GPT-4o-mini for simple queries to save 80% on costs',
      potential_savings: 15.50,
      confidence: 0.85
    },
    {
      type: 'caching',
      description: 'Enable response caching for repeated queries',
      potential_savings: 8.20,
      confidence: 0.92
    }
  ];

  return {
    recommendations,
    current_efficiency: 72.5,
    projected_savings: 23.70
  };
}

async function getConfigurationUpdates(routerId: string) {
  // Check for configuration updates
  return null; // No updates for now
}

async function processBulkUsageData(routerId: string, usageData: any) {
  console.log(`📊 Processing bulk usage data for ${routerId}: ${usageData.requests?.length || 0} requests`);
  
  // Process each request in the usage data
  if (usageData.requests) {
    for (const request of usageData.requests) {
      await updateKeyUsageMetrics(routerId, request.key_id || 'unknown', {
        tokens_used: request.tokens_used,
        cost: request.cost,
        success: request.success
      });
    }
  }
}

async function getUserSubscription(userId: string) {
  // Mock subscription data - replace with actual database query
  return {
    plan: 'pro',
    status: 'active'
  };
}

export default router;