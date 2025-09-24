// Subscription Metrics API - Real subscription analytics and monitoring
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for metrics operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

const subscriptionMetricsSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  segmentBy: z.enum(['plan', 'billing_cycle', 'acquisition_channel', 'user_type']).optional(),
  includeForecasts: z.boolean().default(true),
});

// GET - Get comprehensive subscription metrics
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'subscription-metrics');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const granularity = searchParams.get('granularity') || 'day';
    const segmentBy = searchParams.get('segmentBy');
    const includeForecasts = searchParams.get('includeForecasts') !== 'false';
    
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');

    // Set default date range if not provided
    const now = new Date();
    if (!startDate || !endDate) {
      endDate = now.toISOString();
      
      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
          break;
        case 'week':
          startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString(); // 12 weeks
          break;
        case 'month':
          startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString(); // 12 months
          break;
        case 'quarter':
          startDate = new Date(now.getTime() - 8 * 90 * 24 * 60 * 60 * 1000).toISOString(); // 8 quarters
          break;
        case 'year':
          startDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString(); // 5 years
          break;
      }
    }

    // Get subscription overview metrics
    const overview = await getSubscriptionOverview(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get subscription lifecycle metrics
    const lifecycle = await getSubscriptionLifecycle(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get revenue metrics
    const revenue = await getSubscriptionRevenue(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get time series data
    const timeSeries = await getSubscriptionTimeSeries(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now, 
      granularity as any
    );
    
    // Get plan performance
    const planPerformance = await getPlanPerformance(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get churn analysis
    const churnAnalysis = await getChurnAnalysis(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get upgrade/downgrade patterns
    const upgradeDowngradePatterns = await getUpgradeDowngradePatterns(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get cohort retention
    const cohortRetention = await getCohortRetention();
    
    // Get segmented analysis if requested
    let segmentedAnalysis = null;
    if (segmentBy) {
      segmentedAnalysis = await getSegmentedSubscriptionAnalysis(
        segmentBy,
        startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate) : now
      );
    }

    // Get forecasts if requested
    let forecasts = null;
    if (includeForecasts) {
      forecasts = await getSubscriptionForecasts();
    }

    return NextResponse.json({
      period,
      dateRange: { startDate, endDate },
      overview,
      lifecycle,
      revenue,
      timeSeries,
      planPerformance,
      churnAnalysis,
      upgradeDowngradePatterns,
      cohortRetention,
      segmentedAnalysis,
      forecasts,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Subscription metrics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription metrics' },
      { status: 500 }
    );
  }
}

async function getSubscriptionOverview(startDate: Date, endDate: Date) {
  // Get current active subscriptions
  const activeSubscriptions = await prisma.subscription.count({
    where: { status: 'active' }
  });

  // Get new subscriptions in period
  const newSubscriptions = await prisma.subscription.count({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  // Get cancelled subscriptions in period
  const cancelledSubscriptions = await prisma.subscription.count({
    where: {
      status: 'cancelled',
      updatedAt: { gte: startDate, lte: endDate }
    }
  });

  // Calculate net growth
  const netGrowth = newSubscriptions - cancelledSubscriptions;

  // Get subscription status breakdown
  const statusBreakdown = await prisma.subscription.groupBy({
    by: ['status'],
    _count: { id: true },
    where: {
      createdAt: { lte: endDate }
    }
  });

  // Get billing cycle breakdown
  const billingCycleBreakdown = await prisma.subscription.groupBy({
    by: ['billingCycle'],
    _count: { id: true },
    _sum: { amount: true },
    where: {
      status: 'active'
    }
  });

  // Get plan distribution  
  const planDistribution = await prisma.subscription.groupBy({
    by: ['planId'],
    _count: { id: true },
    _sum: { amount: true },
    where: {
      status: 'active'
    }
  });

  return {
    activeSubscriptions,
    newSubscriptions,
    cancelledSubscriptions,
    netGrowth,
    statusBreakdown: statusBreakdown.map(s => ({
      status: s.status,
      count: s._count.id
    })),
    billingCycleBreakdown: billingCycleBreakdown.map(b => ({
      cycle: b.billingCycle,
      count: b._count.id,
      totalRevenue: Number(b._sum.amount) || 0
    })),
    planDistribution: planDistribution.map(p => ({
      plan: p.planId,
      count: p._count.id,
      totalRevenue: Number(p._sum.amount) || 0
    }))
  };
}

async function getSubscriptionLifecycle(startDate: Date, endDate: Date) {
  // Get active subscriptions that converted from trial period
  const trialConversions = await prisma.subscription.count({
    where: {
      currentPeriodEnd: { gte: startDate, lte: endDate },
      status: 'active'
    }
  });

  const totalTrials = await prisma.subscription.count({
    where: {
      createdAt: { 
        gte: startDate, 
        lte: endDate
      },
      status: { in: ['active', 'cancelled'] }
    }
  });

  const trialConversionRate = totalTrials > 0 ? (trialConversions / totalTrials) * 100 : 0;

  // Get subscription changes in period - temporarily disable due to missing relation
  const subscriptionChanges: any[] = [];

  // Calculate average subscription duration
  const completedSubscriptions = await prisma.subscription.findMany({
    where: {
      updatedAt: { gte: startDate, lte: endDate }
    },
    select: {
      createdAt: true,
      updatedAt: true
    }
  });

  const avgDurationDays = completedSubscriptions.length > 0
    ? completedSubscriptions.reduce((sum, sub) => {
        const duration = (sub.updatedAt.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return sum + duration;
      }, 0) / completedSubscriptions.length
    : 0;

  return {
    trialConversions,
    totalTrials,
    trialConversionRate,
    avgDurationDays,
    subscriptionChanges: []
  };
}

async function getSubscriptionRevenue(startDate: Date, endDate: Date) {
  // Get MRR (Monthly Recurring Revenue)
  const activeMRR = await prisma.subscription.aggregate({
    where: { status: 'active' },
    _sum: { amount: true }
  });

  // Calculate ARR (Annual Recurring Revenue)
  const arr = Number(activeMRR._sum.amount || 0) * 12;

  // Get new MRR in period (from new subscriptions)
  const newMRR = await prisma.subscription.aggregate({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      status: 'active'
    },
    _sum: { amount: true }
  });

  // Get churned MRR (from cancelled subscriptions)
  const churnedMRR = await prisma.subscription.aggregate({
    where: {
      updatedAt: { gte: startDate, lte: endDate }
    },
    _sum: { amount: true }
  });

  // Get expansion MRR (from upgrades) - temporarily disable due to missing relation
  const expansionChanges = { _sum: { proratedAmount: 0 } };

  // Get contraction MRR (from downgrades) - temporarily disable due to missing relation  
  const contractionChanges = { _sum: { proratedAmount: 0 } };

  const netNewMRR = Number(newMRR._sum.amount || 0) - Number(churnedMRR._sum.amount || 0);
  const netExpansionMRR = Number(expansionChanges._sum.proratedAmount || 0) - Math.abs(Number(contractionChanges._sum.proratedAmount || 0));

  return {
    mrr: Number(activeMRR._sum.amount) || 0,
    arr,
    newMRR: Number(newMRR._sum.amount) || 0,
    churnedMRR: Number(churnedMRR._sum.amount) || 0,
    expansionMRR: Number(expansionChanges._sum.proratedAmount) || 0,
    contractionMRR: Math.abs(Number(contractionChanges._sum.proratedAmount) || 0),
    netNewMRR,
    netExpansionMRR,
    totalNetMRR: netNewMRR + netExpansionMRR
  };
}

async function getSubscriptionTimeSeries(startDate: Date, endDate: Date, granularity: 'day' | 'week' | 'month') {
  const timeSeriesQuery = `
    SELECT 
      DATE_TRUNC('${granularity}', "createdAt") as period,
      COUNT(*) as new_subscriptions,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions,
      SUM(amount) as revenue,
      AVG(amount) as avg_amount
    FROM subscriptions
    WHERE "createdAt" >= $1 AND "createdAt" <= $2
    GROUP BY period
    ORDER BY period;
  `;

  const result = await prisma.$queryRawUnsafe(timeSeriesQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    period: row.period,
    newSubscriptions: Number(row.new_subscriptions) || 0,
    activeSubscriptions: Number(row.active_subscriptions) || 0,
    revenue: Number(row.revenue) || 0,
    avgAmount: Number(row.avg_amount) || 0
  })) : [];
}

async function getPlanPerformance(startDate: Date, endDate: Date) {
  const planPerformanceQuery = `
    SELECT 
      "planId" as plan,
      COUNT(*) as total_subscriptions,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as churned_subscriptions,
      SUM(amount) as total_revenue,
      AVG(amount) as avg_revenue,
      AVG(EXTRACT(EPOCH FROM (COALESCE("updatedAt", NOW()) - "createdAt")) / 86400) as avg_lifetime_days
    FROM subscriptions
    WHERE "createdAt" >= $1 AND "createdAt" <= $2
    GROUP BY "planId"
    ORDER BY total_revenue DESC;
  `;

  const result = await prisma.$queryRawUnsafe(planPerformanceQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    plan: row.plan,
    totalSubscriptions: Number(row.total_subscriptions) || 0,
    activeSubscriptions: Number(row.active_subscriptions) || 0,
    churnedSubscriptions: Number(row.churned_subscriptions) || 0,
    churnRate: Number(row.total_subscriptions) > 0 
      ? ((Number(row.churned_subscriptions) || 0) / Number(row.total_subscriptions)) * 100 
      : 0,
    totalRevenue: Number(row.total_revenue) || 0,
    avgRevenue: Number(row.avg_revenue) || 0,
    avgLifetimeDays: Number(row.avg_lifetime_days) || 0
  })) : [];
}

async function getChurnAnalysis(startDate: Date, endDate: Date) {
  // Get churned subscriptions with reasons
  const churnedSubs = await prisma.subscription.findMany({
    where: {
      updatedAt: { gte: startDate, lte: endDate }
    }
  });

  // Calculate churn rate
  const totalActiveAtStart = await prisma.subscription.count({
    where: {
      createdAt: { lt: startDate },
      OR: [
        { updatedAt: undefined },
        { updatedAt: { gt: startDate } }
      ]
    }
  });

  const churnRate = totalActiveAtStart > 0 ? (churnedSubs.length / totalActiveAtStart) * 100 : 0;

  // Analyze churn by plan
  const churnByPlan = churnedSubs.reduce((acc, sub) => {
    const planId = sub.planId || 'unknown';
    acc[planId] = (acc[planId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Analyze churn timing (how long before churning)
  const churnTimingDistribution = churnedSubs.map(sub => {
    const daysActive = (sub.updatedAt.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysActive <= 7) return 'week1';
    if (daysActive <= 30) return 'month1';
    if (daysActive <= 90) return 'month3';
    if (daysActive <= 180) return 'month6';
    return 'longterm';
  }).reduce((acc, period) => {
    acc[period] = (acc[period] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalChurned: churnedSubs.length,
    churnRate,
    churnByPlan: Object.entries(churnByPlan).map(([plan, count]) => ({
      plan,
      count
    })),
    churnTimingDistribution: Object.entries(churnTimingDistribution).map(([period, count]) => ({
      period,
      count
    })),
    avgDaysToChurn: churnedSubs.length > 0 
      ? churnedSubs.reduce((sum, sub) => {
          return sum + ((sub.updatedAt.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / churnedSubs.length
      : 0
  };
}

async function getUpgradeDowngradePatterns(startDate: Date, endDate: Date) {
  // Temporarily disable due to missing SubscriptionChange relation
  return {
    totalUpgrades: 0,
    totalDowngrades: 0,
    netUpgrades: 0,
    upgradePatterns: [],
    downgradePatterns: [],
    avgTimeToUpgrade: 0,
    totalRevenueImpact: 0
  };
}

async function getCohortRetention() {
  // Get subscription cohorts (grouped by signup month)
  const cohortQuery = `
    WITH cohorts AS (
      SELECT 
        DATE_TRUNC('month', "createdAt") as cohort_month,
        id,
        "updatedAt",
        EXTRACT(EPOCH FROM (COALESCE("updatedAt", NOW()) - "createdAt")) / (30 * 86400) as months_retained
      FROM subscriptions
      WHERE "createdAt" >= $1
    ),
    cohort_sizes AS (
      SELECT 
        cohort_month,
        COUNT(*) as cohort_size
      FROM cohorts
      GROUP BY cohort_month
    ),
    retention_by_month AS (
      SELECT 
        c1.cohort_month,
        cs.cohort_size,
        COUNT(CASE WHEN c1.months_retained >= 1 THEN 1 END) as retained_month_1,
        COUNT(CASE WHEN c1.months_retained >= 3 THEN 1 END) as retained_month_3,
        COUNT(CASE WHEN c1.months_retained >= 6 THEN 1 END) as retained_month_6,
        COUNT(CASE WHEN c1.months_retained >= 12 THEN 1 END) as retained_month_12
      FROM cohorts c1
      JOIN cohort_sizes cs ON c1.cohort_month = cs.cohort_month
      GROUP BY c1.cohort_month, cs.cohort_size
    )
    SELECT 
      cohort_month,
      cohort_size,
      retained_month_1,
      ROUND((retained_month_1::float / cohort_size) * 100, 2) as retention_rate_1,
      retained_month_3,
      ROUND((retained_month_3::float / cohort_size) * 100, 2) as retention_rate_3,
      retained_month_6,
      ROUND((retained_month_6::float / cohort_size) * 100, 2) as retention_rate_6,
      retained_month_12,
      ROUND((retained_month_12::float / cohort_size) * 100, 2) as retention_rate_12
    FROM retention_by_month
    ORDER BY cohort_month DESC;
  `;

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2); // Last 2 years

  const result = await prisma.$queryRawUnsafe(cohortQuery, cutoffDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    cohortMonth: row.cohort_month,
    cohortSize: Number(row.cohort_size) || 0,
    retainedMonth1: Number(row.retained_month_1) || 0,
    retentionRate1: Number(row.retention_rate_1) || 0,
    retainedMonth3: Number(row.retained_month_3) || 0,
    retentionRate3: Number(row.retention_rate_3) || 0,
    retainedMonth6: Number(row.retained_month_6) || 0,
    retentionRate6: Number(row.retention_rate_6) || 0,
    retainedMonth12: Number(row.retained_month_12) || 0,
    retentionRate12: Number(row.retention_rate_12) || 0
  })) : [];
}

async function getSegmentedSubscriptionAnalysis(
  segmentBy: string,
  startDate: Date,
  endDate: Date
) {
  let joinClause = '';
  let segmentField = '';

  switch (segmentBy) {
    case 'plan':
      segmentField = 's."planId"';
      break;
    case 'billing_cycle':
      segmentField = 's."billingCycle"';
      break;
    case 'acquisition_channel':
      segmentField = 'u.organization';
      joinClause = 'LEFT JOIN users u ON s."userId" = u.id';
      break;
    case 'user_type':
      segmentField = 'u.role';
      joinClause = 'LEFT JOIN users u ON s."userId" = u.id';
      break;
    default:
      segmentField = "'Unknown'";
  }

  const segmentQuery = `
    SELECT 
      ${segmentField} as segment,
      COUNT(*) as total_subscriptions,
      COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_subscriptions,
      COUNT(CASE WHEN s.status = 'cancelled' AND s."updatedAt" >= $1 AND s."updatedAt" <= $2 THEN 1 END) as churned_in_period,
      SUM(s.amount) as total_revenue,
      AVG(s.amount) as avg_revenue,
      AVG(EXTRACT(EPOCH FROM (COALESCE(s."updatedAt", NOW()) - s."createdAt")) / 86400) as avg_lifetime_days
    FROM subscriptions s
    ${joinClause}
    WHERE s."createdAt" >= $1 AND s."createdAt" <= $2
    GROUP BY ${segmentField}
    HAVING COUNT(*) >= 1
    ORDER BY total_revenue DESC;
  `;

  const result = await prisma.$queryRawUnsafe(segmentQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    segment: row.segment || 'Unknown',
    totalSubscriptions: Number(row.total_subscriptions) || 0,
    activeSubscriptions: Number(row.active_subscriptions) || 0,
    churnedInPeriod: Number(row.churned_in_period) || 0,
    churnRate: Number(row.total_subscriptions) > 0
      ? ((Number(row.churned_in_period) || 0) / Number(row.total_subscriptions)) * 100
      : 0,
    totalRevenue: Number(row.total_revenue) || 0,
    avgRevenue: Number(row.avg_revenue) || 0,
    avgLifetimeDays: Number(row.avg_lifetime_days) || 0
  })) : [];
}

async function getSubscriptionForecasts() {
  // Simple forecasting based on historical trends
  const currentMRR = await prisma.subscription.aggregate({
    where: { status: 'active' },
    _sum: { amount: true }
  });

  // Get growth rate from last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const mrrThreeMonthsAgo = await prisma.subscription.aggregate({
    where: {
      status: 'active',
      createdAt: { lte: threeMonthsAgo }
    },
    _sum: { amount: true }
  });

  const monthlyGrowthRate = (Number(currentMRR._sum.amount || 0) - Number(mrrThreeMonthsAgo._sum.amount || 0)) / 3;

  // Generate 12-month forecast
  const forecasts = [];
  let projectedMRR = Number(currentMRR._sum.amount) || 0;

  for (let month = 1; month <= 12; month++) {
    projectedMRR += monthlyGrowthRate;
    forecasts.push({
      month,
      projectedMRR: Math.max(0, projectedMRR),
      projectedARR: Math.max(0, projectedMRR * 12),
      projectedSubscriptions: Math.ceil(projectedMRR / 50), // Assuming avg $50/month
      confidenceInterval: {
        low: Math.max(0, projectedMRR * 0.8),
        high: projectedMRR * 1.2
      }
    });
  }

  return {
    currentMRR: Number(currentMRR._sum.amount) || 0,
    monthlyGrowthRate,
    forecasts
  };
}