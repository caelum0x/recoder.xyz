// Dashboard Widgets management API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const widgetSchema = z.object({
  type: z.enum([
    'chart', 'metric', 'table', 'text', 'image', 'video', 
    'iframe', 'calendar', 'weather', 'clock', 'progress',
    'kanban', 'timeline', 'map', 'social', 'rss', 'code',
    'gauge', 'pie_chart', 'line_chart', 'bar_chart', 'area_chart'
  ]),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  position: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().min(1).max(12),
    height: z.number().min(1).max(20)
  }),
  config: z.object({
    // Chart specific config
    chartType: z.enum(['line', 'bar', 'pie', 'doughnut', 'area', 'scatter']).optional(),
    showLegend: z.boolean().optional(),
    showAxes: z.boolean().optional(),
    
    // Metric config
    showTrend: z.boolean().optional(),
    trendDirection: z.enum(['up', 'down', 'neutral']).optional(),
    unit: z.string().optional(),
    precision: z.number().min(0).max(10).optional(),
    
    // Table config
    showHeaders: z.boolean().optional(),
    sortable: z.boolean().optional(),
    filterable: z.boolean().optional(),
    pageSize: z.number().min(5).max(100).optional(),
    
    // Text config
    fontSize: z.string().optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    fontWeight: z.enum(['normal', 'bold', 'light']).optional(),
    
    // Image/Video config
    src: z.string().url().optional(),
    alt: z.string().optional(),
    autoplay: z.boolean().optional(),
    controls: z.boolean().optional(),
    
    // IFrame config
    url: z.string().url().optional(),
    sandbox: z.string().optional(),
    
    // Calendar config
    calendarId: z.string().optional(),
    view: z.enum(['month', 'week', 'day', 'agenda']).optional(),
    
    // Weather config
    location: z.string().optional(),
    units: z.enum(['metric', 'imperial']).optional(),
    showForecast: z.boolean().optional(),
    
    // Progress config
    value: z.number().min(0).max(100).optional(),
    max: z.number().optional(),
    showPercentage: z.boolean().optional(),
    
    // RSS config
    feedUrl: z.string().url().optional(),
    itemCount: z.number().min(1).max(20).optional(),
    showImages: z.boolean().optional(),
    
    // Code config
    language: z.string().optional(),
    theme: z.string().optional(),
    showLineNumbers: z.boolean().optional()
  }).optional(),
  dataSource: z.object({
    type: z.enum(['api', 'database', 'static', 'realtime', 'webhook']),
    endpoint: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).optional(),
    headers: z.record(z.string()).optional(),
    query: z.string().optional(),
    queryParams: z.record(z.string()).optional(),
    data: z.any().optional(),
    refreshInterval: z.number().min(5).max(86400).optional(), // 5 seconds to 24 hours
    cacheEnabled: z.boolean().optional(),
    cacheDuration: z.number().optional(),
    transformScript: z.string().optional() // JavaScript code to transform data
  }).optional(),
  styling: z.object({
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    borderColor: z.string().optional(),
    borderWidth: z.number().min(0).max(10).optional(),
    borderRadius: z.number().min(0).max(50).optional(),
    borderStyle: z.enum(['solid', 'dashed', 'dotted', 'double']).optional(),
    fontSize: z.string().optional(),
    fontWeight: z.string().optional(),
    fontFamily: z.string().optional(),
    padding: z.string().optional(),
    margin: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    shadow: z.string().optional(),
    gradient: z.object({
      type: z.enum(['linear', 'radial']),
      colors: z.array(z.string()),
      direction: z.string().optional()
    }).optional()
  }).optional(),
  permissions: z.object({
    canEdit: z.boolean().default(true),
    canDelete: z.boolean().default(true),
    canMove: z.boolean().default(true),
    canResize: z.boolean().default(true)
  }).optional(),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    author: z.string().optional(),
    version: z.string().optional(),
    lastUpdated: z.string().optional()
  }).optional()
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

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');
    const widgetType = searchParams.get('type');
    const category = searchParams.get('category');

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    // Verify user has access to dashboard
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        OR: [
          { userId },
          { settings: { path: ['isPublic'], equals: true } }
        ]
      }
    });

    if (!dashboard) {
      return NextResponse.json(
        { error: 'Dashboard not found or access denied' },
        { status: 404 }
      );
    }

    // Get widgets from dashboard
    let widgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];

    // Apply filters
    if (widgetType) {
      widgets = widgets.filter((widget: any) => widget.type === widgetType);
    }

    if (category) {
      widgets = widgets.filter((widget: any) => widget.metadata?.category === category);
    }

    // Get widget data if needed
    const enrichedWidgets = await Promise.all(
      widgets.map(async (widget: any) => {
        let data = null;
        let error = null;

        // Fetch data if widget has data source
        if (widget.dataSource && widget.dataSource.type !== 'static') {
          try {
            data = await fetchWidgetData(widget.dataSource);
          } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to fetch data';
          }
        } else if (widget.dataSource?.type === 'static') {
          data = widget.dataSource.data;
        }

        return {
          ...widget,
          data,
          error,
          lastFetched: data ? new Date().toISOString() : null
        };
      })
    );

    return NextResponse.json({
      widgets: enrichedWidgets,
      total: enrichedWidgets.length,
      dashboardInfo: {
        id: dashboard.id,
        name: dashboard.name,
        layout: dashboard.layout,
        isOwner: dashboard.userId === userId
      }
    });

  } catch (error) {
    console.error('Dashboard widgets fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard widgets' },
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
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const widgetData = widgetSchema.parse(body);

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

    // Generate widget ID
    const widgetId = `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create widget object
    const newWidget = {
      id: widgetId,
      ...widgetData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Get current widgets
    const currentWidgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];

    // Check for position conflicts and adjust if necessary
    const adjustedWidget = adjustWidgetPosition(newWidget, currentWidgets);

    // Add widget to dashboard
    const updatedWidgets = [...currentWidgets, adjustedWidget];

    // Update dashboard
    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        widgets: updatedWidgets,
        updatedAt: new Date()
      }
    });

    // Log widget creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_widget_added',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId,
          widgetId,
          widgetType: widgetData.type,
          widgetTitle: widgetData.title,
          position: widgetData.position
        }
      }
    });

    // Fetch initial data if needed
    let widgetWithData = { ...adjustedWidget };
    if (widgetData.dataSource && widgetData.dataSource.type !== 'static') {
      try {
        const data = await fetchWidgetData(widgetData.dataSource);
        widgetWithData = { ...adjustedWidget, data, lastFetched: new Date().toISOString() };
      } catch (error) {
        widgetWithData = { 
          ...adjustedWidget, 
          error: error instanceof Error ? error.message : 'Failed to fetch data' 
        };
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Widget added successfully',
      widget: widgetWithData
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid widget data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Widget creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create widget' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');
    const widgetId = searchParams.get('widgetId');

    if (!dashboardId || !widgetId) {
      return NextResponse.json(
        { error: 'Dashboard ID and Widget ID are required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates = body;

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

    // Find and update widget
    const widgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
    const widgetIndex = widgets.findIndex((w: any) => w.id === widgetId);

    if (widgetIndex === -1) {
      return NextResponse.json(
        { error: 'Widget not found' },
        { status: 404 }
      );
    }

    // Update widget
    const updatedWidget = {
      ...widgets[widgetIndex],
      ...updates,
      id: widgetId, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };

    widgets[widgetIndex] = updatedWidget;

    // Update dashboard
    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        widgets: widgets,
        updatedAt: new Date()
      }
    });

    // Log widget update
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_widget_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId,
          widgetId,
          widgetType: updatedWidget.type,
          updatedFields: Object.keys(updates)
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Widget updated successfully',
      widget: updatedWidget
    });

  } catch (error) {
    console.error('Widget update error:', error);
    return NextResponse.json(
      { error: 'Failed to update widget' },
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

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dashboardId = searchParams.get('dashboardId');
    const widgetId = searchParams.get('widgetId');

    if (!dashboardId || !widgetId) {
      return NextResponse.json(
        { error: 'Dashboard ID and Widget ID are required' },
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

    // Remove widget from dashboard
    const widgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
    const widgetIndex = widgets.findIndex((w: any) => w.id === widgetId);

    if (widgetIndex === -1) {
      return NextResponse.json(
        { error: 'Widget not found' },
        { status: 404 }
      );
    }

    const removedWidget = widgets[widgetIndex];
    widgets.splice(widgetIndex, 1);

    // Update dashboard
    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        widgets: widgets,
        updatedAt: new Date()
      }
    });

    // Log widget deletion
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'dashboard_widget_deleted',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          dashboardId,
          widgetId,
          widgetType: removedWidget.type,
          widgetTitle: removedWidget.title
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Widget deleted successfully'
    });

  } catch (error) {
    console.error('Widget deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete widget' },
      { status: 500 }
    );
  }
}

// Helper functions
async function fetchWidgetData(dataSource: any) {
  switch (dataSource.type) {
    case 'api':
      return await fetchApiData(dataSource);
    case 'database':
      return await fetchDatabaseData(dataSource);
    case 'realtime':
      return await fetchRealtimeData(dataSource);
    default:
      throw new Error(`Unsupported data source type: ${dataSource.type}`);
  }
}

async function fetchApiData(dataSource: any) {
  const { endpoint, method = 'GET', headers = {}, queryParams = {} } = dataSource;
  
  const url = new URL(endpoint);
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  let data = await response.json();

  // Apply data transformation if provided
  if (dataSource.transformScript) {
    try {
      // Simple transformation using Function constructor
      const transform = new Function('data', dataSource.transformScript);
      data = transform(data);
    } catch (error) {
      console.error('Data transformation error:', error);
    }
  }

  return data;
}

async function fetchDatabaseData(dataSource: any) {
  const { query } = dataSource;
  
  if (!query) {
    throw new Error('Database query is required');
  }

  // This would integrate with your database
  // For security, you might want to use predefined queries or a query builder
  // For now, return mock data
  return {
    message: 'Database integration not implemented',
    query: query
  };
}

async function fetchRealtimeData(dataSource: any) {
  // This would integrate with WebSocket or SSE endpoints
  // For now, return mock data
  return {
    message: 'Realtime data not implemented',
    timestamp: new Date().toISOString()
  };
}

function adjustWidgetPosition(newWidget: any, existingWidgets: any[]): any {
  // Simple collision detection and adjustment
  let { x, y, width, height } = newWidget.position;
  
  const hasCollision = (pos: any) => {
    return existingWidgets.some(widget => {
      const w = widget.position;
      return !(pos.x + pos.width <= w.x || 
               pos.x >= w.x + w.width || 
               pos.y + pos.height <= w.y || 
               pos.y >= w.y + w.height);
    });
  };

  // If collision, try to find a free spot
  if (hasCollision({ x, y, width, height })) {
    // Try moving to the right first
    for (let newX = x; newX <= 12 - width; newX++) {
      if (!hasCollision({ x: newX, y, width, height })) {
        x = newX;
        break;
      }
    }
    
    // If still colliding, try moving down
    if (hasCollision({ x, y, width, height })) {
      for (let newY = y; newY <= 50; newY++) {
        if (!hasCollision({ x, y: newY, width, height })) {
          y = newY;
          break;
        }
      }
    }
  }

  return {
    ...newWidget,
    position: { x, y, width, height }
  };
}