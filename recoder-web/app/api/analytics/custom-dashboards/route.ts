// Dashboard management API for custom analytics dashboards
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for dashboard operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

// Dashboard configuration schema
const dashboardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  layout: z.enum(['grid', 'masonry', 'flow']).default('grid'),
  gridSize: z.object({
    columns: z.number().min(1).max(12).default(4),
    rowHeight: z.number().min(50).max(500).default(200),
  }).optional(),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    size: z.object({ width: z.number(), height: z.number() }),
    config: z.record(z.any()),
  })),
  settings: z.object({
    autoRefresh: z.boolean().default(false),
    refreshInterval: z.number().min(5000).max(300000).default(30000),
    theme: z.enum(['light', 'dark', 'auto']).default('light'),
    showGrid: z.boolean().default(true),
    allowResize: z.boolean().default(true),
  }).optional(),
  sharing: z.object({
    isPublic: z.boolean().default(false),
    permissions: z.array(z.string()).default(['view']),
  }).optional(),
});

const updateDashboardSchema = dashboardSchema.partial().extend({
  id: z.string(),
});

// GET - List user's dashboards
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'dashboard-read');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build filter conditions
    const where: any = {
      userId: session.user.id,
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    // Get user's projects as dashboard data source for now
    const [projects, totalProjects] = await Promise.all([
      prisma.project.findMany({
        where: {
          userId: session.user.id,
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          framework: true,
          language: true,
          // visibility: true, // Field doesn't exist in Project model
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              // deploymentHistory: true,
              // mediaFiles: true,
              // teamProjects: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({
        where: {
          userId: session.user.id,
        },
      }),
    ]);

    // Transform projects into dashboard format
    const dashboards = projects.map(project => ({
      id: project.id,
      name: `${project.name} Dashboard`,
      description: `Analytics for ${project.name}`,
      layout: 'grid',
      widgetCount: 4, // Default widgets
      sharing: { isPublic: false, permissions: ['view'] },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      createdBy: session.user.id,
      user: { id: session.user.id, name: session.user.name, image: session.user.image },
      _count: {
        collaborators: 0, // project._count.teamProjects,
        views: 0,
      },
      projectData: {
        framework: project.framework,
        language: project.language,
        status: project.status,
        visibility: 'private', // Default since visibility field doesn't exist
        deployments: 0, // project._count.deploymentHistory,
        mediaFiles: 0, // project._count.mediaFiles,
      },
    }));

    return NextResponse.json({
      dashboards,
      pagination: {
        page,
        limit,
        total: totalProjects,
        pages: Math.ceil(totalProjects / limit),
      },
    });

  } catch (error) {
    console.error('Get dashboards error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new dashboard
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'dashboard-create');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = dashboardSchema.parse(body);

    // Get or create user settings to store dashboard data
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const currentDashboards = preferences.dashboards || [];
    
    // Create new dashboard object
    const newDashboard = {
      id: `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: validatedData.name,
      description: validatedData.description,
      layout: validatedData.layout,
      gridSize: validatedData.gridSize || { columns: 4, rowHeight: 200 },
      widgets: validatedData.widgets || [],
      widgetCount: validatedData.widgets?.length || 0,
      settings: validatedData.settings || {
        autoRefresh: false,
        refreshInterval: 30000,
        theme: 'light',
        showGrid: true,
        allowResize: true,
      },
      sharing: validatedData.sharing || {
        isPublic: false,
        permissions: ['view'],
      },
      createdBy: session.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to dashboards array
    const updatedDashboards = [...currentDashboards, newDashboard];
    
    // Update preferences with new dashboard
    const updatedPreferences = {
      ...preferences,
      dashboards: updatedDashboards
    };

    // Update user settings with new dashboard
    await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      update: { preferences: updatedPreferences },
      create: {
        userId: session.user.id,
        preferences: updatedPreferences
      }
    });

    // Log dashboard creation
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'dashboard_created',
        resource: 'dashboard',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId: newDashboard.id,
          dashboardName: newDashboard.name,
          widgetCount: newDashboard.widgetCount,
        },
      },
    });

    return NextResponse.json({
      message: 'Dashboard created successfully',
      dashboard: newDashboard,
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid dashboard data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update dashboard
export async function PUT(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 15, 'dashboard-update');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateDashboardSchema.parse(body);

    // Get user settings with dashboard data
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const dashboards = preferences.dashboards || [];

    // Find the dashboard to update
    const dashboardIndex = dashboards.findIndex((d: any) => d.id === validatedData.id);
    
    if (dashboardIndex === -1) {
      return NextResponse.json(
        { error: 'Dashboard not found' },
        { status: 404 }
      );
    }

    const existingDashboard = dashboards[dashboardIndex];

    // Check if user owns the dashboard
    if (existingDashboard.createdBy !== session.user.id) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Update dashboard
    const updatedDashboard = {
      ...existingDashboard,
      name: validatedData.name || existingDashboard.name,
      description: validatedData.description !== undefined ? validatedData.description : existingDashboard.description,
      layout: validatedData.layout || existingDashboard.layout,
      gridSize: validatedData.gridSize || existingDashboard.gridSize,
      widgets: validatedData.widgets || existingDashboard.widgets,
      widgetCount: validatedData.widgets?.length || existingDashboard.widgetCount,
      settings: validatedData.settings || existingDashboard.settings,
      sharing: validatedData.sharing || existingDashboard.sharing,
      updatedAt: new Date().toISOString(),
    };

    // Update the dashboard in the array
    dashboards[dashboardIndex] = updatedDashboard;

    // Update preferences
    const updatedPreferences = {
      ...preferences,
      dashboards
    };

    await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      update: { preferences: updatedPreferences },
      create: {
        userId: session.user.id,
        preferences: updatedPreferences
      }
    });

    // Log dashboard update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'dashboard_updated',
        resource: 'dashboard',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId: updatedDashboard.id,
          dashboardName: updatedDashboard.name,
          changes: Object.keys(validatedData),
        },
      },
    });

    return NextResponse.json({
      message: 'Dashboard updated successfully',
      dashboard: updatedDashboard,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid dashboard data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete dashboard
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'dashboard-delete');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('id');

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    // Get user settings with dashboard data
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const dashboards = preferences.dashboards || [];

    // Find the dashboard to delete
    const dashboardIndex = dashboards.findIndex((d: any) => d.id === dashboardId);
    
    if (dashboardIndex === -1) {
      return NextResponse.json(
        { error: 'Dashboard not found' },
        { status: 404 }
      );
    }

    const dashboard = dashboards[dashboardIndex];

    // Check if user owns the dashboard
    if (dashboard.createdBy !== session.user.id) {
      return NextResponse.json(
        { error: 'Only dashboard owner can delete' },
        { status: 403 }
      );
    }

    // Remove dashboard from array
    const updatedDashboards = dashboards.filter((d: any) => d.id !== dashboardId);

    // Update preferences
    const updatedPreferences = {
      ...preferences,
      dashboards: updatedDashboards
    };

    await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      update: { preferences: updatedPreferences },
      create: {
        userId: session.user.id,
        preferences: updatedPreferences
      }
    });

    // Log dashboard deletion
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'dashboard_deleted',
        resource: 'dashboard',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId,
          dashboardName: dashboard.name,
        },
      },
    });

    return NextResponse.json({
      message: 'Dashboard deleted successfully',
    });

  } catch (error) {
    console.error('Delete dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
