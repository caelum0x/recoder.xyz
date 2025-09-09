// Feature Flag Management API - Real feature flag system for production control
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for feature flag operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

const featureFlagSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean(),
  rolloutPercentage: z.number().min(0).max(100).default(100),
  userSegments: z.array(z.string()).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateFeatureFlagSchema = featureFlagSchema.partial();

// GET - Get all feature flags with filtering and analytics
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 100, 'feature-flags-get');
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
    const includeAnalytics = searchParams.get('includeAnalytics') === 'true';
    const environment = searchParams.get('environment') || 'production';
    const enabled = searchParams.get('enabled');

    // Build where clause
    let whereClause: any = {};
    if (enabled !== null) {
      whereClause.enabled = enabled === 'true';
    }

    // Get feature flags
    const featureFlags = await prisma.featureFlag.findMany({
      where: whereClause,
      include: {
        _count: includeAnalytics ? {
          select: {
            featureFlagUsage: true
          }
        } : false
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get analytics if requested
    let analytics = null;
    if (includeAnalytics) {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      analytics = await getFeatureFlagAnalytics(last30Days, now);
    }

    return NextResponse.json({
      featureFlags: featureFlags.map(flag => ({
        ...flag,
        usageCount: flag._count?.featureFlagUsage || 0
      })),
      analytics,
      totalFlags: featureFlags.length,
      enabledFlags: featureFlags.filter(f => f.enabled).length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Feature flags fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feature flags' },
      { status: 500 }
    );
  }
}

// POST - Create new feature flag
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 20, 'feature-flags-create');
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

    const body = await request.json();
    const validatedData = featureFlagSchema.parse(body);

    // Check if feature flag name already exists
    const existingFlag = await prisma.featureFlag.findUnique({
      where: { name: validatedData.name }
    });

    if (existingFlag) {
      return NextResponse.json(
        { error: 'Feature flag with this name already exists' },
        { status: 409 }
      );
    }

    // Create feature flag
    const featureFlag = await prisma.featureFlag.create({
      data: {
        ...validatedData,
        createdBy: session.user.id,
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : null,
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
      }
    });

    // Log the creation
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'feature_flag_create',
        platform: 'admin',
        success: true,
        metadata: {
          flagId: featureFlag.id,
          flagName: featureFlag.name,
          enabled: featureFlag.enabled
        }
      }
    });

    return NextResponse.json({
      featureFlag,
      message: 'Feature flag created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Feature flag creation error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create feature flag' },
      { status: 500 }
    );
  }
}

// PUT - Update feature flag
export async function PUT(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'feature-flags-update');
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
    const flagId = searchParams.get('id');

    if (!flagId) {
      return NextResponse.json({ error: 'Feature flag ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = updateFeatureFlagSchema.parse(body);

    // Check if feature flag exists
    const existingFlag = await prisma.featureFlag.findUnique({
      where: { id: flagId }
    });

    if (!existingFlag) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }

    // Update feature flag
    const featureFlag = await prisma.featureFlag.update({
      where: { id: flagId },
      data: {
        ...validatedData,
        updatedAt: new Date(),
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : undefined,
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : undefined,
      }
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'feature_flag_update',
        platform: 'admin',
        success: true,
        metadata: {
          flagId: featureFlag.id,
          flagName: featureFlag.name,
          changes: validatedData
        }
      }
    });

    return NextResponse.json({
      featureFlag,
      message: 'Feature flag updated successfully'
    });

  } catch (error) {
    console.error('Feature flag update error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update feature flag' },
      { status: 500 }
    );
  }
}

// DELETE - Delete feature flag
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'feature-flags-delete');
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

    if (user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin access required for deletion' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const flagId = searchParams.get('id');

    if (!flagId) {
      return NextResponse.json({ error: 'Feature flag ID is required' }, { status: 400 });
    }

    // Check if feature flag exists
    const existingFlag = await prisma.featureFlag.findUnique({
      where: { id: flagId }
    });

    if (!existingFlag) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }

    // Delete feature flag (cascade delete usage records)
    await prisma.featureFlag.delete({
      where: { id: flagId }
    });

    // Log the deletion
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'feature_flag_delete',
        platform: 'admin',
        success: true,
        metadata: {
          flagId: flagId,
          flagName: existingFlag.name
        }
      }
    });

    return NextResponse.json({
      message: 'Feature flag deleted successfully'
    });

  } catch (error) {
    console.error('Feature flag deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete feature flag' },
      { status: 500 }
    );
  }
}

async function getFeatureFlagAnalytics(startDate: Date, endDate: Date) {
  // Usage analytics
  const usageAnalytics = await prisma.$queryRawUnsafe(`
    WITH daily_usage AS (
      SELECT 
        ff.name as flag_name,
        DATE_TRUNC('day', ffu.created_at) as usage_date,
        COUNT(*) as usage_count,
        COUNT(DISTINCT ffu.user_id) as unique_users
      FROM feature_flags ff
      LEFT JOIN feature_flag_usage ffu ON ff.id = ffu.feature_flag_id
      WHERE ffu.created_at >= $1 AND ffu.created_at <= $2
      GROUP BY ff.name, usage_date
    )
    SELECT 
      flag_name,
      usage_date,
      usage_count,
      unique_users
    FROM daily_usage
    ORDER BY usage_date, flag_name;
  `, startDate, endDate);

  // Rollout performance
  const rolloutPerformance = await prisma.featureFlag.findMany({
    select: {
      name: true,
      rolloutPercentage: true,
      enabled: true,
      _count: {
        select: {
          featureFlagUsage: {
            where: {
              createdAt: { gte: startDate, lte: endDate }
            }
          }
        }
      }
    }
  });

  // Most used flags
  const mostUsedFlags = await prisma.featureFlagUsage.groupBy({
    by: ['featureFlagId'],
    where: {
      createdAt: { gte: startDate, lte: endDate }
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10
  });

  const flagNames = await prisma.featureFlag.findMany({
    where: {
      id: { in: mostUsedFlags.map(f => f.featureFlagId) }
    },
    select: { id: true, name: true }
  });

  return {
    usageOverTime: Array.isArray(usageAnalytics) ? usageAnalytics.map((row: any) => ({
      flagName: row.flag_name,
      date: row.usage_date,
      usageCount: Number(row.usage_count) || 0,
      uniqueUsers: Number(row.unique_users) || 0
    })) : [],
    rolloutPerformance: rolloutPerformance.map(flag => ({
      name: flag.name,
      rolloutPercentage: flag.rolloutPercentage,
      enabled: flag.enabled,
      usageCount: flag._count.featureFlagUsage
    })),
    mostUsedFlags: mostUsedFlags.map(flag => ({
      flagId: flag.featureFlagId,
      name: flagNames.find(f => f.id === flag.featureFlagId)?.name || 'Unknown',
      usageCount: flag._count.id
    }))
  };
}