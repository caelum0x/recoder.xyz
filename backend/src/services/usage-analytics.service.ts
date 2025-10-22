import { PrismaClient } from '@prisma/client';
import { Parser } from 'json2csv';

const prisma = new PrismaClient();

/**
 * Get usage analytics for a user
 */
export async function getUserUsageAnalytics(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const start = startDate || new Date(new Date().setDate(new Date().getDate() - 30));
  const end = endDate || new Date();

  // Get all usage records
  const usageRecords = await prisma.usageRecord.findMany({
    where: {
      userId,
      timestamp: {
        gte: start,
        lte: end
      }
    },
    orderBy: { timestamp: 'asc' }
  });

  // Get CLI usage
  const cliUsage = await prisma.cLIUsage.findMany({
    where: {
      userId,
      timestamp: {
        gte: start,
        lte: end
      }
    },
    orderBy: { timestamp: 'asc' }
  });

  // Combine all usage
  const allUsage = [
    ...usageRecords.map(r => ({
      timestamp: r.timestamp,
      type: r.type,
      tokens: r.tokens || 0,
      cost: r.cost || 0,
      duration: r.duration || 0,
      success: r.success,
      metadata: r.metadata as any,
      source: 'general'
    })),
    ...cliUsage.map(c => ({
      timestamp: c.timestamp,
      type: c.requestType,
      tokens: c.tokens || 0,
      cost: c.cost || 0,
      duration: c.duration || 0,
      success: c.success,
      metadata: {
        model: c.model,
        provider: c.provider,
        ...c.metadata as any
      },
      source: 'cli'
    }))
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Calculate summary stats
  const summary = {
    totalRequests: allUsage.length,
    successfulRequests: allUsage.filter(u => u.success).length,
    failedRequests: allUsage.filter(u => !u.success).length,
    totalTokens: allUsage.reduce((sum, u) => sum + u.tokens, 0),
    totalCost: allUsage.reduce((sum, u) => sum + u.cost, 0),
    averageDuration: allUsage.length > 0 
      ? allUsage.reduce((sum, u) => sum + u.duration, 0) / allUsage.length 
      : 0,
    successRate: allUsage.length > 0
      ? (allUsage.filter(u => u.success).length / allUsage.length) * 100
      : 0
  };

  // Group by time periods
  const daily = groupByDay(allUsage);
  const hourly = groupByHour(allUsage);

  return {
    summary,
    daily,
    hourly,
    usage: allUsage,
    dateRange: { start, end }
  };
}

/**
 * Get usage breakdown by provider
 */
export async function getUsageByProvider(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const start = startDate || new Date(new Date().setDate(new Date().getDate() - 30));
  const end = endDate || new Date();

  const usage = await prisma.cLIUsage.groupBy({
    by: ['provider'],
    where: {
      userId,
      timestamp: {
        gte: start,
        lte: end
      },
      provider: { not: null }
    },
    _count: { id: true },
    _sum: {
      tokens: true,
      cost: true
    }
  });

  return usage.map(u => ({
    provider: u.provider,
    requests: u._count.id,
    tokens: u._sum.tokens || 0,
    cost: u._sum.cost || 0
  }));
}

/**
 * Get usage breakdown by model
 */
export async function getUsageByModel(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const start = startDate || new Date(new Date().setDate(new Date().getDate() - 30));
  const end = endDate || new Date();

  const usage = await prisma.cLIUsage.groupBy({
    by: ['model'],
    where: {
      userId,
      timestamp: {
        gte: start,
        lte: end
      },
      model: { not: null }
    },
    _count: { id: true },
    _sum: {
      tokens: true,
      cost: true
    }
  });

  return usage.map(u => ({
    model: u.model,
    requests: u._count.id,
    tokens: u._sum.tokens || 0,
    cost: u._sum.cost || 0
  }));
}

/**
 * Get cost breakdown
 */
export async function getCostBreakdown(
  userId: string,
  startDate?: Date,
  endDate?: Date
) {
  const start = startDate || new Date(new Date().setDate(new Date().getDate() - 30));
  const end = endDate || new Date();

  const byProvider = await getUsageByProvider(userId, start, end);
  const byModel = await getUsageByModel(userId, start, end);

  // Get total cost
  const totalCost = byProvider.reduce((sum, p) => sum + p.cost, 0);

  // Calculate percentages
  const providerBreakdown = byProvider.map(p => ({
    ...p,
    percentage: totalCost > 0 ? (p.cost / totalCost) * 100 : 0
  }));

  const modelBreakdown = byModel.map(m => ({
    ...m,
    percentage: totalCost > 0 ? (m.cost / totalCost) * 100 : 0
  }));

  return {
    totalCost,
    byProvider: providerBreakdown,
    byModel: modelBreakdown,
    dateRange: { start, end }
  };
}

/**
 * Get usage trends
 */
export async function getUsageTrends(
  userId: string,
  days: number = 30
) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const usage = await getUserUsageAnalytics(userId, startDate, endDate);

  // Calculate daily trends
  const trends = [];
  const dailyData = usage.daily;

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayData = dailyData.find(d => d.date === dateStr);

    trends.push({
      date: dateStr,
      requests: dayData?.requests || 0,
      tokens: dayData?.tokens || 0,
      cost: dayData?.cost || 0,
      successRate: dayData?.successRate || 0
    });
  }

  return trends;
}

/**
 * Export usage data
 */
export async function exportUsageData(
  userId: string,
  format: 'csv' | 'json',
  startDate?: Date,
  endDate?: Date
) {
  const analytics = await getUserUsageAnalytics(userId, startDate, endDate);

  if (format === 'json') {
    return {
      format: 'json',
      data: JSON.stringify(analytics, null, 2)
    };
  }

  // CSV format
  const fields = [
    { label: 'Timestamp', value: 'timestamp' },
    { label: 'Type', value: 'type' },
    { label: 'Source', value: 'source' },
    { label: 'Tokens', value: 'tokens' },
    { label: 'Cost (USD)', value: 'cost' },
    { label: 'Duration (ms)', value: 'duration' },
    { label: 'Success', value: 'success' },
    { label: 'Model', value: 'metadata.model' },
    { label: 'Provider', value: 'metadata.provider' }
  ];

  const parser = new Parser({ fields });
  const csv = parser.parse(analytics.usage);

  return {
    format: 'csv',
    data: csv
  };
}

/**
 * Get usage alerts
 */
export async function getUsageAlerts(userId: string) {
  const status = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscription: true }
  });

  if (!status) {
    return [];
  }

  // Get current month usage
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const usage = await getUserUsageAnalytics(userId, monthStart);

  // Get limits based on subscription
  let limits = {
    monthlyRequests: 100,
    dailyRequests: 10,
    costLimitUSD: 0
  };

  if (status.subscription === 'pro') {
    limits = {
      monthlyRequests: 5000,
      dailyRequests: 200,
      costLimitUSD: 50
    };
  } else if (status.subscription === 'enterprise') {
    limits = {
      monthlyRequests: -1, // unlimited
      dailyRequests: -1,
      costLimitUSD: -1
    };
  }

  const alerts = [];

  // Check monthly requests
  if (limits.monthlyRequests > 0) {
    const usagePercent = (usage.summary.totalRequests / limits.monthlyRequests) * 100;
    if (usagePercent >= 80 && usagePercent < 90) {
      alerts.push({
        type: 'warning',
        category: 'requests',
        message: `You've used ${usagePercent.toFixed(0)}% of your monthly request limit`,
        current: usage.summary.totalRequests,
        limit: limits.monthlyRequests
      });
    } else if (usagePercent >= 90) {
      alerts.push({
        type: 'critical',
        category: 'requests',
        message: `You've used ${usagePercent.toFixed(0)}% of your monthly request limit`,
        current: usage.summary.totalRequests,
        limit: limits.monthlyRequests
      });
    }
  }

  // Check cost
  if (limits.costLimitUSD > 0) {
    const costPercent = (usage.summary.totalCost / limits.costLimitUSD) * 100;
    if (costPercent >= 80 && costPercent < 90) {
      alerts.push({
        type: 'warning',
        category: 'cost',
        message: `You've spent ${costPercent.toFixed(0)}% of your monthly cost limit`,
        current: usage.summary.totalCost,
        limit: limits.costLimitUSD
      });
    } else if (costPercent >= 90) {
      alerts.push({
        type: 'critical',
        category: 'cost',
        message: `You've spent ${costPercent.toFixed(0)}% of your monthly cost limit`,
        current: usage.summary.totalCost,
        limit: limits.costLimitUSD
      });
    }
  }

  return alerts;
}

/**
 * Helper: Group usage by day
 */
function groupByDay(usage: any[]) {
  const grouped = new Map<string, any>();

  usage.forEach(u => {
    const date = u.timestamp.toISOString().split('T')[0];
    
    if (!grouped.has(date)) {
      grouped.set(date, {
        date,
        requests: 0,
        tokens: 0,
        cost: 0,
        duration: 0,
        successful: 0,
        failed: 0
      });
    }

    const day = grouped.get(date)!;
    day.requests++;
    day.tokens += u.tokens;
    day.cost += u.cost;
    day.duration += u.duration;
    if (u.success) {
      day.successful++;
    } else {
      day.failed++;
    }
  });

  const result = Array.from(grouped.values());
  result.forEach(day => {
    day.averageDuration = day.requests > 0 ? day.duration / day.requests : 0;
    day.successRate = day.requests > 0 ? (day.successful / day.requests) * 100 : 0;
  });

  return result;
}

/**
 * Helper: Group usage by hour
 */
function groupByHour(usage: any[]) {
  const grouped = new Map<number, any>();

  usage.forEach(u => {
    const hour = u.timestamp.getHours();
    
    if (!grouped.has(hour)) {
      grouped.set(hour, {
        hour,
        requests: 0,
        tokens: 0,
        cost: 0
      });
    }

    const hourData = grouped.get(hour)!;
    hourData.requests++;
    hourData.tokens += u.tokens;
    hourData.cost += u.cost;
  });

  return Array.from(grouped.values()).sort((a, b) => a.hour - b.hour);
}
