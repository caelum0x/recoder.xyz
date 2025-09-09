// Advanced filtering API for analytics data
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for filter operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

// Filter schema for advanced querying
const filterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'startsWith', 'endsWith', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'between']),
    value: z.any(),
    logicalOperator: z.enum(['AND', 'OR']).optional(),
  })),
  dateRange: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    preset: z.enum(['today', 'yesterday', 'last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisYear', 'custom']).optional(),
  }).optional(),
  groupBy: z.array(z.string()).optional(),
  orderBy: z.array(z.object({
    field: z.string(),
    direction: z.enum(['asc', 'desc']).default('desc'),
  })).optional(),
  limit: z.number().min(1).max(1000).default(100),
  tags: z.array(z.string()).optional(),
});

const applyFilterSchema = z.object({
  filterId: z.string().optional(),
  dataSource: z.enum(['projects', 'usage', 'deployments', 'analytics', 'users']),
  filters: filterSchema.optional(),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(1000).default(20),
  }).optional(),
});

// Helper function to build date range conditions
function buildDateRangeCondition(dateRange: any) {
  if (!dateRange) return {};

  const now = new Date();
  let start: Date, end: Date;

  switch (dateRange.preset) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'yesterday':
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'last7days':
      end = now;
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last30days':
      end = now;
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'last90days':
      end = now;
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'lastMonth':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'thisYear':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 0);
      break;
    case 'custom':
      start = dateRange.start ? new Date(dateRange.start) : new Date(0);
      end = dateRange.end ? new Date(dateRange.end) : now;
      break;
    default:
      return {};
  }

  return {
    createdAt: {
      gte: start,
      lte: end,
    },
  };
}

// Helper function to build filter conditions
function buildFilterConditions(conditions: any[]) {
  if (!conditions || conditions.length === 0) return {};

  const where: any = {};
  const andConditions: any[] = [];
  const orConditions: any[] = [];

  conditions.forEach(condition => {
    const fieldCondition: any = {};

    switch (condition.operator) {
      case 'equals':
        fieldCondition[condition.field] = { equals: condition.value };
        break;
      case 'contains':
        fieldCondition[condition.field] = { contains: condition.value, mode: 'insensitive' };
        break;
      case 'startsWith':
        fieldCondition[condition.field] = { startsWith: condition.value, mode: 'insensitive' };
        break;
      case 'endsWith':
        fieldCondition[condition.field] = { endsWith: condition.value, mode: 'insensitive' };
        break;
      case 'gt':
        fieldCondition[condition.field] = { gt: condition.value };
        break;
      case 'gte':
        fieldCondition[condition.field] = { gte: condition.value };
        break;
      case 'lt':
        fieldCondition[condition.field] = { lt: condition.value };
        break;
      case 'lte':
        fieldCondition[condition.field] = { lte: condition.value };
        break;
      case 'in':
        fieldCondition[condition.field] = { in: Array.isArray(condition.value) ? condition.value : [condition.value] };
        break;
      case 'notIn':
        fieldCondition[condition.field] = { notIn: Array.isArray(condition.value) ? condition.value : [condition.value] };
        break;
      case 'between':
        if (Array.isArray(condition.value) && condition.value.length === 2) {
          fieldCondition[condition.field] = { gte: condition.value[0], lte: condition.value[1] };
        }
        break;
    }

    if (condition.logicalOperator === 'OR') {
      orConditions.push(fieldCondition);
    } else {
      andConditions.push(fieldCondition);
    }
  });

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  if (orConditions.length > 0) {
    where.OR = orConditions;
  }

  return where;
}

// GET - Get saved filters
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'filter-read');
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

    // Get user settings with saved filters
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const savedFilters = preferences.savedFilters || [];

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');

    // Filter results based on search and tag
    let filteredFilters = savedFilters;

    if (search) {
      filteredFilters = filteredFilters.filter((filter: any) =>
        filter.name.toLowerCase().includes(search.toLowerCase()) ||
        filter.description?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (tag) {
      filteredFilters = filteredFilters.filter((filter: any) =>
        filter.tags?.includes(tag)
      );
    }

    // Get all unique tags
    const allTags = [...new Set(savedFilters.flatMap((filter: any) => filter.tags || []))];

    return NextResponse.json({
      filters: filteredFilters,
      tags: allTags,
      total: filteredFilters.length,
    });

  } catch (error) {
    console.error('Get filters error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save a new filter or apply filters to data
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 20, 'filter-operation');
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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'save';

    if (action === 'save') {
      return await handleSaveFilter(request, session.user.id);
    } else if (action === 'apply') {
      return await handleApplyFilter(request, session.user.id);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "save" or "apply"' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Filter operation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle saving a new filter
async function handleSaveFilter(request: NextRequest, userId: string) {
  const body = await request.json();
  const validatedData = filterSchema.parse(body);

  // Get user settings
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { preferences: true }
  });

  const preferences = (userSettings?.preferences as any) || {};
  const savedFilters = preferences.savedFilters || [];

  // Create new filter
  const newFilter = {
    id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: validatedData.name,
    description: validatedData.description,
    conditions: validatedData.conditions,
    dateRange: validatedData.dateRange,
    groupBy: validatedData.groupBy,
    orderBy: validatedData.orderBy,
    limit: validatedData.limit,
    tags: validatedData.tags || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: userId,
  };

  // Add to saved filters
  const updatedFilters = [...savedFilters, newFilter];

  // Update preferences
  const updatedPreferences = {
    ...preferences,
    savedFilters: updatedFilters
  };

  await prisma.userSettings.upsert({
    where: { userId },
    update: { preferences: updatedPreferences },
    create: {
      userId,
      preferences: updatedPreferences,
      limits: {},
    }
  });

  // Log filter creation
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'filter_saved',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        filterId: newFilter.id,
        filterName: newFilter.name,
        conditionsCount: newFilter.conditions.length,
      },
    },
  });

  return NextResponse.json({
    message: 'Filter saved successfully',
    filter: newFilter,
  }, { status: 201 });
}

// Handle applying filters to data
async function handleApplyFilter(request: NextRequest, userId: string) {
  const body = await request.json();
  const validatedData = applyFilterSchema.parse(body);

  let filterConfig: any = {};

  // Get filter configuration
  if (validatedData.filterId) {
    // Load saved filter
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const savedFilters = preferences.savedFilters || [];
    const savedFilter = savedFilters.find((f: any) => f.id === validatedData.filterId);

    if (!savedFilter) {
      return NextResponse.json(
        { error: 'Saved filter not found' },
        { status: 404 }
      );
    }

    filterConfig = savedFilter;
  } else if (validatedData.filters) {
    filterConfig = validatedData.filters;
  } else {
    return NextResponse.json(
      { error: 'Either filterId or filters must be provided' },
      { status: 400 }
    );
  }

  // Build query conditions
  const whereConditions = {
    userId,
    ...buildFilterConditions(filterConfig.conditions || []),
    ...buildDateRangeCondition(filterConfig.dateRange),
  };

  const pagination = validatedData.pagination || { page: 1, limit: 20 };
  const skip = (pagination.page - 1) * pagination.limit;

  // Apply filters based on data source
  let data: any[] = [];
  let total = 0;

  switch (validatedData.dataSource) {
    case 'projects':
      [data, total] = await Promise.all([
        prisma.project.findMany({
          where: whereConditions,
          orderBy: filterConfig.orderBy?.map((o: any) => ({ [o.field]: o.direction })) || [{ createdAt: 'desc' }],
          skip,
          take: pagination.limit,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            framework: true,
            language: true,
            visibility: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                deploymentHistory: true,
                mediaFiles: true,
              },
            },
          },
        }),
        prisma.project.count({ where: whereConditions }),
      ]);
      break;

    case 'usage':
      [data, total] = await Promise.all([
        prisma.usageStats.findMany({
          where: whereConditions,
          orderBy: filterConfig.orderBy?.map((o: any) => ({ [o.field]: o.direction })) || [{ date: 'desc' }],
          skip,
          take: pagination.limit,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.usageStats.count({ where: whereConditions }),
      ]);
      break;

    default:
      return NextResponse.json(
        { error: 'Unsupported data source' },
        { status: 400 }
      );
  }

  return NextResponse.json({
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.ceil(total / pagination.limit),
    },
    appliedFilter: filterConfig,
    summary: {
      totalRecords: total,
      filteredRecords: data.length,
      dataSource: validatedData.dataSource,
    },
  });
}

// DELETE - Delete a saved filter
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'filter-delete');
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

    const { searchParams } = new URL(request.url);
    const filterId = searchParams.get('id');

    if (!filterId) {
      return NextResponse.json(
        { error: 'Filter ID is required' },
        { status: 400 }
      );
    }

    // Get user settings
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const savedFilters = preferences.savedFilters || [];

    // Find and remove the filter
    const filterIndex = savedFilters.findIndex((f: any) => f.id === filterId);
    
    if (filterIndex === -1) {
      return NextResponse.json(
        { error: 'Filter not found' },
        { status: 404 }
      );
    }

    const deletedFilter = savedFilters[filterIndex];

    // Check ownership
    if (deletedFilter.createdBy !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this filter' },
        { status: 403 }
      );
    }

    // Remove filter
    const updatedFilters = savedFilters.filter((f: any) => f.id !== filterId);

    // Update preferences
    const updatedPreferences = {
      ...preferences,
      savedFilters: updatedFilters
    };

    await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      update: { preferences: updatedPreferences },
      create: {
        userId: session.user.id,
        preferences: updatedPreferences,
        limits: {},
      }
    });

    // Log filter deletion
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'filter_deleted',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          filterId,
          filterName: deletedFilter.name,
        },
      },
    });

    return NextResponse.json({
      message: 'Filter deleted successfully',
    });

  } catch (error) {
    console.error('Delete filter error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "edge";
