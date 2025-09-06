import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for dashboard operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const dashboardCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum(['line', 'bar', 'pie', 'area']),
    title: z.string(),
    data: z.array(z.any()),
    size: z.enum(['small', 'medium', 'large']),
    position: z.object({
      x: z.number(),
      y: z.number(),
    }),
  })),
});

const dashboardUpdateSchema = dashboardCreateSchema.partial();

// GET /api/analytics/dashboards - Get user's custom dashboards
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 60, 'dashboard-list');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In production, this would query custom_dashboards table
    const dashboards = [
      {
        id: 'dashboard-1',
        name: 'Developer Productivity',
        description: 'Code generation and efficiency metrics',
        widgets: [
          {
            id: 'widget-1',
            type: 'line',
            title: 'Code Generation Trends',
            data: generateMockTimeSeriesData('code_generation', 30),
            size: 'large',
            position: { x: 0, y: 0 }
          },
          {
            id: 'widget-2',
            type: 'bar',
            title: 'Languages Used',
            data: [
              { name: 'JavaScript', value: 45 },
              { name: 'Python', value: 35 },
              { name: 'TypeScript', value: 25 },
              { name: 'Java', value: 20 },
              { name: 'Go', value: 15 }
            ],
            size: 'medium',
            position: { x: 1, y: 0 }
          }
        ],
        isDefault: true,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'dashboard-2',
        name: 'Team Performance',
        description: 'Collaborative development insights',
        widgets: [
          {
            id: 'widget-3',
            type: 'pie',
            title: 'Team Contribution',
            data: [
              { name: 'Alice', value: 30 },
              { name: 'Bob', value: 25 },
              { name: 'Charlie', value: 20 },
              { name: 'Diana', value: 15 },
              { name: 'Others', value: 10 }
            ],
            size: 'medium',
            position: { x: 0, y: 0 }
          }
        ],
        isDefault: false,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'dashboard-3',
        name: 'Cost Analysis',
        description: 'AI usage costs and optimization',
        widgets: [
          {
            id: 'widget-4',
            type: 'area',
            title: 'Monthly Costs',
            data: generateMockTimeSeriesData('cost', 12),
            size: 'large',
            position: { x: 0, y: 0 }
          },
          {
            id: 'widget-5',
            type: 'bar',
            title: 'Cost by AI Provider',
            data: [
              { name: 'Claude', value: 1200 },
              { name: 'GPT-4', value: 800 },
              { name: 'Groq', value: 300 },
              { name: 'Gemini', value: 150 }
            ],
            size: 'medium',
            position: { x: 1, y: 0 }
          }
        ],
        isDefault: false,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      }
    ];

    return NextResponse.json({
      dashboards,
      count: dashboards.length
    });

  } catch (error) {
    console.error('Dashboard list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboards' },
      { status: 500 }
    );
  }
}

// POST /api/analytics/dashboards - Create new custom dashboard
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'dashboard-create');
    } catch {
      return NextResponse.json(
        { error: 'Too many creation requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate input
    let validatedData;
    try {
      validatedData = dashboardCreateSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // Create dashboard
    const dashboard = {
      id: `dashboard-${Date.now()}`,
      name: validatedData.name,
      description: validatedData.description || '',
      widgets: validatedData.widgets,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: session.user.id
    };

    // In production, save to database
    console.log('Dashboard created:', { ...dashboard, userId: session.user.id });

    return NextResponse.json({
      dashboard,
      message: 'Dashboard created successfully'
    });

  } catch (error) {
    console.error('Dashboard creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create dashboard' },
      { status: 500 }
    );
  }
}

// Helper function to generate mock time series data
function generateMockTimeSeriesData(type: string, days: number) {
  const data = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    let value;
    switch (type) {
      case 'code_generation':
        value = Math.floor(Math.random() * 100) + 50;
        break;
      case 'cost':
        value = Math.floor(Math.random() * 500) + 200;
        break;
      default:
        value = Math.floor(Math.random() * 100);
    }
    
    data.push({
      date: date.toISOString().split('T')[0],
      value,
      timestamp: date.toISOString()
    });
  }
  
  return data;
}

export const runtime = "edge";