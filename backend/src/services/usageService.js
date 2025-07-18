const { logger } = require('../utils/logger');

class UsageService {
  constructor() {
    this.usageData = new Map();
    this.quotas = new Map();
    this.loadQuotas();
  }

  loadQuotas() {
    const quotas = {
      free: {
        projects: 3,
        templates: 10,
        agents: 5,
        apiCalls: 1000,
        modelCalls: 100,
        codeGeneration: 50,
        storage: 1 * 1024 * 1024 * 1024, // 1GB in bytes
        bandwidth: 10 * 1024 * 1024 * 1024 // 10GB in bytes
      },
      pro: {
        projects: 50,
        templates: 100,
        agents: 25,
        apiCalls: 50000,
        modelCalls: 5000,
        codeGeneration: 2000,
        storage: 10 * 1024 * 1024 * 1024, // 10GB
        bandwidth: 100 * 1024 * 1024 * 1024 // 100GB
      },
      premium: {
        projects: -1, // unlimited
        templates: -1,
        agents: 100,
        apiCalls: 200000,
        modelCalls: 20000,
        codeGeneration: 10000,
        storage: 50 * 1024 * 1024 * 1024, // 50GB
        bandwidth: 500 * 1024 * 1024 * 1024 // 500GB
      },
      enterprise: {
        projects: -1,
        templates: -1,
        agents: -1,
        apiCalls: -1,
        modelCalls: -1,
        codeGeneration: -1,
        storage: 200 * 1024 * 1024 * 1024, // 200GB
        bandwidth: 1000 * 1024 * 1024 * 1024 // 1TB
      }
    };

    for (const [plan, quota] of Object.entries(quotas)) {
      this.quotas.set(plan, quota);
    }

    logger.info('Usage quotas loaded');
  }

  async trackUsage(usageData) {
    try {
      const { userId, type, duration, statusCode, success, metadata } = usageData;
      
      const usage = {
        userId,
        type,
        duration,
        statusCode,
        success,
        metadata,
        timestamp: new Date()
      };

      // Store usage data (in real implementation, this would be stored in database)
      if (!this.usageData.has(userId)) {
        this.usageData.set(userId, []);
      }
      this.usageData.get(userId).push(usage);

      logger.debug(`Usage tracked: ${userId} - ${type}`);
      return true;
    } catch (error) {
      logger.error('Failed to track usage:', error);
      throw error;
    }
  }

  async trackModelUsage(modelUsageData) {
    try {
      const { userId, modelId, tokens, cost, duration, success, metadata } = modelUsageData;
      
      const usage = {
        userId,
        type: 'model_usage',
        modelId,
        tokens,
        cost,
        duration,
        success,
        metadata,
        timestamp: new Date()
      };

      if (!this.usageData.has(userId)) {
        this.usageData.set(userId, []);
      }
      this.usageData.get(userId).push(usage);

      logger.debug(`Model usage tracked: ${userId} - ${modelId} - ${tokens} tokens`);
      return true;
    } catch (error) {
      logger.error('Failed to track model usage:', error);
      throw error;
    }
  }

  async trackCodeGeneration(codeGenData) {
    try {
      const { userId, linesGenerated, filesGenerated, duration, success, metadata } = codeGenData;
      
      const usage = {
        userId,
        type: 'code_generation',
        linesGenerated,
        filesGenerated,
        duration,
        success,
        metadata,
        timestamp: new Date()
      };

      if (!this.usageData.has(userId)) {
        this.usageData.set(userId, []);
      }
      this.usageData.get(userId).push(usage);

      logger.debug(`Code generation tracked: ${userId} - ${linesGenerated} lines, ${filesGenerated} files`);
      return true;
    } catch (error) {
      logger.error('Failed to track code generation:', error);
      throw error;
    }
  }

  async trackBandwidth(bandwidthData) {
    try {
      const { userId, requestSize, responseSize, totalSize, metadata } = bandwidthData;
      
      const usage = {
        userId,
        type: 'bandwidth',
        requestSize,
        responseSize,
        totalSize,
        metadata,
        timestamp: new Date()
      };

      if (!this.usageData.has(userId)) {
        this.usageData.set(userId, []);
      }
      this.usageData.get(userId).push(usage);

      logger.debug(`Bandwidth tracked: ${userId} - ${totalSize} bytes`);
      return true;
    } catch (error) {
      logger.error('Failed to track bandwidth:', error);
      throw error;
    }
  }

  async trackProjectActivity(activityData) {
    try {
      const { userId, projectId, action, success, metadata } = activityData;
      
      const usage = {
        userId,
        type: 'project_activity',
        projectId,
        action,
        success,
        metadata,
        timestamp: new Date()
      };

      if (!this.usageData.has(userId)) {
        this.usageData.set(userId, []);
      }
      this.usageData.get(userId).push(usage);

      logger.debug(`Project activity tracked: ${userId} - ${projectId} - ${action}`);
      return true;
    } catch (error) {
      logger.error('Failed to track project activity:', error);
      throw error;
    }
  }

  async trackApiUsage(apiUsageData) {
    try {
      const { userId, apiKey, endpoint, method, duration, statusCode, success, metadata } = apiUsageData;
      
      const usage = {
        userId,
        type: 'api_usage',
        apiKey,
        endpoint,
        method,
        duration,
        statusCode,
        success,
        metadata,
        timestamp: new Date()
      };

      if (!this.usageData.has(userId)) {
        this.usageData.set(userId, []);
      }
      this.usageData.get(userId).push(usage);

      logger.debug(`API usage tracked: ${userId} - ${method} ${endpoint}`);
      return true;
    } catch (error) {
      logger.error('Failed to track API usage:', error);
      throw error;
    }
  }

  async checkUsageQuota(userId, resourceType, subscription) {
    try {
      const quota = this.quotas.get(subscription);
      if (!quota) {
        return false;
      }

      const limit = quota[resourceType];
      if (limit === -1) {
        return true; // unlimited
      }

      const currentUsage = await this.getCurrentUsage(userId, resourceType);
      return currentUsage < limit;
    } catch (error) {
      logger.error('Failed to check usage quota:', error);
      return false;
    }
  }

  async getCurrentUsage(userId, resourceType) {
    try {
      const userUsage = this.usageData.get(userId) || [];
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Filter usage for current month
      const currentMonthUsage = userUsage.filter(usage => 
        usage.timestamp >= monthStart && usage.timestamp <= now
      );

      switch (resourceType) {
        case 'apiCalls':
          return currentMonthUsage.filter(usage => usage.type === 'api_usage').length;
        case 'modelCalls':
          return currentMonthUsage.filter(usage => usage.type === 'model_usage').length;
        case 'codeGeneration':
          return currentMonthUsage.filter(usage => usage.type === 'code_generation').length;
        case 'bandwidth':
          return currentMonthUsage
            .filter(usage => usage.type === 'bandwidth')
            .reduce((total, usage) => total + usage.totalSize, 0);
        default:
          return 0;
      }
    } catch (error) {
      logger.error('Failed to get current usage:', error);
      return 0;
    }
  }

  async getUserUsageStats(userId, options = {}) {
    try {
      const { startDate, endDate } = options;
      const userUsage = this.usageData.get(userId) || [];
      
      const filteredUsage = userUsage.filter(usage => {
        if (startDate && usage.timestamp < startDate) return false;
        if (endDate && usage.timestamp > endDate) return false;
        return true;
      });

      const stats = {
        totalRequests: filteredUsage.length,
        successfulRequests: filteredUsage.filter(usage => usage.success).length,
        failedRequests: filteredUsage.filter(usage => !usage.success).length,
        averageResponseTime: 0,
        totalTokens: 0,
        totalCost: 0,
        bandwidth: 0,
        codeGeneration: {
          totalLines: 0,
          totalFiles: 0
        }
      };

      // Calculate averages and totals
      const durationsSum = filteredUsage.reduce((sum, usage) => sum + (usage.duration || 0), 0);
      stats.averageResponseTime = filteredUsage.length > 0 ? durationsSum / filteredUsage.length : 0;

      const modelUsage = filteredUsage.filter(usage => usage.type === 'model_usage');
      stats.totalTokens = modelUsage.reduce((sum, usage) => sum + (usage.tokens || 0), 0);
      stats.totalCost = modelUsage.reduce((sum, usage) => sum + (usage.cost || 0), 0);

      const bandwidthUsage = filteredUsage.filter(usage => usage.type === 'bandwidth');
      stats.bandwidth = bandwidthUsage.reduce((sum, usage) => sum + (usage.totalSize || 0), 0);

      const codeGenUsage = filteredUsage.filter(usage => usage.type === 'code_generation');
      stats.codeGeneration.totalLines = codeGenUsage.reduce((sum, usage) => sum + (usage.linesGenerated || 0), 0);
      stats.codeGeneration.totalFiles = codeGenUsage.reduce((sum, usage) => sum + (usage.filesGenerated || 0), 0);

      return stats;
    } catch (error) {
      logger.error('Failed to get user usage stats:', error);
      throw error;
    }
  }

  async calculateCost(modelId, tokens) {
    try {
      // Mock cost calculation
      const costPerToken = {
        'gpt-4': 0.00003,
        'gpt-3.5-turbo': 0.000002,
        'claude-3-opus': 0.000015,
        'claude-3-sonnet': 0.000003
      };

      const rate = costPerToken[modelId] || 0.000001;
      return tokens * rate;
    } catch (error) {
      logger.error('Failed to calculate cost:', error);
      return 0;
    }
  }

  async resetUsage(userId) {
    try {
      this.usageData.set(userId, []);
      logger.info(`Usage reset for user: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Failed to reset usage:', error);
      throw error;
    }
  }

  async getUsageReport(userId, options = {}) {
    try {
      const { startDate, endDate, groupBy = 'day' } = options;
      const stats = await this.getUserUsageStats(userId, { startDate, endDate });
      
      return {
        userId,
        period: {
          start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: endDate || new Date()
        },
        stats,
        groupBy
      };
    } catch (error) {
      logger.error('Failed to get usage report:', error);
      throw error;
    }
  }
}

module.exports = { usageService: new UsageService() };