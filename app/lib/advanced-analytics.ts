/**
 * Advanced Analytics - Additional metrics and insights
 */

export class AdvancedAnalytics {
  static async getModelEfficiency(records: any[]) {
    const modelStats = new Map();
    
    records.forEach(record => {
      const model = record.model || 'unknown';
      if (!modelStats.has(model)) {
        modelStats.set(model, { 
          totalCost: 0, 
          totalTokens: 0, 
          requests: 0,
          avgLatency: 0 
        });
      }
      
      const stats = modelStats.get(model);
      stats.totalCost += record.cost || 0;
      stats.totalTokens += record.tokens || 0;
      stats.requests += 1;
      stats.avgLatency += record.duration || 0;
    });

    return Array.from(modelStats.entries()).map(([model, stats]) => ({
      model,
      costPerToken: stats.totalTokens > 0 ? stats.totalCost / stats.totalTokens : 0,
      avgLatency: stats.requests > 0 ? stats.avgLatency / stats.requests : 0,
      efficiency: stats.totalTokens / (stats.totalCost || 1), // tokens per dollar
      requests: stats.requests
    })).sort((a, b) => b.efficiency - a.efficiency);
  }

  static async getPlatformInsights(records: any[]) {
    const platforms = { web: 0, cli: 0 };
    const costs = { web: 0, cli: 0 };
    
    records.forEach(record => {
      const platform = record.platform || 'web';
      platforms[platform] = (platforms[platform] || 0) + 1;
      costs[platform] = (costs[platform] || 0) + (record.cost || 0);
    });

    return {
      mostUsedPlatform: platforms.cli > platforms.web ? 'cli' : 'web',
      costEfficiency: costs.cli < costs.web ? 'cli' : 'web',
      usage: platforms,
      costs
    };
  }

  static async getUsagePatterns(records: any[]) {
    const hourly = new Array(24).fill(0);
    const daily = new Array(7).fill(0);
    
    records.forEach(record => {
      const date = new Date(record.timestamp);
      hourly[date.getHours()]++;
      daily[date.getDay()]++;
    });

    return {
      peakHour: hourly.indexOf(Math.max(...hourly)),
      peakDay: daily.indexOf(Math.max(...daily)),
      hourlyDistribution: hourly,
      dailyDistribution: daily
    };
  }
}
