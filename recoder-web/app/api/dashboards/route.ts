// Custom Dashboard Builder API with full CRUD operations
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createDashboardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  layout: z.object({
    columns: z.number().min(1).max(12).default(12),
    rows: z.number().min(1).max(50).default(10),
    gridSize: z.number().min(10).max(100).default(20)
  }),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum([
      'chart', 'metric', 'table', 'text', 'image', 'video', 
      'iframe', 'calendar', 'weather', 'clock', 'progress',
      'kanban', 'timeline', 'map', 'social', 'rss'
    ]),
    title: z.string().min(1),
    position: z.object({
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().min(1),
      height: z.number().min(1)
    }),
    config: z.record(z.any()).optional(),
    dataSource: z.object({
      type: z.enum(['api', 'database', 'static', 'realtime']),
      endpoint: z.string().optional(),
      query: z.string().optional(),
      data: z.any().optional(),
      refreshInterval: z.number().optional()
    }).optional(),
    styling: z.object({
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      borderColor: z.string().optional(),
      borderWidth: z.number().optional(),
      borderRadius: z.number().optional(),
      fontSize: z.string().optional(),
      fontWeight: z.string().optional(),
      padding: z.string().optional(),
      margin: z.string().optional()
    }).optional()
  })),
  theme: z.object({
    name: z.string().default('default'),
    colors: z.object({
      primary: z.string().default('#3b82f6'),
      secondary: z.string().default('#6b7280'),
      background: z.string().default('#ffffff'),
      surface: z.string().default('#f9fafb'),
      text: z.string().default('#111827'),
      accent: z.string().default('#10b981')
    }).optional(),
    typography: z.object({
      fontFamily: z.string().default('Inter'),
      fontSize: z.string().default('14px'),
      lineHeight: z.string().default('1.5')
    }).optional()
  }).optional(),
  settings: z.object({
    isPublic: z.boolean().default(false),
    allowExport: z.boolean().default(true),
    autoRefresh: z.boolean().default(false),
    refreshInterval: z.number().min(5).max(3600).default(300), // seconds
    showHeader: z.boolean().default(true),
    showFooter: z.boolean().default(false),
    enableFullscreen: z.boolean().default(true),
    enablePrint: z.boolean().default(true)
  }).optional()
});

const updateDashboardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  layout: z.object({
    columns: z.number().min(1).max(12),
    rows: z.number().min(1).max(50),
    gridSize: z.number().min(10).max(100)
  }).optional(),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum([
      'chart', 'metric', 'table', 'text', 'image', 'video', 
      'iframe', 'calendar', 'weather', 'clock', 'progress',
      'kanban', 'timeline', 'map', 'social', 'rss'
    ]),
    title: z.string().min(1),
    position: z.object({
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().min(1),
      height: z.number().min(1)
    }),
    config: z.record(z.any()).optional(),
    dataSource: z.object({
      type: z.enum(['api', 'database', 'static', 'realtime']),
      endpoint: z.string().optional(),
      query: z.string().optional(),
      data: z.any().optional(),
      refreshInterval: z.number().optional()
    }).optional(),
    styling: z.record(z.any()).optional()
  })).optional(),
  theme: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional()
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user ID from session email since session.user.id may not exist
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const isPublic = searchParams.get('isPublic');

    // Build where clause
    const whereClause: any = {
      OR: [
        { userId }, // User's own dashboards
        { 
          AND: [
            { settings: { path: ['isPublic'], equals: true } },
            { userId: { not: userId } } // Public dashboards from other users
          ]
        }
      ]
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (category) {
      whereClause.category = category;
    }

    if (isPublic !== null) {
      whereClause.settings = {
        path: ['isPublic'],
        equals: isPublic === 'true'
      };
    }

    // Get dashboards with pagination
    const [dashboards, totalCount] = await Promise.all([
      // Using proper Dashboard model for custom dashboards
      prisma.dashboard.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      }),
      prisma.dashboard.count({ where: whereClause })
    ]);

    // Transform dashboard data
    const transformedDashboards = dashboards.map(dashboard => ({
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      slug: dashboard.slug,
      category: dashboard.category,
      layout: dashboard.layout,
      widgets: dashboard.widgets,
      theme: dashboard.theme,
      settings: dashboard.settings,
      createdAt: dashboard.createdAt.toISOString(),
      updatedAt: dashboard.updatedAt.toISOString(),
      user: dashboard.user,
      isOwner: dashboard.userId === userId,
      stats: {
        views: 0,
        shares: 0,
        likes: 0
      },
      widgetCount: Array.isArray(dashboard.widgets) ? dashboard.widgets.length : 0
    }));

    return NextResponse.json({
      dashboards: transformedDashboards,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrevious: page > 1
      }
    });

  } catch (error) {
    console.error('Dashboards fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboards' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user ID from session email since session.user.id may not exist
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;
    const body = await request.json();
    const dashboardData = createDashboardSchema.parse(body);

    // Generate unique slug
    const baseSlug = dashboardData.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    let slug = baseSlug;
    let counter = 1;

    while (await prisma.dashboard.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Check dashboard limits based on user subscription
    const userSubscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const userPlan = userSubscription?.plan || 'free';
    const dashboardLimits = {
      free: 3,
      pro: 25,
      enterprise: 100
    };

    const dashboardCount = await prisma.dashboard.count({
      where: { userId }
    });

    if (dashboardCount >= dashboardLimits[userPlan as keyof typeof dashboardLimits]) {
      return NextResponse.json(
        { 
          error: `Dashboard limit reached. ${userPlan} plan allows ${dashboardLimits[userPlan as keyof typeof dashboardLimits]} dashboards.`,
          upgradeRequired: userPlan === 'free'
        },
        { status: 403 }
      );
    }

    // Create dashboard
    const newDashboard = await prisma.dashboard.create({
      data: {
        userId,
        name: dashboardData.name,
        description: dashboardData.description,
        slug,
        category: 'custom',
        layout: dashboardData.layout,
        widgets: dashboardData.widgets,
        theme: dashboardData.theme || {
          name: 'default',
          colors: {
            primary: '#3b82f6',
            secondary: '#6b7280',
            background: '#ffffff',
            surface: '#f9fafb',
            text: '#111827',
            accent: '#10b981'
          }
        },
        settings: dashboardData.settings || {
          isPublic: false,
          allowExport: true,
          autoRefresh: false,
          refreshInterval: 300
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Log dashboard creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_created',
        resource: 'dashboard',
        resourceId: newDashboard.id,
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId: newDashboard.id,
          dashboardName: newDashboard.name,
          slug: newDashboard.slug,
          widgetCount: Array.isArray(newDashboard.widgets) ? newDashboard.widgets.length : 0,
          isPublic: (newDashboard.settings as any)?.isPublic || false
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Dashboard created successfully',
      dashboard: {
        id: newDashboard.id,
        name: newDashboard.name,
        description: newDashboard.description,
        slug: newDashboard.slug,
        layout: newDashboard.layout,
        widgets: newDashboard.widgets,
        theme: newDashboard.theme,
        settings: newDashboard.settings,
        createdAt: newDashboard.createdAt.toISOString(),
        user: newDashboard.user,
        widgetCount: Array.isArray(newDashboard.widgets) ? newDashboard.widgets.length : 0
      }
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid dashboard data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Dashboard creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create dashboard' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user ID from session email since session.user.id may not exist
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates = updateDashboardSchema.parse(body);

    // Verify user owns the dashboard
    const existingDashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        userId
      }
    });

    if (!existingDashboard) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.layout !== undefined) updateData.layout = updates.layout;
    if (updates.widgets !== undefined) updateData.widgets = updates.widgets;
    if (updates.theme !== undefined) updateData.theme = updates.theme;
    if (updates.settings !== undefined) updateData.settings = updates.settings;

    // Update dashboard
    const updatedDashboard = await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        ...updateData,
        updatedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Log dashboard update
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_updated',
        resource: 'dashboard',
        resourceId: dashboardId,
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId,
          dashboardName: updatedDashboard.name,
          updatedFields: Object.keys(updateData),
          widgetCount: Array.isArray(updatedDashboard.widgets) ? updatedDashboard.widgets.length : 0
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Dashboard updated successfully',
      dashboard: {
        id: updatedDashboard.id,
        name: updatedDashboard.name,
        description: updatedDashboard.description,
        slug: updatedDashboard.slug,
        layout: updatedDashboard.layout,
        widgets: updatedDashboard.widgets,
        theme: updatedDashboard.theme,
        settings: updatedDashboard.settings,
        updatedAt: updatedDashboard.updatedAt.toISOString(),
        user: updatedDashboard.user
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid update data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Dashboard update error:', error);
    return NextResponse.json(
      { error: 'Failed to update dashboard' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user ID from session email since session.user.id may not exist
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    // Verify user owns the dashboard
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        userId
      }
    });

    if (!dashboard) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    // Delete related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Just delete the dashboard directly
      await tx.dashboard.delete({
        where: { id: dashboardId }
      });
    });

    // Log dashboard deletion
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_deleted',
        resource: 'dashboard',
        resourceId: dashboardId,
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId,
          dashboardName: dashboard.name,
          slug: dashboard.slug
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Dashboard deleted successfully'
    });

  } catch (error) {
    console.error('Dashboard deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete dashboard' },
      { status: 500 }
    );
  }
}