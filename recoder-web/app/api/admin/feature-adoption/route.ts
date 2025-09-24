// Feature Adoption Analysis API - Real feature usage analytics and adoption tracking
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for feature adoption analytics
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 35,
});

const featureAdoptionSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  segmentBy: z.enum(['user_type', 'plan', 'acquisition_channel', 'company_size', 'region']).optional(),
  featureFilter: z.string().optional(),
  includeDetailedMetrics: z.boolean().default(true),
});

// GET - Get comprehensive feature adoption analytics
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 25, 'feature-adoption');
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
    const featureFilter = searchParams.get('featureFilter');
    const includeDetailedMetrics = searchParams.get('includeDetailedMetrics') !== 'false';
    
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');

    // Set default date range if not provided
    const now = new Date();
    if (!startDate || !endDate) {
      endDate = now.toISOString();
      
      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
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
          startDate = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString(); // 3 years
          break;
      }
    }

    // Get feature adoption overview
    const overview = await getFeatureAdoptionOverview(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get feature funnel analysis
    const featureFunnel = await getFeatureFunnelAnalysis(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get adoption timeline
    const adoptionTimeline = await getFeatureAdoptionTimeline(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now, 
      granularity as any
    );
    
    // Get feature lifecycle analysis
    const lifecycleAnalysis = await getFeatureLifecycleAnalysis(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get user journey analysis
    const userJourney = await getUserJourneyAnalysis(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get feature stickiness metrics
    const stickinessMetrics = await getFeatureStickinessMetrics(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get cohort adoption analysis
    const cohortAdoption = await getCohortAdoptionAnalysis();
    
    // Get feature correlation analysis
    const featureCorrelation = await getFeatureCorrelationAnalysis(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get abandonment analysis
    const abandonmentAnalysis = await getFeatureAbandonmentAnalysis(
      startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : now
    );
    
    // Get segmented analysis if requested
    let segmentedAnalysis = null;
    if (segmentBy) {
      segmentedAnalysis = await getSegmentedFeatureAnalysis(
        segmentBy,
        startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate) : now
      );
    }

    // Get detailed metrics if requested
    let detailedMetrics = null;
    if (includeDetailedMetrics) {
      detailedMetrics = await getDetailedFeatureMetrics(
        startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), 
        endDate ? new Date(endDate) : now,
        featureFilter
      );
    }

    return NextResponse.json({
      period,
      dateRange: { startDate, endDate },
      overview,
      featureFunnel,
      adoptionTimeline,
      lifecycleAnalysis,
      userJourney,
      stickinessMetrics,
      cohortAdoption,
      featureCorrelation,
      abandonmentAnalysis,
      segmentedAnalysis,
      detailedMetrics,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Feature adoption analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feature adoption analytics' },
      { status: 500 }
    );
  }
}

async function getFeatureAdoptionOverview(startDate: Date, endDate: Date) {
  // Get total unique features used
  const totalFeatures = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      createdAt: { gte: startDate, lte: endDate },
      userId: { not: '' }
    },
    _count: { id: true }
  });

  // Get total users who used any feature
  const totalActiveUsers = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      userId: { not: '' }
    },
    distinct: ['userId'],
    select: { userId: true }
  });

  // Get new feature adopters (users who used a feature for the first time)
  const newAdoptersQuery = `
    WITH first_usage AS (
      SELECT 
        user_id,
        action,
        MIN(created_at) as first_used
      FROM audit_logs
      WHERE user_id IS NOT NULL
      GROUP BY user_id, action
    )
    SELECT 
      COUNT(DISTINCT user_id) as new_adopters,
      COUNT(*) as new_feature_adoptions
    FROM first_usage
    WHERE first_used >= $1 AND first_used <= $2;
  `;

  const newAdoptersResult = await prisma.$queryRawUnsafe(newAdoptersQuery, startDate, endDate);
  const newAdopters = Array.isArray(newAdoptersResult) && newAdoptersResult[0] 
    ? newAdoptersResult[0] as any 
    : { new_adopters: 0, new_feature_adoptions: 0 };

  // Get feature adoption rates
  const featureAdoptionRates = await prisma.$queryRaw`
    WITH feature_usage AS (
      SELECT 
        action,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_usage
      FROM audit_logs
      WHERE created_at >= ${startDate} 
        AND created_at <= ${endDate}
        AND user_id IS NOT NULL
      GROUP BY action
    ),
    total_users AS (
      SELECT COUNT(DISTINCT user_id) as total_count
      FROM audit_logs
      WHERE created_at >= ${startDate} 
        AND created_at <= ${endDate}
        AND user_id IS NOT NULL
    )
    SELECT 
      fu.action,
      fu.unique_users,
      fu.total_usage,
      ROUND((fu.unique_users::float / tu.total_count) * 100, 2) as adoption_rate
    FROM feature_usage fu
    CROSS JOIN total_users tu
    ORDER BY adoption_rate DESC;
  `;

  return {
    totalFeatures: totalFeatures.length,
    totalActiveUsers: totalActiveUsers.length,
    newAdopters: Number(newAdopters.new_adopters) || 0,
    newFeatureAdoptions: Number(newAdopters.new_feature_adoptions) || 0,
    avgFeaturesPerUser: totalActiveUsers.length > 0 
      ? totalFeatures.reduce((sum, f) => sum + (typeof f._count === 'object' && f._count ? Object.values(f._count)[0] as number || 0 : 0), 0) / totalActiveUsers.length 
      : 0,
    featureAdoptionRates: Array.isArray(featureAdoptionRates) 
      ? featureAdoptionRates.map((row: any) => ({
          feature: row.action,
          uniqueUsers: Number(row.unique_users) || 0,
          totalUsage: Number(row.total_usage) || 0,
          adoptionRate: Number(row.adoption_rate) || 0
        }))
      : []
  };
}

async function getFeatureFunnelAnalysis(startDate: Date, endDate: Date) {
  // Define feature funnel stages (customize based on your app)
  const funnelStages = [
    { stage: 'Registration', actions: ['user_created', 'signup_completed'] },
    { stage: 'First Login', actions: ['login', 'session_start'] },
    { stage: 'Profile Setup', actions: ['profile_updated', 'settings_saved'] },
    { stage: 'First Project', actions: ['project_created', 'workspace_created'] },
    { stage: 'Code Generation', actions: ['code_generated', 'ai_request'] },
    { stage: 'File Management', actions: ['file_uploaded', 'file_downloaded', 'export_data'] },
    { stage: 'Collaboration', actions: ['team_invited', 'shared_project'] },
    { stage: 'Advanced Features', actions: ['api_key_created', 'webhook_configured'] }
  ];

  const funnelData = [];

  for (const [index, stage] of funnelStages.entries()) {
    const stageUsers = await prisma.auditLog.findMany({
      where: {
        action: { in: stage.actions },
        createdAt: { gte: startDate, lte: endDate },
        userId: { not: '' }
      },
      distinct: ['userId'],
      select: { userId: true }
    });

    const previousStageUsers = index === 0 ? stageUsers.length 
      : (await prisma.auditLog.findMany({
          where: {
            action: { in: funnelStages.slice(0, index).flatMap(s => s.actions) },
            createdAt: { gte: startDate, lte: endDate },
            userId: { not: '' }
          },
          distinct: ['userId'],
          select: { userId: true }
        })).length;

    const conversionRate = previousStageUsers > 0 ? (stageUsers.length / previousStageUsers) * 100 : 0;
    const dropOffRate = 100 - conversionRate;

    funnelData.push({
      stage: stage.stage,
      users: stageUsers.length,
      conversionRate,
      dropOffRate,
      actions: stage.actions
    });
  }

  return funnelData;
}

async function getFeatureAdoptionTimeline(startDate: Date, endDate: Date, granularity: 'day' | 'week' | 'month') {
  const timelineQuery = `
    WITH feature_timeline AS (
      SELECT 
        DATE_TRUNC('${granularity}', created_at) as period,
        action,
        COUNT(DISTINCT user_id) as new_adopters,
        COUNT(*) as usage_count
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY period, action
    ),
    period_totals AS (
      SELECT 
        period,
        COUNT(DISTINCT action) as features_adopted,
        SUM(new_adopters) as total_new_adopters,
        SUM(usage_count) as total_usage
      FROM feature_timeline
      GROUP BY period
    )
    SELECT 
      period,
      features_adopted,
      total_new_adopters,
      total_usage
    FROM period_totals
    ORDER BY period;
  `;

  const result = await prisma.$queryRawUnsafe(timelineQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    period: row.period,
    featuresAdopted: Number(row.features_adopted) || 0,
    newAdopters: Number(row.total_new_adopters) || 0,
    totalUsage: Number(row.total_usage) || 0
  })) : [];
}

async function getFeatureLifecycleAnalysis(startDate: Date, endDate: Date) {
  const lifecycleQuery = `
    WITH feature_metrics AS (
      SELECT 
        action,
        MIN(created_at) as first_used,
        MAX(created_at) as last_used,
        COUNT(DISTINCT user_id) as total_adopters,
        COUNT(*) as total_usage,
        COUNT(DISTINCT DATE(created_at)) as days_used
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY action
    ),
    feature_age AS (
      SELECT 
        *,
        EXTRACT(EPOCH FROM (NOW() - first_used)) / 86400 as age_days,
        EXTRACT(EPOCH FROM (last_used - first_used)) / 86400 as usage_span_days,
        CASE 
          WHEN EXTRACT(EPOCH FROM (NOW() - last_used)) / 86400 <= 7 THEN 'Active'
          WHEN EXTRACT(EPOCH FROM (NOW() - last_used)) / 86400 <= 30 THEN 'Declining'
          ELSE 'Dormant'
        END as lifecycle_stage
      FROM feature_metrics
    )
    SELECT 
      action,
      total_adopters,
      total_usage,
      days_used,
      age_days,
      usage_span_days,
      lifecycle_stage,
      ROUND(total_usage::float / NULLIF(days_used, 0), 2) as avg_daily_usage
    FROM feature_age
    ORDER BY total_adopters DESC;
  `;

  const result = await prisma.$queryRawUnsafe(lifecycleQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    feature: row.action,
    totalAdopters: Number(row.total_adopters) || 0,
    totalUsage: Number(row.total_usage) || 0,
    daysUsed: Number(row.days_used) || 0,
    ageDays: Number(row.age_days) || 0,
    usageSpanDays: Number(row.usage_span_days) || 0,
    lifecycleStage: row.lifecycle_stage || 'Unknown',
    avgDailyUsage: Number(row.avg_daily_usage) || 0
  })) : [];
}

async function getUserJourneyAnalysis(startDate: Date, endDate: Date) {
  // Analyze common user journeys and feature adoption sequences
  const journeyQuery = `
    WITH user_sequences AS (
      SELECT 
        user_id,
        action,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as sequence_order
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
    ),
    feature_sequences AS (
      SELECT 
        us1.action as first_action,
        us2.action as second_action,
        COUNT(*) as sequence_count
      FROM user_sequences us1
      JOIN user_sequences us2 ON us1.user_id = us2.user_id 
        AND us2.sequence_order = us1.sequence_order + 1
      GROUP BY us1.action, us2.action
      HAVING COUNT(*) >= 5
    )
    SELECT 
      first_action,
      second_action,
      sequence_count,
      ROW_NUMBER() OVER (ORDER BY sequence_count DESC) as rank
    FROM feature_sequences
    ORDER BY sequence_count DESC
    LIMIT 20;
  `;

  const sequences = await prisma.$queryRawUnsafe(journeyQuery, startDate, endDate);

  // Get average time to adopt key features
  const timeToAdoptQuery = `
    WITH first_usage AS (
      SELECT 
        user_id,
        action,
        MIN(created_at) as first_used
      FROM audit_logs
      WHERE user_id IS NOT NULL
      GROUP BY user_id, action
    ),
    user_registration AS (
      SELECT 
        id as user_id,
        created_at as registered_at
      FROM users
    )
    SELECT 
      fu.action,
      AVG(EXTRACT(EPOCH FROM (fu.first_used - ur.registered_at)) / 86400) as avg_days_to_adopt,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fu.first_used - ur.registered_at)) / 86400) as median_days_to_adopt,
      COUNT(*) as adopters_count
    FROM first_usage fu
    JOIN user_registration ur ON fu.user_id = ur.user_id
    WHERE fu.first_used >= $1 AND fu.first_used <= $2
    GROUP BY fu.action
    HAVING COUNT(*) >= 10
    ORDER BY avg_days_to_adopt;
  `;

  const timeToAdopt = await prisma.$queryRawUnsafe(timeToAdoptQuery, startDate, endDate);

  return {
    commonSequences: Array.isArray(sequences) ? sequences.map((row: any) => ({
      firstAction: row.first_action,
      secondAction: row.second_action,
      count: Number(row.sequence_count) || 0,
      rank: Number(row.rank) || 0
    })) : [],
    timeToAdopt: Array.isArray(timeToAdopt) ? timeToAdopt.map((row: any) => ({
      feature: row.action,
      avgDaysToAdopt: Number(row.avg_days_to_adopt) || 0,
      medianDaysToAdopt: Number(row.median_days_to_adopt) || 0,
      adoptersCount: Number(row.adopters_count) || 0
    })) : []
  };
}

async function getFeatureStickinessMetrics(startDate: Date, endDate: Date) {
  // Calculate feature stickiness (DAU/MAU for each feature)
  const stickinessQuery = `
    WITH feature_daily_users AS (
      SELECT 
        action,
        DATE(created_at) as usage_date,
        COUNT(DISTINCT user_id) as daily_users
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY action, DATE(created_at)
    ),
    feature_monthly_users AS (
      SELECT 
        action,
        COUNT(DISTINCT user_id) as monthly_users
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY action
    )
    SELECT 
      fmu.action,
      fmu.monthly_users,
      AVG(fdu.daily_users) as avg_daily_users,
      ROUND((AVG(fdu.daily_users) / fmu.monthly_users) * 100, 2) as stickiness_ratio
    FROM feature_monthly_users fmu
    JOIN feature_daily_users fdu ON fmu.action = fdu.action
    GROUP BY fmu.action, fmu.monthly_users
    ORDER BY stickiness_ratio DESC;
  `;

  const stickiness = await prisma.$queryRawUnsafe(stickinessQuery, startDate, endDate);

  // Calculate feature retention (users who return to use feature)
  const retentionQuery = `
    WITH feature_usage_days AS (
      SELECT 
        action,
        user_id,
        COUNT(DISTINCT DATE(created_at)) as usage_days
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY action, user_id
    )
    SELECT 
      action,
      COUNT(*) as total_users,
      COUNT(CASE WHEN usage_days >= 2 THEN 1 END) as returning_users,
      COUNT(CASE WHEN usage_days >= 5 THEN 1 END) as regular_users,
      COUNT(CASE WHEN usage_days >= 10 THEN 1 END) as power_users,
      ROUND((COUNT(CASE WHEN usage_days >= 2 THEN 1 END)::float / COUNT(*)) * 100, 2) as return_rate
    FROM feature_usage_days
    GROUP BY action
    ORDER BY return_rate DESC;
  `;

  const retention = await prisma.$queryRawUnsafe(retentionQuery, startDate, endDate);

  return {
    stickiness: Array.isArray(stickiness) ? stickiness.map((row: any) => ({
      feature: row.action,
      monthlyUsers: Number(row.monthly_users) || 0,
      avgDailyUsers: Number(row.avg_daily_users) || 0,
      stickinessRatio: Number(row.stickiness_ratio) || 0
    })) : [],
    retention: Array.isArray(retention) ? retention.map((row: any) => ({
      feature: row.action,
      totalUsers: Number(row.total_users) || 0,
      returningUsers: Number(row.returning_users) || 0,
      regularUsers: Number(row.regular_users) || 0,
      powerUsers: Number(row.power_users) || 0,
      returnRate: Number(row.return_rate) || 0
    })) : []
  };
}

async function getCohortAdoptionAnalysis() {
  // Analyze feature adoption by user signup cohort
  const cohortQuery = `
    WITH user_cohorts AS (
      SELECT 
        id as user_id,
        DATE_TRUNC('month', created_at) as cohort_month
      FROM users
      WHERE created_at >= $1
    ),
    cohort_feature_adoption AS (
      SELECT 
        uc.cohort_month,
        al.action,
        COUNT(DISTINCT al.user_id) as adopters,
        COUNT(DISTINCT uc.user_id) as cohort_size
      FROM user_cohorts uc
      LEFT JOIN audit_logs al ON uc.user_id = al.user_id
      GROUP BY uc.cohort_month, al.action
    )
    SELECT 
      cohort_month,
      action,
      adopters,
      cohort_size,
      ROUND((adopters::float / NULLIF(cohort_size, 0)) * 100, 2) as adoption_rate
    FROM cohort_feature_adoption
    WHERE action IS NOT NULL
      AND cohort_size >= 10
    ORDER BY cohort_month DESC, adoption_rate DESC;
  `;

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2); // Last 2 years

  const result = await prisma.$queryRawUnsafe(cohortQuery, cutoffDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    cohortMonth: row.cohort_month,
    feature: row.action,
    adopters: Number(row.adopters) || 0,
    cohortSize: Number(row.cohort_size) || 0,
    adoptionRate: Number(row.adoption_rate) || 0
  })) : [];
}

async function getFeatureCorrelationAnalysis(startDate: Date, endDate: Date) {
  // Find features that are commonly used together
  const correlationQuery = `
    WITH user_features AS (
      SELECT 
        user_id,
        action,
        COUNT(*) as usage_count
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY user_id, action
    ),
    feature_pairs AS (
      SELECT 
        uf1.action as feature_a,
        uf2.action as feature_b,
        COUNT(*) as users_using_both
      FROM user_features uf1
      JOIN user_features uf2 ON uf1.user_id = uf2.user_id 
        AND uf1.action < uf2.action
      GROUP BY uf1.action, uf2.action
      HAVING COUNT(*) >= 5
    ),
    feature_totals AS (
      SELECT 
        action,
        COUNT(DISTINCT user_id) as total_users
      FROM user_features
      GROUP BY action
    )
    SELECT 
      fp.feature_a,
      fp.feature_b,
      fp.users_using_both,
      ft1.total_users as users_a,
      ft2.total_users as users_b,
      ROUND((fp.users_using_both::float / LEAST(ft1.total_users, ft2.total_users)) * 100, 2) as correlation_strength
    FROM feature_pairs fp
    JOIN feature_totals ft1 ON fp.feature_a = ft1.action
    JOIN feature_totals ft2 ON fp.feature_b = ft2.action
    ORDER BY correlation_strength DESC
    LIMIT 20;
  `;

  const result = await prisma.$queryRawUnsafe(correlationQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    featureA: row.feature_a,
    featureB: row.feature_b,
    usersBoth: Number(row.users_using_both) || 0,
    usersA: Number(row.users_a) || 0,
    usersB: Number(row.users_b) || 0,
    correlationStrength: Number(row.correlation_strength) || 0
  })) : [];
}

async function getFeatureAbandonmentAnalysis(startDate: Date, endDate: Date) {
  // Analyze features that users stop using
  const abandonmentQuery = `
    WITH feature_last_usage AS (
      SELECT 
        user_id,
        action,
        MAX(created_at) as last_used,
        COUNT(*) as total_usage
      FROM audit_logs
      WHERE user_id IS NOT NULL
      GROUP BY user_id, action
    ),
    abandoned_features AS (
      SELECT 
        action,
        COUNT(*) as total_users,
        COUNT(CASE WHEN last_used < $2 - INTERVAL '30 days' THEN 1 END) as abandoned_users_30d,
        COUNT(CASE WHEN last_used < $2 - INTERVAL '60 days' THEN 1 END) as abandoned_users_60d,
        COUNT(CASE WHEN last_used < $2 - INTERVAL '90 days' THEN 1 END) as abandoned_users_90d,
        AVG(total_usage) as avg_usage_before_abandon
      FROM feature_last_usage
      WHERE last_used >= $1
      GROUP BY action
      HAVING COUNT(*) >= 10
    )
    SELECT 
      action,
      total_users,
      abandoned_users_30d,
      abandoned_users_60d,
      abandoned_users_90d,
      avg_usage_before_abandon,
      ROUND((abandoned_users_30d::float / total_users) * 100, 2) as abandonment_rate_30d,
      ROUND((abandoned_users_60d::float / total_users) * 100, 2) as abandonment_rate_60d,
      ROUND((abandoned_users_90d::float / total_users) * 100, 2) as abandonment_rate_90d
    FROM abandoned_features
    ORDER BY abandonment_rate_30d DESC;
  `;

  const result = await prisma.$queryRawUnsafe(abandonmentQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    feature: row.action,
    totalUsers: Number(row.total_users) || 0,
    abandonedUsers30d: Number(row.abandoned_users_30d) || 0,
    abandonedUsers60d: Number(row.abandoned_users_60d) || 0,
    abandonedUsers90d: Number(row.abandoned_users_90d) || 0,
    avgUsageBeforeAbandon: Number(row.avg_usage_before_abandon) || 0,
    abandonmentRate30d: Number(row.abandonment_rate_30d) || 0,
    abandonmentRate60d: Number(row.abandonment_rate_60d) || 0,
    abandonmentRate90d: Number(row.abandonment_rate_90d) || 0
  })) : [];
}

async function getSegmentedFeatureAnalysis(
  segmentBy: string,
  startDate: Date,
  endDate: Date
) {
  let joinClause = '';
  let segmentField = '';

  switch (segmentBy) {
    case 'user_type':
      segmentField = 'u.user_type';
      joinClause = 'LEFT JOIN users u ON al.user_id = u.id';
      break;
    case 'plan':
      segmentField = 's.plan';
      joinClause = 'LEFT JOIN users u ON al.user_id = u.id LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = \'active\'';
      break;
    case 'acquisition_channel':
      segmentField = 'u.acquisition_channel';
      joinClause = 'LEFT JOIN users u ON al.user_id = u.id';
      break;
    case 'company_size':
      segmentField = 'u.company_size';
      joinClause = 'LEFT JOIN users u ON al.user_id = u.id';
      break;
    case 'region':
      segmentField = 'u.country';
      joinClause = 'LEFT JOIN users u ON al.user_id = u.id';
      break;
    default:
      segmentField = "'Unknown'";
  }

  const segmentQuery = `
    SELECT 
      ${segmentField} as segment,
      al.action,
      COUNT(DISTINCT al.user_id) as unique_adopters,
      COUNT(al.id) as total_usage,
      AVG(al.success::int) as success_rate
    FROM audit_logs al
    ${joinClause}
    WHERE al.created_at >= $1 AND al.created_at <= $2
      AND al.user_id IS NOT NULL
    GROUP BY ${segmentField}, al.action
    HAVING COUNT(DISTINCT al.user_id) >= 3
    ORDER BY segment, total_usage DESC;
  `;

  const result = await prisma.$queryRawUnsafe(segmentQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    segment: row.segment || 'Unknown',
    feature: row.action,
    uniqueAdopters: Number(row.unique_adopters) || 0,
    totalUsage: Number(row.total_usage) || 0,
    successRate: Number(row.success_rate || 0) * 100
  })) : [];
}

async function getDetailedFeatureMetrics(
  startDate: Date, 
  endDate: Date,
  featureFilter?: string | null
) {
  // Get feature champions (users who drive feature adoption)
  const championsQuery = `
    WITH feature_usage_stats AS (
      SELECT 
        user_id,
        action,
        COUNT(*) as usage_count,
        MIN(created_at) as first_used,
        MAX(created_at) as last_used
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
        ${featureFilter ? 'AND action = $3' : ''}
      GROUP BY user_id, action
    ),
    feature_percentiles AS (
      SELECT 
        action,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY usage_count) as p90_usage
      FROM feature_usage_stats
      GROUP BY action
    )
    SELECT 
      fus.user_id,
      u.name,
      u.email,
      fus.action,
      fus.usage_count,
      fus.first_used,
      fus.last_used
    FROM feature_usage_stats fus
    JOIN feature_percentiles fp ON fus.action = fp.action
    JOIN users u ON fus.user_id = u.id
    WHERE fus.usage_count >= fp.p90_usage
    ORDER BY fus.action, fus.usage_count DESC;
  `;

  const championsParams = featureFilter 
    ? [startDate, endDate, featureFilter]
    : [startDate, endDate];
  
  const champions = await prisma.$queryRawUnsafe(championsQuery, ...championsParams);

  // Get underperforming features
  const underperformingQuery = `
    WITH feature_performance AS (
      SELECT 
        action,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_usage,
        AVG(success::int) as success_rate,
        COUNT(CASE WHEN created_at >= $2 - INTERVAL '7 days' THEN 1 END) as recent_usage
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY action
    ),
    usage_percentiles AS (
      SELECT 
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY unique_users) as p25_users,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY success_rate) as p25_success
      FROM feature_performance
    )
    SELECT 
      fp.action,
      fp.unique_users,
      fp.total_usage,
      fp.success_rate * 100 as success_rate_percent,
      fp.recent_usage
    FROM feature_performance fp
    CROSS JOIN usage_percentiles up
    WHERE fp.unique_users <= up.p25_users 
       OR fp.success_rate <= up.p25_success
       OR fp.recent_usage = 0
    ORDER BY fp.unique_users ASC, fp.success_rate ASC;
  `;

  const underperforming = await prisma.$queryRawUnsafe(underperformingQuery, startDate, endDate);

  return {
    featureChampions: Array.isArray(champions) ? champions.map((row: any) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      feature: row.action,
      usageCount: Number(row.usage_count) || 0,
      firstUsed: row.first_used,
      lastUsedAt: row.last_used
    })) : [],
    underperformingFeatures: Array.isArray(underperforming) ? underperforming.map((row: any) => ({
      feature: row.action,
      uniqueUsers: Number(row.unique_users) || 0,
      totalUsage: Number(row.total_usage) || 0,
      successRate: Number(row.success_rate_percent) || 0,
      recentUsage: Number(row.recent_usage) || 0
    })) : []
  };
}