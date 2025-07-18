const { logger } = require('../utils/logger');
const { usageService } = require('../services/usageService');

const trackUsage = (type, options = {}) => {
  return async (req, res, next) => {
    try {
      const userId = req.user ? req.user.id : null;
      const startTime = Date.now();
      
      // Track request start
      req.usageTracking = {
        type,
        userId,
        startTime,
        metadata: {
          method: req.method,
          path: req.path,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          ...options.metadata
        }
      };

      // Override res.end to track completion
      const originalEnd = res.end;
      res.end = async function(chunk, encoding) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        try {
          await usageService.trackUsage({
            userId,
            type,
            duration,
            statusCode: res.statusCode,
            success: res.statusCode < 400,
            metadata: {
              ...req.usageTracking.metadata,
              statusCode: res.statusCode,
              duration,
              timestamp: new Date()
            }
          });
        } catch (error) {
          logger.error('Failed to track usage:', error);
        }
        
        originalEnd.call(this, chunk, encoding);
      };

      next();
    } catch (error) {
      logger.error('Usage tracking middleware error:', error);
      next();
    }
  };
};

const trackModelUsage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const modelId = req.params.modelId || req.body.modelId;
    const startTime = Date.now();
    
    req.modelUsageTracking = {
      userId,
      modelId,
      startTime,
      tokens: 0,
      cost: 0
    };

    // Override res.json to track model-specific metrics
    const originalJson = res.json;
    res.json = async function(data) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      try {
        // Extract token usage from response if available
        const tokens = data?.usage?.total_tokens || 0;
        const cost = await usageService.calculateCost(modelId, tokens);
        
        await usageService.trackModelUsage({
          userId,
          modelId,
          tokens,
          cost,
          duration,
          success: res.statusCode < 400,
          metadata: {
            requestType: req.path.split('/').pop(),
            statusCode: res.statusCode,
            timestamp: new Date()
          }
        });
      } catch (error) {
        logger.error('Failed to track model usage:', error);
      }
      
      originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error('Model usage tracking middleware error:', error);
    next();
  }
};

const trackCodeGeneration = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const startTime = Date.now();
    
    req.codeGenerationTracking = {
      userId,
      startTime,
      linesGenerated: 0,
      filesGenerated: 0
    };

    const originalJson = res.json;
    res.json = async function(data) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      try {
        // Extract code generation metrics
        const linesGenerated = data?.generatedCode?.lines || 0;
        const filesGenerated = data?.generatedCode?.files?.length || 0;
        
        await usageService.trackCodeGeneration({
          userId,
          linesGenerated,
          filesGenerated,
          duration,
          success: res.statusCode < 400,
          metadata: {
            language: req.body.language,
            type: req.body.type,
            statusCode: res.statusCode,
            timestamp: new Date()
          }
        });
      } catch (error) {
        logger.error('Failed to track code generation:', error);
      }
      
      originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error('Code generation tracking middleware error:', error);
    next();
  }
};

const trackBandwidth = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const requestSize = parseInt(req.get('Content-Length') || '0');
    
    req.bandwidthTracking = {
      userId,
      requestSize,
      responseSize: 0
    };

    const originalEnd = res.end;
    res.end = async function(chunk, encoding) {
      const responseSize = chunk ? Buffer.byteLength(chunk, encoding) : 0;
      
      try {
        await usageService.trackBandwidth({
          userId,
          requestSize,
          responseSize,
          totalSize: requestSize + responseSize,
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            timestamp: new Date()
          }
        });
      } catch (error) {
        logger.error('Failed to track bandwidth:', error);
      }
      
      originalEnd.call(this, chunk, encoding);
    };

    next();
  } catch (error) {
    logger.error('Bandwidth tracking middleware error:', error);
    next();
  }
};

const checkUsageLimit = (limitType, options = {}) => {
  return async (req, res, next) => {
    try {
      const userId = req.user ? req.user.id : null;
      
      if (!userId) {
        return res.status(401).json({
          error: {
            message: 'Authentication required for usage tracking',
            code: 'AUTH_REQUIRED'
          }
        });
      }

      const user = req.user;
      const subscription = user.subscription || 'free';
      
      const hasQuota = await usageService.checkUsageQuota(userId, limitType, subscription);
      
      if (!hasQuota) {
        return res.status(429).json({
          error: {
            message: `${limitType} usage limit exceeded for ${subscription} subscription`,
            code: 'USAGE_LIMIT_EXCEEDED',
            limitType,
            subscription
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Usage limit check error:', error);
      next();
    }
  };
};

const trackProjectActivity = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const projectId = req.params.projectId || req.body.projectId;
    
    if (!projectId) {
      return next();
    }

    req.projectActivityTracking = {
      userId,
      projectId,
      action: `${req.method} ${req.path}`,
      timestamp: new Date()
    };

    const originalJson = res.json;
    res.json = async function(data) {
      try {
        await usageService.trackProjectActivity({
          userId,
          projectId,
          action: req.projectActivityTracking.action,
          success: res.statusCode < 400,
          metadata: {
            statusCode: res.statusCode,
            timestamp: req.projectActivityTracking.timestamp
          }
        });
      } catch (error) {
        logger.error('Failed to track project activity:', error);
      }
      
      originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error('Project activity tracking middleware error:', error);
    next();
  }
};

const trackApiUsage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const apiKey = req.headers['x-api-key'];
    const startTime = Date.now();
    
    req.apiUsageTracking = {
      userId,
      apiKey,
      startTime,
      endpoint: req.path,
      method: req.method
    };

    const originalEnd = res.end;
    res.end = async function(chunk, encoding) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      try {
        await usageService.trackApiUsage({
          userId,
          apiKey,
          endpoint: req.path,
          method: req.method,
          duration,
          statusCode: res.statusCode,
          success: res.statusCode < 400,
          metadata: {
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            timestamp: new Date()
          }
        });
      } catch (error) {
        logger.error('Failed to track API usage:', error);
      }
      
      originalEnd.call(this, chunk, encoding);
    };

    next();
  } catch (error) {
    logger.error('API usage tracking middleware error:', error);
    next();
  }
};

module.exports = {
  trackUsage,
  trackModelUsage,
  trackCodeGeneration,
  trackBandwidth,
  checkUsageLimit,
  trackProjectActivity,
  trackApiUsage
};