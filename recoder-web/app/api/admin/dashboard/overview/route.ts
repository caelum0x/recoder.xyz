// Admin Dashboard Overview API - Real aggregated metrics
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for dashboard overview
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

// GET - Get dashboard overview metrics
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'dashboard-overview');
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

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Get revenue metrics
    const revenueMetrics = await getRevenueMetrics(thirtyDaysAgo, now);
    
    // Get customer metrics
    const customerMetrics = await getCustomerMetrics(thirtyDaysAgo, now);
    
    // Get subscription metrics
    const subscriptionMetrics = await getSubscriptionMetrics(thirtyDaysAgo, now);
    
    // Get engagement metrics
    const engagementMetrics = await getEngagementMetrics(thirtyDaysAgo, now);
    
    // Get system metrics
    const systemMetrics = await getSystemMetrics(thirtyDaysAgo, now);

    return NextResponse.json({
      revenue: revenueMetrics,
      customers: customerMetrics,
      subscriptions: subscriptionMetrics,
      engagement: engagementMetrics,
      system: systemMetrics,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dashboard overview error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard overview' },
      { status: 500 }
    );
  }
}

async function getRevenueMetrics(startDate: Date, endDate: Date) {
  // Get current MRR
  const currentMRR = await prisma.subscription.aggregate({
    where: { status: 'active' },
    _sum: { amount: true }
  });

  // Get total revenue in period
  const totalRevenue = await prisma.payment.aggregate({
    where: {
      status: 'completed',
      createdAt: { gte: startDate, lte: endDate }
    },
    _sum: { amount: true }
  });

  // Get previous period revenue for growth calculation
  const previousPeriod = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
  const previousRevenue = await prisma.payment.aggregate({
    where: {
      status: 'completed',
      createdAt: { gte: previousPeriod, lt: startDate }
    },
    _sum: { amount: true }
  });

  const currentRevenueAmount = Number(totalRevenue._sum.amount) || 0;
  const previousRevenueAmount = Number(previousRevenue._sum.amount) || 0;
  const growth = previousRevenueAmount > 0 
    ? ((currentRevenueAmount - previousRevenueAmount) / previousRevenueAmount) * 100 
    : 0;

  return {
    totalRevenue: currentRevenueAmount,
    mrr: Number(currentMRR._sum.amount) || 0,
    arr: (Number(currentMRR._sum.amount) || 0) * 12,
    growth
  };
}

async function getCustomerMetrics(startDate: Date, endDate: Date) {
  // Total customers
  const totalCustomers = await prisma.user.count();

  // Active customers (had activity in period)
  const activeCustomers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: startDate, lte: endDate }
    }
  });

  // New customers in period
  const newCustomers = await prisma.user.count({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  // Get churn rate
  const cancelledSubscriptions = await prisma.subscription.count({
    where: {
      cancelledAt: { gte: startDate, lte: endDate }
    }
  });

  const totalActiveSubscriptions = await prisma.subscription.count({
    where: { status: 'active' }
  });

  const churnRate = totalActiveSubscriptions > 0 
    ? (cancelledSubscriptions / (totalActiveSubscriptions + cancelledSubscriptions)) * 100 
    : 0;

  // Get average LTV
  const avgLTV = await prisma.customerLifetimeValue.aggregate({
    _avg: { predictedLtv: true }
  });

  return {
    totalCustomers,
    activeCustomers,
    newCustomers,
    churnRate,
    avgLTV: avgLTV._avg.predictedLtv || 0
  };
}

async function getSubscriptionMetrics(startDate: Date, endDate: Date) {
  // Total subscriptions
  const totalSubscriptions = await prisma.subscription.count();

  // Active subscriptions
  const activeSubscriptions = await prisma.subscription.count({
    where: { status: 'active' }
  });

  // New subscriptions in period
  const newSubscriptions = await prisma.subscription.count({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  // Cancelled subscriptions in period
  const cancelledSubscriptions = await prisma.subscription.count({
    where: {
      cancelledAt: { gte: startDate, lte: endDate }
    }
  });

  const netGrowth = newSubscriptions - cancelledSubscriptions;

  return {
    totalSubscriptions,
    activeSubscriptions,
    newSubscriptions,
    cancelledSubscriptions,
    netGrowth
  };
}

async function getEngagementMetrics(startDate: Date, endDate: Date) {
  // Daily Active Users (last 24 hours)
  const yesterday = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
  const dailyActiveUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: yesterday, lte: endDate }
    }
  });

  // Monthly Active Users
  const monthlyActiveUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: startDate, lte: endDate }
    }
  });

  // Average session duration (estimated from audit logs)
  const sessionDataQuery = `
    WITH user_sessions AS (
      SELECT 
        user_id,
        DATE(created_at) as session_date,
        MIN(created_at) as session_start,
        MAX(created_at) as session_end
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY user_id, DATE(created_at)
    )
    SELECT 
      AVG(EXTRACT(EPOCH FROM (session_end - session_start))) as avg_session_duration
    FROM user_sessions
    WHERE session_end > session_start;
  `;

  const sessionData = await prisma.$queryRawUnsafe(sessionDataQuery, startDate, endDate);
  const avgSessionDuration = Array.isArray(sessionData) && sessionData[0] 
    ? Number((sessionData[0] as any).avg_session_duration) || 0
    : 0;

  // Feature adoption rate (average across all features)
  const featureAdoptionQuery = `
    WITH feature_adoption AS (
      SELECT 
        action,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
      GROUP BY action
    ),
    total_users AS (
      SELECT COUNT(DISTINCT user_id) as total_count
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND user_id IS NOT NULL
    )
    SELECT 
      AVG((fa.unique_users::float / tu.total_count) * 100) as avg_adoption_rate
    FROM feature_adoption fa
    CROSS JOIN total_users tu;
  `;

  const adoptionData = await prisma.$queryRawUnsafe(featureAdoptionQuery, startDate, endDate);
  const featureAdoptionRate = Array.isArray(adoptionData) && adoptionData[0]
    ? Number((adoptionData[0] as any).avg_adoption_rate) || 0
    : 0;

  return {
    dailyActiveUsers,
    monthlyActiveUsers,
    avgSessionDuration,
    featureAdoptionRate
  };
}

async function getSystemMetrics(startDate: Date, endDate: Date) {
  // Total users
  const totalUsers = await prisma.user.count();

  // Total projects (if you have a projects table, adjust accordingly)
  const totalProjects = await prisma.auditLog.count({
    where: {
      action: 'project_created'
    }
  });

  // API requests in period (from audit logs)
  const apiRequests = await prisma.auditLog.count({
    where: {
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  // System health calculation (based on success rate and activity)
  const systemHealthQuery = `
    SELECT 
      AVG(success::int) * 100 as success_rate,
      COUNT(*) as total_requests
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2;
  `;

  const healthData = await prisma.$queryRawUnsafe(systemHealthQuery, startDate, endDate);
  const systemHealth = Array.isArray(healthData) && healthData[0]
    ? Number((healthData[0] as any).success_rate) || 95
    : 95; // Default to 95% if no data

  return {
    totalUsers,
    totalProjects,
    apiRequests,
    systemHealth
  };
}