// Dashboard Templates API for pre-built dashboard templates
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const createFromTemplateSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  customizations: z.object({
    theme: z.record(z.any()).optional(),
    widgets: z.array(z.object({
      id: z.string(),
      updates: z.record(z.any())
    })).optional(),
    layout: z.object({
      columns: z.number().min(1).max(12).optional(),
      rows: z.number().min(1).max(50).optional()
    }).optional()
  }).optional()
});

// Pre-defined dashboard templates
const DASHBOARD_TEMPLATES = [
  {
    id: 'analytics-overview',
    name: 'Analytics Overview',
    description: 'Comprehensive analytics dashboard with key metrics, charts, and performance indicators',
    category: 'analytics',
    tags: ['analytics', 'metrics', 'performance', 'charts'],
    preview: '/templates/analytics-overview.png',
    difficulty: 'beginner',
    estimatedSetupTime: '5 minutes',
    layout: {
      columns: 12,
      rows: 8,
      gridSize: 20
    },
    theme: {
      name: 'professional',
      colors: {
        primary: '#2563eb',
        secondary: '#64748b',
        background: '#ffffff',
        surface: '#f8fafc',
        text: '#1e293b',
        accent: '#059669'
      }
    },
    widgets: [
      {
        id: 'total-users',
        type: 'metric',
        title: 'Total Users',
        position: { x: 0, y: 0, width: 3, height: 2 },
        config: {
          showTrend: true,
          unit: '',
          precision: 0
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/analytics/users/total',
          refreshInterval: 300
        },
        styling: {
          backgroundColor: '#f0f9ff',
          borderColor: '#2563eb',
          borderWidth: 1
        }
      },
      {
        id: 'revenue-chart',
        type: 'chart',
        title: 'Revenue Over Time',
        position: { x: 3, y: 0, width: 6, height: 4 },
        config: {
          chartType: 'line',
          showLegend: true,
          showAxes: true
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/analytics/revenue',
          refreshInterval: 600
        }
      },
      {
        id: 'conversion-rate',
        type: 'progress',
        title: 'Conversion Rate',
        position: { x: 9, y: 0, width: 3, height: 2 },
        config: {
          showPercentage: true,
          max: 100
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/analytics/conversion-rate',
          refreshInterval: 300
        }
      },
      {
        id: 'top-pages',
        type: 'table',
        title: 'Top Pages',
        position: { x: 0, y: 2, width: 6, height: 4 },
        config: {
          showHeaders: true,
          sortable: true,
          pageSize: 10
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/analytics/pages/top',
          refreshInterval: 900
        }
      },
      {
        id: 'traffic-sources',
        type: 'chart',
        title: 'Traffic Sources',
        position: { x: 6, y: 2, width: 6, height: 4 },
        config: {
          chartType: 'pie',
          showLegend: true
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/analytics/traffic-sources',
          refreshInterval: 900
        }
      },
      {
        id: 'real-time-users',
        type: 'metric',
        title: 'Real-time Users',
        position: { x: 0, y: 6, width: 4, height: 2 },
        config: {
          showTrend: false,
          unit: 'active now'
        },
        dataSource: {
          type: 'realtime',
          endpoint: '/api/analytics/realtime/users',
          refreshInterval: 30
        }
      },
      {
        id: 'bounce-rate',
        type: 'gauge',
        title: 'Bounce Rate',
        position: { x: 4, y: 6, width: 4, height: 2 },
        config: {
          min: 0,
          max: 100,
          unit: '%'
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/analytics/bounce-rate',
          refreshInterval: 600
        }
      },
      {
        id: 'goal-completions',
        type: 'metric',
        title: 'Goal Completions',
        position: { x: 8, y: 6, width: 4, height: 2 },
        config: {
          showTrend: true,
          trendDirection: 'up'
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/analytics/goals/completions',
          refreshInterval: 300
        }
      }
    ]
  },
  {
    id: 'ecommerce-dashboard',
    name: 'E-commerce Dashboard',
    description: 'Sales performance, inventory, and customer insights for online stores',
    category: 'ecommerce',
    tags: ['ecommerce', 'sales', 'inventory', 'customers'],
    preview: '/templates/ecommerce-dashboard.png',
    difficulty: 'intermediate',
    estimatedSetupTime: '10 minutes',
    layout: {
      columns: 12,
      rows: 10,
      gridSize: 20
    },
    theme: {
      name: 'commerce',
      colors: {
        primary: '#059669',
        secondary: '#6b7280',
        background: '#ffffff',
        surface: '#f9fafb',
        text: '#111827',
        accent: '#dc2626'
      }
    },
    widgets: [
      {
        id: 'total-revenue',
        type: 'metric',
        title: 'Total Revenue',
        position: { x: 0, y: 0, width: 3, height: 2 },
        config: {
          unit: '$',
          precision: 2,
          showTrend: true
        },
        dataSource: {
          type: 'api',
          endpoint: '/api/ecommerce/revenue/total'
        }
      },
      {
        id: 'orders-today',
        type: 'metric',
        title: "Today's Orders",
        position: { x: 3, y: 0, width: 3, height: 2 },
        config: {
          unit: 'orders',
          showTrend: true
        }
      },
      {
        id: 'avg-order-value',
        type: 'metric',
        title: 'Avg Order Value',
        position: { x: 6, y: 0, width: 3, height: 2 },
        config: {
          unit: '$',
          precision: 2
        }
      },
      {
        id: 'conversion-rate-ecom',
        type: 'gauge',
        title: 'Conversion Rate',
        position: { x: 9, y: 0, width: 3, height: 2 },
        config: {
          max: 10,
          unit: '%'
        }
      },
      {
        id: 'sales-chart',
        type: 'chart',
        title: 'Sales Over Time',
        position: { x: 0, y: 2, width: 8, height: 4 },
        config: {
          chartType: 'area',
          showLegend: true
        }
      },
      {
        id: 'top-products',
        type: 'table',
        title: 'Top Products',
        position: { x: 8, y: 2, width: 4, height: 4 },
        config: {
          showHeaders: true,
          pageSize: 5
        }
      },
      {
        id: 'inventory-alerts',
        type: 'table',
        title: 'Low Stock Alerts',
        position: { x: 0, y: 6, width: 6, height: 3 },
        config: {
          showHeaders: true,
          pageSize: 8
        }
      },
      {
        id: 'customer-locations',
        type: 'map',
        title: 'Customer Locations',
        position: { x: 6, y: 6, width: 6, height: 3 }
      }
    ]
  },
  {
    id: 'project-management',
    name: 'Project Management',
    description: 'Track project progress, team performance, and task completion',
    category: 'project-management',
    tags: ['projects', 'tasks', 'team', 'progress'],
    preview: '/templates/project-management.png',
    difficulty: 'intermediate',
    estimatedSetupTime: '15 minutes',
    layout: {
      columns: 12,
      rows: 12,
      gridSize: 20
    },
    widgets: [
      {
        id: 'project-progress',
        type: 'progress',
        title: 'Project Progress',
        position: { x: 0, y: 0, width: 6, height: 2 },
        config: {
          showPercentage: true
        }
      },
      {
        id: 'tasks-kanban',
        type: 'kanban',
        title: 'Tasks Board',
        position: { x: 0, y: 2, width: 12, height: 6 }
      },
      {
        id: 'team-performance',
        type: 'chart',
        title: 'Team Performance',
        position: { x: 6, y: 0, width: 6, height: 2 },
        config: {
          chartType: 'bar'
        }
      },
      {
        id: 'upcoming-deadlines',
        type: 'timeline',
        title: 'Upcoming Deadlines',
        position: { x: 0, y: 8, width: 12, height: 4 }
      }
    ]
  },
  {
    id: 'social-media',
    name: 'Social Media Analytics',
    description: 'Monitor social media performance across multiple platforms',
    category: 'social-media',
    tags: ['social', 'analytics', 'engagement', 'followers'],
    preview: '/templates/social-media.png',
    difficulty: 'beginner',
    estimatedSetupTime: '8 minutes',
    layout: {
      columns: 12,
      rows: 8,
      gridSize: 20
    },
    widgets: [
      {
        id: 'total-followers',
        type: 'metric',
        title: 'Total Followers',
        position: { x: 0, y: 0, width: 3, height: 2 }
      },
      {
        id: 'engagement-rate',
        type: 'gauge',
        title: 'Engagement Rate',
        position: { x: 3, y: 0, width: 3, height: 2 }
      },
      {
        id: 'platform-comparison',
        type: 'chart',
        title: 'Platform Comparison',
        position: { x: 6, y: 0, width: 6, height: 4 },
        config: {
          chartType: 'bar'
        }
      },
      {
        id: 'recent-posts',
        type: 'social',
        title: 'Recent Posts',
        position: { x: 0, y: 2, width: 6, height: 6 }
      }
    ]
  },
  {
    id: 'financial-overview',
    name: 'Financial Overview',
    description: 'Track financial metrics, expenses, and profitability',
    category: 'finance',
    tags: ['finance', 'revenue', 'expenses', 'profit'],
    preview: '/templates/financial-overview.png',
    difficulty: 'advanced',
    estimatedSetupTime: '20 minutes',
    layout: {
      columns: 12,
      rows: 10,
      gridSize: 20
    },
    widgets: [
      {
        id: 'monthly-revenue',
        type: 'chart',
        title: 'Monthly Revenue',
        position: { x: 0, y: 0, width: 8, height: 4 },
        config: {
          chartType: 'line'
        }
      },
      {
        id: 'profit-margin',
        type: 'gauge',
        title: 'Profit Margin',
        position: { x: 8, y: 0, width: 4, height: 2 }
      },
      {
        id: 'expenses-breakdown',
        type: 'chart',
        title: 'Expenses Breakdown',
        position: { x: 8, y: 2, width: 4, height: 2 },
        config: {
          chartType: 'pie'
        }
      },
      {
        id: 'cash-flow',
        type: 'chart',
        title: 'Cash Flow',
        position: { x: 0, y: 4, width: 12, height: 3 },
        config: {
          chartType: 'area'
        }
      }
    ]
  }
];

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const difficulty = searchParams.get('difficulty');
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');

    let templates = [...DASHBOARD_TEMPLATES];

    // Apply filters
    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    if (difficulty) {
      templates = templates.filter(t => t.difficulty === difficulty);
    }

    if (tag) {
      templates = templates.filter(t => t.tags.includes(tag));
    }

    if (search) {
      const searchLower = search.toLowerCase();
      templates = templates.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Get usage statistics for each template
    const templatesWithStats = await Promise.all(
      templates.map(async (template) => {
        const usageCount = await prisma.dashboard.count({
          where: {
            metadata: {
              path: ['templateId'],
              equals: template.id
            }
          }
        });

        const recentUsage = await prisma.dashboard.count({
          where: {
            metadata: {
              path: ['templateId'],
              equals: template.id
            },
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          }
        });

        return {
          ...template,
          stats: {
            totalUsage: usageCount,
            recentUsage,
            popularity: usageCount > 10 ? 'popular' : usageCount > 5 ? 'trending' : 'new'
          }
        };
      })
    );

    // Sort by popularity/usage
    templatesWithStats.sort((a, b) => b.stats.totalUsage - a.stats.totalUsage);

    // Get categories and tags for filtering
    const categories = [...new Set(DASHBOARD_TEMPLATES.map(t => t.category))];
    const allTags = [...new Set(DASHBOARD_TEMPLATES.flatMap(t => t.tags))];
    const difficulties = [...new Set(DASHBOARD_TEMPLATES.map(t => t.difficulty))];

    return NextResponse.json({
      templates: templatesWithStats,
      filters: {
        categories: categories.map(cat => ({
          id: cat,
          name: cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' '),
          count: DASHBOARD_TEMPLATES.filter(t => t.category === cat).length
        })),
        tags: allTags.map(tag => ({
          id: tag,
          name: tag.charAt(0).toUpperCase() + tag.slice(1).replace('-', ' '),
          count: DASHBOARD_TEMPLATES.filter(t => t.tags.includes(tag)).length
        })),
        difficulties: difficulties.map(diff => ({
          id: diff,
          name: diff.charAt(0).toUpperCase() + diff.slice(1),
          count: DASHBOARD_TEMPLATES.filter(t => t.difficulty === diff).length
        }))
      },
      total: templatesWithStats.length
    });

  } catch (error) {
    console.error('Dashboard templates fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard templates' },
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

    const userId = session.user.id;
    const body = await request.json();
    const { templateId, name, description, customizations } = createFromTemplateSchema.parse(body);

    // Find the template
    const template = DASHBOARD_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Check dashboard limits
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

    // Generate unique slug
    const baseSlug = name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    let slug = baseSlug;
    let counter = 1;

    while (await prisma.dashboard.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Apply customizations
    let widgets = [...template.widgets];
    let theme = { ...template.theme };
    let layout = { ...template.layout };

    if (customizations) {
      if (customizations.theme) {
        theme = { ...theme, ...customizations.theme };
      }

      if (customizations.layout) {
        layout = { ...layout, ...customizations.layout };
      }

      if (customizations.widgets) {
        customizations.widgets.forEach(widgetUpdate => {
          const widgetIndex = widgets.findIndex(w => w.id === widgetUpdate.id);
          if (widgetIndex !== -1) {
            widgets[widgetIndex] = { ...widgets[widgetIndex], ...widgetUpdate.updates };
          }
        });
      }
    }

    // Create dashboard from template
    const newDashboard = await prisma.dashboard.create({
      data: {
        userId,
        name,
        description: description || template.description,
        slug,
        category: template.category,
        layout,
        widgets,
        theme,
        settings: {
          isPublic: false,
          allowExport: true,
          autoRefresh: true,
          refreshInterval: 300,
          showHeader: true,
          showFooter: false,
          enableFullscreen: true,
          enablePrint: true
        },
        metadata: {
          templateId: template.id,
          templateName: template.name,
          templateVersion: '1.0',
          createdFromTemplate: true,
          customizations: customizations || {}
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

    // Log template usage
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_created_from_template',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId: newDashboard.id,
          templateId,
          templateName: template.name,
          dashboardName: name,
          widgetCount: widgets.length,
          hasCustomizations: !!customizations
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Dashboard created from template successfully',
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
        template: {
          id: template.id,
          name: template.name,
          category: template.category
        },
        widgetCount: widgets.length
      }
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid template data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create dashboard from template error:', error);
    return NextResponse.json(
      { error: 'Failed to create dashboard from template' },
      { status: 500 }
    );
  }
}