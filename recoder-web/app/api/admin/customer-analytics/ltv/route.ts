// Customer Lifetime Value Analysis API - Real implementation with predictive analytics
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '../../../../../lib/database';
import { z } from 'zod';
import rateLimit from '../../../../../lib/rate-limit';

// Rate limiting for LTV analysis operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 30,
});

const ltvAnalysisSchema = z.object({
  period: z.enum(['month', 'quarter', 'year']).default('month'),
  cohortPeriods: z.number().min(1).max(36).default(12), // Number of periods to analyze
  segmentBy: z.enum(['plan', 'acquisition_channel', 'company_size', 'industry', 'region']).optional(),
  includeChurnPrediction: z.boolean().default(true),
  recalculate: z.boolean().default(false)
});

// GET - Get customer lifetime value analysis
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 20, 'ltv-analysis');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, id: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const cohortPeriods = parseInt(searchParams.get('cohortPeriods') || '12');
    const segmentBy = searchParams.get('segmentBy');
    const includeChurnPrediction = searchParams.get('includeChurnPrediction') !== 'false';
    const recalculate = searchParams.get('recalculate') === 'true';

    // Get or calculate LTV data
    const ltvAnalysis = await getLTVAnalysis({
      period: period as any,
      cohortPeriods,
      segmentBy: segmentBy as any,
      includeChurnPrediction,
      recalculate
    });

    // Get customer segmentation analysis
    const segmentationAnalysis = await getCustomerSegmentation();

    // Get churn prediction analysis
    const churnAnalysis = includeChurnPrediction ? await getChurnPredictionAnalysis() : null;

    // Get LTV trends and forecasts
    const ltvTrends = await getLTVTrends(period as any);

    return NextResponse.json({
      period,
      cohortPeriods,
      analysis: ltvAnalysis,
      segmentation: segmentationAnalysis,
      churnPrediction: churnAnalysis,
      trends: ltvTrends,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('LTV analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch LTV analysis' },
      { status: 500 }
    );
  }
}

// POST - Recalculate LTV for all customers or specific segments
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { role: true, id: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { userIds, segmentFilter } = body;

    // Start LTV recalculation job
    const jobId = await startLTVRecalculationJob(userIds, segmentFilter);

    // Log the recalculation
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ltv_recalculation_started',
        resource: 'customer_lifetime_value',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          jobId,
          userCount: userIds?.length,
          segmentFilter
        }
      }
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'LTV recalculation job started',
      estimatedCompletionTime: '5-10 minutes'
    }, { status: 202 });

  } catch (error) {
    console.error('LTV recalculation error:', error);
    return NextResponse.json(
      { error: 'Failed to start LTV recalculation' },
      { status: 500 }
    );
  }
}

interface LTVAnalysisParams {
  period: 'month' | 'quarter' | 'year';
  cohortPeriods: number;
  segmentBy?: string;
  includeChurnPrediction: boolean;
  recalculate: boolean;
}

async function getLTVAnalysis(params: LTVAnalysisParams) {
  const { period, cohortPeriods, segmentBy, recalculate } = params;

  // Check if we need to recalculate or if we have fresh data
  if (recalculate || await needsLTVRecalculation()) {
    await calculateLTVForAllCustomers();
  }

  // Get average LTV metrics
  const avgLTVMetrics = await prisma.customerLifetimeValue.aggregate({
    where: {
      lastCalculatedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }
    },
    _avg: {
      totalRevenue: true,
      predictedLtv: true,
      averageMonthlyRevenue: true,
      churnProbability: true
    },
    _count: {
      id: true
    }
  });

  // Get LTV distribution
  const ltvDistribution = await getLTVDistribution();

  // Get cohort-based LTV analysis
  const cohortLTVAnalysis = await getCohortLTVAnalysis(period, cohortPeriods);

  // Get segmented analysis if requested
  let segmentedAnalysis = null;
  if (segmentBy) {
    segmentedAnalysis = await getSegmentedLTVAnalysis(segmentBy);
  }

  // Get top customers by LTV
  const topCustomers = await getTopCustomersByLTV(50);

  return {
    summary: {
      averageLTV: avgLTVMetrics._avg?.predictedLtv || 0,
      averageHistoricalLTV: avgLTVMetrics._avg?.totalRevenue || 0,
      averageMonthlyRevenue: avgLTVMetrics._avg?.averageMonthlyRevenue || 0,
      averageChurnProbability: avgLTVMetrics._avg?.churnProbability || 0,
      totalCustomersAnalyzed: (avgLTVMetrics._count as any)?._all || 0
    },
    distribution: ltvDistribution,
    cohortAnalysis: cohortLTVAnalysis,
    segmentedAnalysis,
    topCustomers
  };
}

async function needsLTVRecalculation(): Promise<boolean> {
  const lastCalculation = await prisma.customerLifetimeValue.findFirst({
    orderBy: { lastCalculatedAt: 'desc' },
    select: { lastCalculatedAt: true }
  });

  if (!lastCalculation) return true;

  // Recalculate if last calculation was more than 24 hours ago
  const hoursSinceLastCalculation = (Date.now() - lastCalculation.lastCalculatedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceLastCalculation > 24;
}

async function calculateLTVForAllCustomers() {
  // Get all users with payment history
  const usersWithPayments = await prisma.user.findMany({
    where: {
      payments: {
        some: {
          status: 'completed'
        }
      }
    },
    include: {
      payments: {
        where: { status: 'completed' },
        orderBy: { createdAt: 'asc' }
      },
      subscriptions: {
        
      }
    }
  });

  // Calculate LTV for each customer
  for (const user of usersWithPayments) {
    const ltv = await calculateCustomerLTV(user);
    
    await prisma.customerLifetimeValue.upsert({
      where: { userId: user.id },
      update: ltv,
      create: {
        userId: user.id,
        ...ltv
      }
    });
  }
}

async function calculateCustomerLTV(user: any) {
  const payments = user.payments;
  const subscriptions = user.subscriptions;

  if (payments.length === 0) {
    return {
      cohortMonth: `${user.createdAt.getFullYear()}-${String(user.createdAt.getMonth() + 1).padStart(2, '0')}`,
      totalRevenue: 0,
      monthsActive: 0,
      averageMonthlyRevenue: 0,
      predictedLtv: 0,
      churnProbability: 0.5,
      segments: [],
      subscriptionStart: user.createdAt,
      totalMonths: 0,
      lastCalculatedAt: new Date()
    };
  }

  // Calculate actual metrics
  const totalRevenue = payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
  const firstPayment = payments[0];
  const lastPayment = payments[payments.length - 1];
  
  const monthsActive = Math.max(1, Math.ceil((lastPayment.createdAt.getTime() - firstPayment.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  const averageMonthlyRevenue = totalRevenue / monthsActive;

  // Predict future LTV using simplified model
  const activeSubscription = subscriptions.find((s: any) => s.status === 'active');
  const monthlyRevenue = activeSubscription ? activeSubscription.amount : averageMonthlyRevenue;
  
  // Simple churn probability model based on recent activity
  const daysSinceLastPayment = (Date.now() - lastPayment.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const churnProbability = Math.min(0.9, Math.max(0.1, daysSinceLastPayment / 365)); // Higher probability with longer inactivity

  // Predicted LTV = Monthly Revenue * (1 / Churn Rate) * Average Customer Lifespan
  const averageLifespanMonths = 24; // 2 years average
  const predictedLtv = monthlyRevenue * averageLifespanMonths * (1 - churnProbability);

  // Determine customer segments
  const segments = [];
  if (totalRevenue > 1000) segments.push('high_value');
  if (churnProbability > 0.7) segments.push('at_risk');
  if (monthsActive > 12) segments.push('loyal');
  if (activeSubscription?.plan === 'enterprise') segments.push('enterprise');

  return {
    cohortMonth: `${user.createdAt.getFullYear()}-${String(user.createdAt.getMonth() + 1).padStart(2, '0')}`,
    totalRevenue,
    monthsActive,
    averageMonthlyRevenue,
    predictedLtv,
    churnProbability,
    segments,
    subscriptionStart: firstPayment.createdAt,
    totalMonths: monthsActive,
    lastCalculatedAt: new Date()
  };
}

async function getLTVDistribution() {
  // Get LTV distribution in buckets
  const ltvRanges = [
    { min: 0, max: 100, label: '$0-$100' },
    { min: 100, max: 500, label: '$100-$500' },
    { min: 500, max: 1000, label: '$500-$1K' },
    { min: 1000, max: 2500, label: '$1K-$2.5K' },
    { min: 2500, max: 5000, label: '$2.5K-$5K' },
    { min: 5000, max: 10000, label: '$5K-$10K' },
    { min: 10000, max: Infinity, label: '$10K+' }
  ];

  const distribution = [];
  
  for (const range of ltvRanges) {
    const count = await prisma.customerLifetimeValue.count({
      where: {
        predictedLtv: {
          gte: range.min,
          ...(range.max !== Infinity && { lt: range.max })
        }
      }
    });

    const totalRevenue = await prisma.customerLifetimeValue.aggregate({
      where: {
        predictedLtv: {
          gte: range.min,
          ...(range.max !== Infinity && { lt: range.max })
        }
      },
      _sum: {
        totalRevenue: true
      }
    });

    distribution.push({
      range: range.label,
      count,
      totalRevenue: totalRevenue._sum.totalRevenue || 0,
      percentage: 0 // Will be calculated after getting total count
    });
  }

  // Calculate percentages
  const totalCustomers = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  distribution.forEach(bucket => {
    bucket.percentage = totalCustomers > 0 ? (bucket.count / totalCustomers) * 100 : 0;
  });

  return distribution;
}

async function getCohortLTVAnalysis(period: string, cohortPeriods: number) {
  // Get cohort LTV data
  const cohortQuery = `
    SELECT 
      DATE_TRUNC('${period}', cohort_month) as cohort_period,
      COUNT(*) as cohort_size,
      AVG(total_revenue) as avg_historical_ltv,
      AVG(predicted_ltv) as avg_predicted_ltv,
      AVG(average_monthly_revenue) as avg_monthly_revenue,
      AVG(months_active) as avg_months_active,
      AVG(churn_probability) as avg_churn_probability,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY predicted_ltv) as median_ltv,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY predicted_ltv) as p25_ltv,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY predicted_ltv) as p75_ltv
    FROM customer_lifetime_values
    WHERE cohort_month >= $1
    GROUP BY cohort_period
    ORDER BY cohort_period DESC
    LIMIT $2;
  `;

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - cohortPeriods);

  const result = await prisma.$queryRawUnsafe(cohortQuery, cutoffDate, cohortPeriods);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    cohortPeriod: row.cohort_period,
    cohortSize: Number(row.cohort_size) || 0,
    avgHistoricalLTV: Number(row.avg_historical_ltv) || 0,
    avgPredictedLTV: Number(row.avg_predicted_ltv) || 0,
    avgMonthlyRevenue: Number(row.avg_monthly_revenue) || 0,
    avgMonthsActive: Number(row.avg_months_active) || 0,
    avgChurnProbability: Number(row.avg_churn_probability) || 0,
    medianLTV: Number(row.median_ltv) || 0,
    p25LTV: Number(row.p25_ltv) || 0,
    p75LTV: Number(row.p75_ltv) || 0
  })) : [];
}

async function getSegmentedLTVAnalysis(segmentBy: string) {
  let segmentField: string;
  let joinClause = '';

  switch (segmentBy) {
    case 'plan':
      segmentField = 's.plan';
      joinClause = 'LEFT JOIN subscriptions s ON ltv.user_id = s.user_id AND s.status = \'active\'';
      break;
    case 'acquisition_channel':
      segmentField = 'u.acquisition_channel';
      joinClause = 'LEFT JOIN users u ON ltv.user_id = u.id';
      break;
    case 'company_size':
      segmentField = 'u.company_size';
      joinClause = 'LEFT JOIN users u ON ltv.user_id = u.id';
      break;
    case 'industry':
      segmentField = 'u.industry';
      joinClause = 'LEFT JOIN users u ON ltv.user_id = u.id';
      break;
    case 'region':
      segmentField = 'u.country';
      joinClause = 'LEFT JOIN users u ON ltv.user_id = u.id';
      break;
    default:
      segmentField = '\'Unknown\'';
  }

  const segmentQuery = `
    SELECT 
      ${segmentField} as segment,
      COUNT(*) as customer_count,
      AVG(ltv.total_revenue) as avg_historical_ltv,
      AVG(ltv.predicted_ltv) as avg_predicted_ltv,
      AVG(ltv.average_monthly_revenue) as avg_monthly_revenue,
      AVG(ltv.churn_probability) as avg_churn_probability,
      SUM(ltv.total_revenue) as total_revenue,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ltv.predicted_ltv) as median_ltv
    FROM customer_lifetime_values ltv
    ${joinClause}
    GROUP BY ${segmentField}
    HAVING COUNT(*) >= 5
    ORDER BY avg_predicted_ltv DESC;
  `;

  const result = await prisma.$queryRawUnsafe(segmentQuery);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    segment: row.segment || 'Unknown',
    customerCount: Number(row.customer_count) || 0,
    avgHistoricalLTV: Number(row.avg_historical_ltv) || 0,
    avgPredictedLTV: Number(row.avg_predicted_ltv) || 0,
    avgMonthlyRevenue: Number(row.avg_monthly_revenue) || 0,
    avgChurnProbability: Number(row.avg_churn_probability) || 0,
    totalRevenue: Number(row.total_revenue) || 0,
    medianLTV: Number(row.median_ltv) || 0
  })) : [];
}

async function getTopCustomersByLTV(limit: number) {
  return await prisma.customerLifetimeValue.findMany({
    take: limit,
    orderBy: { predictedLtv: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          subscriptions: {
            where: { status: 'active' },
            select: { planId: true, amount: true }
          }
        }
      }
    }
  });
}

async function getCustomerSegmentation() {
  const segmentationQuery = `
    SELECT 
      UNNEST(segments) as segment,
      COUNT(*) as customer_count,
      AVG(predicted_ltv) as avg_ltv,
      SUM(total_revenue) as total_revenue
    FROM customer_lifetime_values
    WHERE segments IS NOT NULL AND array_length(segments, 1) > 0
    GROUP BY segment
    ORDER BY customer_count DESC;
  `;

  const result = await prisma.$queryRawUnsafe(segmentationQuery);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    segment: row.segment,
    customerCount: Number(row.customer_count) || 0,
    avgLTV: Number(row.avg_ltv) || 0,
    totalRevenue: Number(row.total_revenue) || 0
  })) : [];
}

async function getChurnPredictionAnalysis() {
  // Get customers at risk of churning
  const atRiskCustomers = await prisma.customerLifetimeValue.findMany({
    where: {
      churnProbability: {
        gte: 0.7 // High churn risk
      }
    },
    orderBy: {
      predictedLtv: 'desc' // Prioritize high-value at-risk customers
    },
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          lastLoginAt: true,
          subscriptions: {
            where: { status: 'active' },
            select: { planId: true, amount: true }
          }
        }
      }
    }
  });

  // Churn probability distribution  
  const lowRiskCount = await prisma.customerLifetimeValue.count({
    where: {
      churnProbability: { gte: 0, lte: 0.3 }
    }
  });

  const mediumRiskCount = await prisma.customerLifetimeValue.count({
    where: {
      churnProbability: { gte: 0.3, lte: 0.7 }
    }
  });

  const highRiskCount = await prisma.customerLifetimeValue.count({
    where: {
      churnProbability: { gte: 0.7 }
    }
  });

  return {
    atRiskCustomers: atRiskCustomers.slice(0, 20), // Top 20 at-risk high-value customers
    churnDistribution: [
      { risk: 'Low', count: lowRiskCount, percentage: 0 },
      { risk: 'Medium', count: mediumRiskCount, percentage: 0 },
      { risk: 'High', count: highRiskCount, percentage: 0 }
    ],
    totalAtRisk: highRiskCount,
    potentialRevenueAtRisk: atRiskCustomers.reduce((sum, customer) => sum + Number(customer.predictedLtv), 0)
  };
}

async function getLTVTrends(period: string) {
  // Get LTV trends over time
  const trendsQuery = `
    SELECT 
      DATE_TRUNC('${period}', cohort_month) as period,
      AVG(predicted_ltv) as avg_ltv,
      COUNT(*) as customer_count,
      AVG(churn_probability) as avg_churn_probability
    FROM customer_lifetime_values
    WHERE cohort_month >= $1
    GROUP BY period
    ORDER BY period;
  `;

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2); // Last 2 years

  const result = await prisma.$queryRawUnsafe(trendsQuery, cutoffDate);
  
  return Array.isArray(result) ? result.map((row: any) => ({
    period: row.period,
    avgLTV: Number(row.avg_ltv) || 0,
    customerCount: Number(row.customer_count) || 0,
    avgChurnProbability: Number(row.avg_churn_probability) || 0
  })) : [];
}

async function startLTVRecalculationJob(userIds?: string[], segmentFilter?: any) {
  // In a production system, this would start a background job
  // For now, we'll simulate it and return a job ID
  const jobId = `ltv_recalc_${Date.now()}`;
  
  // Start background calculation (would use a job queue in production)
  setTimeout(async () => {
    try {
      if (userIds && userIds.length > 0) {
        // Recalculate for specific users
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          include: {
            payments: { where: { status: 'completed' } },
            subscriptions: true
          }
        });

        for (const user of users) {
          const ltv = await calculateCustomerLTV(user);
          await prisma.customerLifetimeValue.upsert({
            where: { userId: user.id },
            update: ltv,
            create: { userId: user.id, ...ltv }
          });
        }
      } else {
        // Recalculate for all customers
        await calculateLTVForAllCustomers();
      }
    } catch (error) {
      console.error('LTV recalculation job failed:', error);
    }
  }, 1000);

  return jobId;
}