// User Engagement Tracking API - Real user behavior analytics and engagement metrics
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for engagement analytics operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 40,
});

const engagementAnalyticsSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  segmentBy: z.enum(['user_type', 'plan', 'acquisition_channel', 'company_size', 'region']).optional(),
  includeDetailedMetrics: z.boolean().default(true),
});

// GET - Get comprehensive user engagement analytics
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 25, 'user-engagement');
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
    const includeDetailedMetrics = searchParams.get('includeDetailedMetrics') !== 'false';
    
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');

    // Set default date range if not provided
    if (!startDate || !endDate) {
      const now = new Date();
      endDate = now.toISOString();
      
      switch (period) {
        case 'day':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
          break;
        case 'week':
          startDate = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString(); // 12 weeks
          break;
        case 'month':
          startDate = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString(); // 12 months
          break;
        case 'quarter':
          startDate = new Date(Date.now() - 8 * 90 * 24 * 60 * 60 * 1000).toISOString(); // 8 quarters
          break;
        case 'year':
          startDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString(); // 3 years
          break;
      }
    }

    // Get engagement overview
    const overview = await getEngagementOverview(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get user activity metrics
    const userActivity = await getUserActivityMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get session analytics
    const sessionAnalytics = await getSessionAnalytics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get feature usage metrics
    const featureUsage = await getFeatureUsageMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get time series engagement data
    const timeSeries = await getEngagementTimeSeries(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date(), 
      granularity as any
    );
    
    // Get user cohort analysis
    const cohortAnalysis = await getUserCohortAnalysis();
    
    // Get engagement scoring
    const engagementScoring = await getEngagementScoring(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get content engagement
    const contentEngagement = await getContentEngagementMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get retention analysis
    const retentionAnalysis = await getRetentionAnalysis();
    
    // Get segmented analysis if requested
    let segmentedAnalysis = null;
    if (segmentBy) {
      segmentedAnalysis = await getSegmentedEngagementAnalysis(
        segmentBy,
        startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate) : new Date()
      );
    }

    // Get detailed user metrics if requested
    let detailedMetrics = null;
    if (includeDetailedMetrics) {
      detailedMetrics = await getDetailedEngagementMetrics(
        startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
        endDate ? new Date(endDate) : new Date()
      );
    }

    return NextResponse.json({
      period,
      dateRange: { startDate, endDate },
      overview,
      userActivity,
      sessionAnalytics,
      featureUsage,
      timeSeries,
      cohortAnalysis,
      engagementScoring,
      contentEngagement,
      retentionAnalysis,
      segmentedAnalysis,
      detailedMetrics,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('User engagement analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user engagement analytics' },
      { status: 500 }
    );
  }
}

async function getEngagementOverview(startDate: Date, endDate: Date) {
  // Get total active users
  const totalActiveUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: startDate, lte: endDate }
    }
  });

  // Get daily active users (DAU) for the last day in range
  const yesterday = new Date(endDate);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const dailyActiveUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: yesterday, lte: endDate }
    }
  });

  // Get weekly active users (WAU)
  const weekAgo = new Date(endDate);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  const weeklyActiveUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: weekAgo, lte: endDate }
    }
  });

  // Get monthly active users (MAU)
  const monthAgo = new Date(endDate);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  
  const monthlyActiveUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: monthAgo, lte: endDate }
    }
  });

  // Calculate engagement ratios
  const dau_mau_ratio = monthlyActiveUsers > 0 ? (dailyActiveUsers / monthlyActiveUsers) * 100 : 0;
  const wau_mau_ratio = monthlyActiveUsers > 0 ? (weeklyActiveUsers / monthlyActiveUsers) * 100 : 0;

  // Get total sessions
  const totalSessions = await prisma.auditLog.count({
    where: {
      action: { in: ['login', 'session_start'] },
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  // Get new users in period
  const newUsers = await prisma.user.count({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  return {
    totalActiveUsers,
    dailyActiveUsers,
    weeklyActiveUsers,
    monthlyActiveUsers,
    dau_mau_ratio,
    wau_mau_ratio,
    totalSessions,
    newUsers,
    avgSessionsPerUser: totalActiveUsers > 0 ? totalSessions / totalActiveUsers : 0
  };
}

async function getUserActivityMetrics(startDate: Date, endDate: Date) {
  // Get user activity frequency distribution
  const userActivityQuery = `
    SELECT 
      user_id,
      COUNT(*) as total_actions,
      COUNT(DISTINCT DATE(created_at)) as active_days,
      MIN(created_at) as first_activity,
      MAX(created_at) as last_activity
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND user_id IS NOT NULL
    GROUP BY user_id;
  `;

  const activityData = await prisma.$queryRawUnsafe(userActivityQuery, startDate, endDate);
  
  if (!Array.isArray(activityData) || activityData.length === 0) {
    return {
      averageActionsPerUser: 0,
      averageActiveDaysPerUser: 0,
      activityFrequencyDistribution: [],
      mostActiveUsers: [],
      leastActiveUsers: []
    };
  }

  const activities = activityData.map((row: any) => ({
    userId: row.user_id,
    totalActions: Number(row.total_actions) || 0,
    activeDays: Number(row.active_days) || 0,
    firstActivity: row.first_activity,
    lastActivity: row.last_activity
  }));

  // Calculate averages
  const averageActionsPerUser = activities.reduce((sum, a) => sum + a.totalActions, 0) / activities.length;
  const averageActiveDaysPerUser = activities.reduce((sum, a) => sum + a.activeDays, 0) / activities.length;

  // Create frequency distribution
  const frequencyBuckets = [
    { range: '1-5', min: 1, max: 5 },
    { range: '6-20', min: 6, max: 20 },
    { range: '21-50', min: 21, max: 50 },
    { range: '51-100', min: 51, max: 100 },
    { range: '100+', min: 101, max: Infinity }
  ];

  const activityFrequencyDistribution = frequencyBuckets.map(bucket => ({
    range: `${bucket.range} actions`,
    count: activities.filter(a => a.totalActions >= bucket.min && a.totalActions <= bucket.max).length
  }));

  // Get most and least active users
  const sortedByActivity = activities.sort((a, b) => b.totalActions - a.totalActions);
  const mostActiveUsers = sortedByActivity.slice(0, 10);
  const leastActiveUsers = sortedByActivity.slice(-10).reverse();

  return {
    averageActionsPerUser,
    averageActiveDaysPerUser,
    activityFrequencyDistribution,
    mostActiveUsers,
    leastActiveUsers
  };
}

async function getSessionAnalytics(startDate: Date, endDate: Date) {
  // Get session duration data from audit logs
  const sessionDataQuery = `
    WITH user_sessions AS (
      SELECT 
        user_id,
        DATE(created_at) as session_date,
        MIN(created_at) as session_start,
        MAX(created_at) as session_end,
        COUNT(*) as actions_in_session
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY user_id, DATE(created_at)
    )
    SELECT 
      AVG(EXTRACT(EPOCH FROM (session_end - session_start))) as avg_session_duration_seconds,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (session_end - session_start))) as median_session_duration_seconds,
      AVG(actions_in_session) as avg_actions_per_session,
      COUNT(*) as total_sessions
    FROM user_sessions
    WHERE session_end > session_start;
  `;

  const sessionStats = await prisma.$queryRawUnsafe(sessionDataQuery, startDate, endDate);
  
  const stats = Array.isArray(sessionStats) && sessionStats[0] ? sessionStats[0] as any : {};

  // Get session frequency by hour of day
  const hourlySessionsQuery = `
    SELECT 
      EXTRACT(HOUR FROM created_at) as hour,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(*) as total_actions
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND user_id IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM created_at)
    ORDER BY hour;
  `;

  const hourlySessions = await prisma.$queryRawUnsafe(hourlySessionsQuery, startDate, endDate);

  // Get session frequency by day of week
  const weeklySessionsQuery = `
    SELECT 
      EXTRACT(DOW FROM created_at) as day_of_week,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(*) as total_actions
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND user_id IS NOT NULL
    GROUP BY EXTRACT(DOW FROM created_at)
    ORDER BY day_of_week;
  `;

  const weeklySessions = await prisma.$queryRawUnsafe(weeklySessionsQuery, startDate, endDate);

  return {
    avgSessionDurationMinutes: Number(stats.avg_session_duration_seconds || 0) / 60,
    medianSessionDurationMinutes: Number(stats.median_session_duration_seconds || 0) / 60,
    avgActionsPerSession: Number(stats.avg_actions_per_session || 0),
    totalSessions: Number(stats.total_sessions || 0),
    sessionsByHour: Array.isArray(hourlySessions) ? hourlySessions.map((row: any) => ({
      hour: Number(row.hour),
      uniqueUsers: Number(row.unique_users || 0),
      totalActions: Number(row.total_actions || 0)
    })) : [],
    sessionsByDayOfWeek: Array.isArray(weeklySessions) ? weeklySessions.map((row: any) => ({
      dayOfWeek: Number(row.day_of_week),
      uniqueUsers: Number(row.unique_users || 0),
      totalActions: Number(row.total_actions || 0)
    })) : []
  };
}

async function getFeatureUsageMetrics(startDate: Date, endDate: Date) {
  // Get feature usage from audit logs
  const featureUsageQuery = `
    SELECT 
      action,
      platform,
      COUNT(*) as usage_count,
      COUNT(DISTINCT user_id) as unique_users,
      AVG(success::int) as success_rate
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND user_id IS NOT NULL
    GROUP BY action, platform
    ORDER BY usage_count DESC;
  `;

  const featureUsage = await prisma.$queryRawUnsafe(featureUsageQuery, startDate, endDate);
  
  const features = Array.isArray(featureUsage) ? featureUsage.map((row: any) => ({
    action: row.action,
    platform: row.platform || 'unknown',
    usageCount: Number(row.usage_count) || 0,
    uniqueUsers: Number(row.unique_users) || 0,
    successRate: Number(row.success_rate || 0) * 100
  })) : [];

  // Group by platform
  const platformUsage = features.reduce((acc, feature) => {
    if (!acc[feature.platform]) {
      acc[feature.platform] = {
        platform: feature.platform,
        totalUsage: 0,
        uniqueUsers: new Set()
      };
    }
    acc[feature.platform].totalUsage += feature.usageCount;
    // Note: This isn't perfectly accurate for unique users across features, but gives an approximation
    return acc;
  }, {} as Record<string, any>);

  // Get top features
  const topFeatures = features.slice(0, 20);

  // Get feature adoption rates (users who used feature / total active users)
  const totalActiveUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: startDate, lte: endDate }
    }
  });

  const featuresWithAdoption = topFeatures.map(feature => ({
    ...feature,
    adoptionRate: totalActiveUsers > 0 ? (feature.uniqueUsers / totalActiveUsers) * 100 : 0
  }));

  return {
    topFeatures: featuresWithAdoption,
    platformUsage: Object.values(platformUsage),
    totalFeatureInteractions: features.reduce((sum, f) => sum + f.usageCount, 0),
    averageSuccessRate: features.length > 0 
      ? features.reduce((sum, f) => sum + f.successRate, 0) / features.length 
      : 0
  };
}

async function getEngagementTimeSeries(startDate: Date, endDate: Date, granularity: 'hour' | 'day' | 'week' | 'month') {
  const timeSeriesQuery = `
    SELECT 
      DATE_TRUNC('${granularity}', created_at) as period,
      COUNT(DISTINCT user_id) as active_users,
      COUNT(*) as total_actions,
      COUNT(DISTINCT CASE WHEN action = 'login' THEN user_id END) as logins,
      AVG(success::int) as success_rate
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND user_id IS NOT NULL
    GROUP BY period
    ORDER BY period;
  `;

  const result = await prisma.$queryRawUnsafe(timeSeriesQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    period: row.period,
    activeUsers: Number(row.active_users) || 0,
    totalActions: Number(row.total_actions) || 0,
    logins: Number(row.logins) || 0,
    successRate: Number(row.success_rate || 0) * 100,
    actionsPerUser: Number(row.active_users) > 0 ? Number(row.total_actions) / Number(row.active_users) : 0
  })) : [];
}

async function getUserCohortAnalysis() {
  // Analyze user engagement by signup cohort
  const cohortQuery = `
    WITH user_cohorts AS (
      SELECT 
        id as user_id,
        DATE_TRUNC('month', created_at) as cohort_month,
        created_at as signup_date
      FROM users
      WHERE created_at >= $1
    ),
    cohort_activity AS (
      SELECT 
        uc.cohort_month,
        uc.user_id,
        COUNT(al.id) as total_actions,
        COUNT(DISTINCT DATE(al.created_at)) as active_days,
        MAX(al.created_at) as last_activity
      FROM user_cohorts uc
      LEFT JOIN audit_logs al ON uc.user_id = al.user_id
      GROUP BY uc.cohort_month, uc.user_id
    )
    SELECT 
      cohort_month,
      COUNT(*) as cohort_size,
      COUNT(CASE WHEN total_actions > 0 THEN 1 END) as active_users,
      AVG(total_actions) as avg_actions_per_user,
      AVG(active_days) as avg_active_days,
      COUNT(CASE WHEN total_actions >= 10 THEN 1 END) as highly_engaged_users,
      COUNT(CASE WHEN last_activity >= NOW() - INTERVAL '7 days' THEN 1 END) as recently_active
    FROM cohort_activity
    GROUP BY cohort_month
    ORDER BY cohort_month DESC;
  `;

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2); // Last 2 years

  const result = await prisma.$queryRawUnsafe(cohortQuery, cutoffDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    cohortMonth: row.cohort_month,
    cohortSize: Number(row.cohort_size) || 0,
    activeUsers: Number(row.active_users) || 0,
    activationRate: Number(row.cohort_size) > 0 
      ? (Number(row.active_users) / Number(row.cohort_size)) * 100 
      : 0,
    avgActionsPerUser: Number(row.avg_actions_per_user || 0),
    avgActiveDays: Number(row.avg_active_days || 0),
    highlyEngagedUsers: Number(row.highly_engaged_users) || 0,
    recentlyActive: Number(row.recently_active) || 0
  })) : [];
}

async function getEngagementScoring(startDate: Date, endDate: Date) {
  // Calculate engagement scores based on multiple factors
  const engagementScoreQuery = `
    WITH user_engagement_scores AS (
      SELECT 
        u.id as user_id,
        u.name,
        u.email,
        u.created_at as signup_date,
        COUNT(al.id) as total_actions,
        COUNT(DISTINCT DATE(al.created_at)) as active_days,
        COUNT(DISTINCT al.action) as unique_features_used,
        AVG(al.success::int) as success_rate,
        MAX(al.created_at) as last_activity,
        CASE 
          WHEN MAX(al.created_at) >= NOW() - INTERVAL '1 day' THEN 3
          WHEN MAX(al.created_at) >= NOW() - INTERVAL '7 days' THEN 2
          WHEN MAX(al.created_at) >= NOW() - INTERVAL '30 days' THEN 1
          ELSE 0
        END as recency_score,
        CASE 
          WHEN COUNT(DISTINCT DATE(al.created_at)) >= 20 THEN 3
          WHEN COUNT(DISTINCT DATE(al.created_at)) >= 10 THEN 2
          WHEN COUNT(DISTINCT DATE(al.created_at)) >= 5 THEN 1
          ELSE 0
        END as frequency_score,
        CASE 
          WHEN COUNT(DISTINCT al.action) >= 10 THEN 3
          WHEN COUNT(DISTINCT al.action) >= 5 THEN 2
          WHEN COUNT(DISTINCT al.action) >= 2 THEN 1
          ELSE 0
        END as variety_score
      FROM users u
      LEFT JOIN audit_logs al ON u.id = al.user_id 
        AND al.created_at >= $1 AND al.created_at <= $2
      WHERE u.created_at <= $2
      GROUP BY u.id, u.name, u.email, u.created_at
    )
    SELECT 
      user_id,
      name,
      email,
      signup_date,
      total_actions,
      active_days,
      unique_features_used,
      success_rate * 100 as success_rate_percent,
      last_activity,
      recency_score + frequency_score + variety_score as engagement_score,
      recency_score,
      frequency_score,
      variety_score,
      CASE 
        WHEN recency_score + frequency_score + variety_score >= 7 THEN 'High'
        WHEN recency_score + frequency_score + variety_score >= 4 THEN 'Medium'
        WHEN recency_score + frequency_score + variety_score >= 1 THEN 'Low'
        ELSE 'Inactive'
      END as engagement_level
    FROM user_engagement_scores
    ORDER BY engagement_score DESC;
  `;

  const result = await prisma.$queryRawUnsafe(engagementScoreQuery, startDate, endDate);
  
  const scores = Array.isArray(result) ? result.map((row: any) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    signupDate: row.signup_date,
    totalActions: Number(row.total_actions) || 0,
    activeDays: Number(row.active_days) || 0,
    uniqueFeaturesUsed: Number(row.unique_features_used) || 0,
    successRate: Number(row.success_rate_percent || 0),
    lastActivity: row.last_activity,
    engagementScore: Number(row.engagement_score) || 0,
    engagementLevel: row.engagement_level || 'Inactive'
  })) : [];

  // Calculate distribution
  const distribution = scores.reduce((acc, score) => {
    acc[score.engagementLevel] = (acc[score.engagementLevel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    userScores: scores,
    distribution: Object.entries(distribution).map(([level, count]) => ({
      level,
      count
    })),
    averageScore: scores.length > 0 
      ? scores.reduce((sum, s) => sum + s.engagementScore, 0) / scores.length 
      : 0
  };
}

async function getContentEngagementMetrics(startDate: Date, endDate: Date) {
  // Analyze engagement with different content types/features
  const contentEngagementQuery = `
    SELECT 
      action,
      COUNT(*) as total_interactions,
      COUNT(DISTINCT user_id) as unique_users,
      AVG(success::int) as success_rate,
      COUNT(CASE WHEN success THEN 1 END) as successful_interactions
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND user_id IS NOT NULL
      AND action IN ('project_created', 'code_generated', 'chat_message', 'file_uploaded', 'export_data')
    GROUP BY action
    ORDER BY total_interactions DESC;
  `;

  const result = await prisma.$queryRawUnsafe(contentEngagementQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    contentType: row.action,
    totalInteractions: Number(row.total_interactions) || 0,
    uniqueUsers: Number(row.unique_users) || 0,
    successRate: Number(row.success_rate || 0) * 100,
    successfulInteractions: Number(row.successful_interactions) || 0
  })) : [];
}

async function getRetentionAnalysis() {
  // Analyze user retention patterns
  const retentionQuery = `
    WITH user_activity AS (
      SELECT 
        user_id,
        DATE_TRUNC('week', created_at) as activity_week,
        MIN(created_at) as first_activity_in_week
      FROM audit_logs
      WHERE user_id IS NOT NULL
        AND created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY user_id, DATE_TRUNC('week', created_at)
    ),
    user_first_week AS (
      SELECT 
        user_id,
        MIN(activity_week) as first_week
      FROM user_activity
      GROUP BY user_id
    ),
    retention_data AS (
      SELECT 
        ufw.first_week,
        ua.user_id,
        EXTRACT(WEEK FROM ua.activity_week - ufw.first_week) as weeks_since_first
      FROM user_first_week ufw
      JOIN user_activity ua ON ufw.user_id = ua.user_id
    )
    SELECT 
      first_week,
      COUNT(DISTINCT CASE WHEN weeks_since_first = 0 THEN user_id END) as week_0_users,
      COUNT(DISTINCT CASE WHEN weeks_since_first = 1 THEN user_id END) as week_1_retained,
      COUNT(DISTINCT CASE WHEN weeks_since_first = 2 THEN user_id END) as week_2_retained,
      COUNT(DISTINCT CASE WHEN weeks_since_first = 4 THEN user_id END) as week_4_retained,
      COUNT(DISTINCT CASE WHEN weeks_since_first = 8 THEN user_id END) as week_8_retained
    FROM retention_data
    GROUP BY first_week
    HAVING COUNT(DISTINCT CASE WHEN weeks_since_first = 0 THEN user_id END) >= 10
    ORDER BY first_week DESC;
  `;

  const result = await prisma.$queryRawUnsafe(retentionQuery);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    firstWeek: row.first_week,
    cohortSize: Number(row.week_0_users) || 0,
    week1Retained: Number(row.week_1_retained) || 0,
    week2Retained: Number(row.week_2_retained) || 0,
    week4Retained: Number(row.week_4_retained) || 0,
    week8Retained: Number(row.week_8_retained) || 0,
    week1RetentionRate: Number(row.week_0_users) > 0 
      ? (Number(row.week_1_retained) / Number(row.week_0_users)) * 100 
      : 0,
    week2RetentionRate: Number(row.week_0_users) > 0 
      ? (Number(row.week_2_retained) / Number(row.week_0_users)) * 100 
      : 0,
    week4RetentionRate: Number(row.week_0_users) > 0 
      ? (Number(row.week_4_retained) / Number(row.week_0_users)) * 100 
      : 0,
    week8RetentionRate: Number(row.week_0_users) > 0 
      ? (Number(row.week_8_retained) / Number(row.week_0_users)) * 100 
      : 0
  })) : [];
}

async function getSegmentedEngagementAnalysis(
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
      COUNT(DISTINCT al.user_id) as unique_users,
      COUNT(al.id) as total_actions,
      AVG(al.success::int) as success_rate,
      COUNT(DISTINCT al.action) as unique_features_used,
      COUNT(DISTINCT DATE(al.created_at)) as total_active_days
    FROM audit_logs al
    ${joinClause}
    WHERE al.created_at >= $1 AND al.created_at <= $2
      AND al.user_id IS NOT NULL
    GROUP BY ${segmentField}
    HAVING COUNT(DISTINCT al.user_id) >= 5
    ORDER BY total_actions DESC;
  `;

  const result = await prisma.$queryRawUnsafe(segmentQuery, startDate, endDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    segment: row.segment || 'Unknown',
    uniqueUsers: Number(row.unique_users) || 0,
    totalActions: Number(row.total_actions) || 0,
    successRate: Number(row.success_rate || 0) * 100,
    uniqueFeaturesUsed: Number(row.unique_features_used) || 0,
    totalActiveDays: Number(row.total_active_days) || 0,
    actionsPerUser: Number(row.unique_users) > 0 
      ? Number(row.total_actions) / Number(row.unique_users) 
      : 0
  })) : [];
}

async function getDetailedEngagementMetrics(startDate: Date, endDate: Date) {
  // Get power users (top 10% by activity)
  const powerUsersQuery = `
    WITH user_activity_stats AS (
      SELECT 
        user_id,
        COUNT(*) as total_actions,
        COUNT(DISTINCT action) as unique_actions,
        COUNT(DISTINCT DATE(created_at)) as active_days
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY user_id
    ),
    activity_percentiles AS (
      SELECT 
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_actions) as p90_actions
      FROM user_activity_stats
    )
    SELECT 
      uas.user_id,
      u.name,
      u.email,
      uas.total_actions,
      uas.unique_actions,
      uas.active_days
    FROM user_activity_stats uas
    JOIN users u ON uas.user_id = u.id
    CROSS JOIN activity_percentiles ap
    WHERE uas.total_actions >= ap.p90_actions
    ORDER BY uas.total_actions DESC
    LIMIT 50;
  `;

  const powerUsers = await prisma.$queryRawUnsafe(powerUsersQuery, startDate, endDate);

  // Get at-risk users (had activity but declining)
  const atRiskUsersQuery = `
    WITH recent_activity AS (
      SELECT 
        user_id,
        COUNT(*) as recent_actions
      FROM audit_logs
      WHERE created_at >= $2 - INTERVAL '7 days' AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY user_id
    ),
    previous_activity AS (
      SELECT 
        user_id,
        COUNT(*) as previous_actions
      FROM audit_logs
      WHERE created_at >= $2 - INTERVAL '14 days' AND created_at < $2 - INTERVAL '7 days'
        AND user_id IS NOT NULL
      GROUP BY user_id
    )
    SELECT 
      u.id as user_id,
      u.name,
      u.email,
      COALESCE(ra.recent_actions, 0) as recent_actions,
      COALESCE(pa.previous_actions, 0) as previous_actions,
      CASE 
        WHEN pa.previous_actions > 0 THEN 
          ((COALESCE(ra.recent_actions, 0) - pa.previous_actions)::float / pa.previous_actions) * 100
        ELSE 0
      END as activity_change_percent
    FROM users u
    LEFT JOIN recent_activity ra ON u.id = ra.user_id
    LEFT JOIN previous_activity pa ON u.id = pa.user_id
    WHERE pa.previous_actions >= 5
      AND (ra.recent_actions IS NULL OR ra.recent_actions < pa.previous_actions * 0.5)
    ORDER BY pa.previous_actions DESC
    LIMIT 50;
  `;

  const atRiskUsers = await prisma.$queryRawUnsafe(atRiskUsersQuery, startDate, endDate);

  return {
    powerUsers: Array.isArray(powerUsers) ? powerUsers.map((row: any) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      totalActions: Number(row.total_actions) || 0,
      uniqueActions: Number(row.unique_actions) || 0,
      activeDays: Number(row.active_days) || 0
    })) : [],
    atRiskUsers: Array.isArray(atRiskUsers) ? atRiskUsers.map((row: any) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      recentActions: Number(row.recent_actions) || 0,
      previousActions: Number(row.previous_actions) || 0,
      activityChangePercent: Number(row.activity_change_percent || 0)
    })) : []
  };
}