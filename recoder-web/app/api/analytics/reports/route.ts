// Advanced Analytics Report Builder API with full CRUD operations
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const reportConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['usage', 'performance', 'financial', 'user_behavior', 'custom']),
  type: z.enum(['summary', 'detailed', 'comparative', 'trending', 'real_time']),
  dataSource: z.object({
    type: z.enum(['database', 'api', 'mixed', 'event_stream']),
    tables: z.array(z.string()).optional(),
    queries: z.array(z.object({
      id: z.string(),
      name: z.string(),
      sql: z.string().optional(),
      endpoint: z.string().optional(),
      parameters: z.record(z.any()).optional()
    })).optional(),
    filters: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'between', 'in', 'not_in']),
      value: z.any(),
      required: z.boolean().default(false)
    })).optional()
  }),
  dimensions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    field: z.string(),
    type: z.enum(['string', 'number', 'date', 'boolean', 'category']),
    groupable: z.boolean().default(true),
    sortable: z.boolean().default(true),
    filterable: z.boolean().default(true),
    format: z.string().optional() // date format, number format, etc.
  })),
  metrics: z.array(z.object({
    id: z.string(),
    name: z.string(),
    field: z.string(),
    aggregation: z.enum(['sum', 'count', 'avg', 'min', 'max', 'distinct_count', 'median', 'percentile']),
    format: z.string().optional(),
    unit: z.string().optional(),
    calculation: z.string().optional() // custom calculation formula
  })),
  visualizations: z.array(z.object({
    id: z.string(),
    type: z.enum(['table', 'line_chart', 'bar_chart', 'pie_chart', 'area_chart', 'scatter_plot', 'heatmap', 'gauge', 'funnel', 'treemap']),
    title: z.string(),
    dimensions: z.array(z.string()),
    metrics: z.array(z.string()),
    config: z.object({
      showLegend: z.boolean().default(true),
      showValues: z.boolean().default(false),
      stacked: z.boolean().default(false),
      orientation: z.enum(['horizontal', 'vertical']).default('vertical'),
      colorScheme: z.string().default('default'),
      limit: z.number().min(1).max(1000).optional()
    }).optional()
  })),
  schedule: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'quarterly']).optional(),
    time: z.string().optional(), // HH:mm format
    timezone: z.string().default('UTC'),
    recipients: z.array(z.string()).optional(),
    formats: z.array(z.enum(['pdf', 'xlsx', 'csv', 'email'])).optional()
  }).optional(),
  settings: z.object({
    refreshInterval: z.number().min(60).max(86400).default(3600), // 1 minute to 24 hours
    cacheEnabled: z.boolean().default(true),
    cacheDuration: z.number().default(1800), // 30 minutes
    maxRows: z.number().min(100).max(100000).default(10000),
    allowDrillDown: z.boolean().default(true),
    showExportOptions: z.boolean().default(true),
    isPublic: z.boolean().default(false)
  }).optional()
});

const updateReportSchema = reportConfigSchema.partial().extend({
  id: z.string().optional()
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build where clause
    const whereClause: any = {
      userId
    };

    if (category) {
      whereClause.category = category;
    }

    if (type) {
      whereClause.type = type;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get reports with pagination
    const [reports, totalCount] = await Promise.all([
      prisma.analyticsReport.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              executions: true,
              exports: true,
              shares: true
            }
          }
        }
      }),
      prisma.analyticsReport.count({ where: whereClause })
    ]);

    // Get recent executions for each report
    const reportsWithStats = await Promise.all(
      reports.map(async (report) => {
        const lastExecution = await prisma.reportExecution.findFirst({
          where: { reportId: report.id },
          orderBy: { createdAt: 'desc' }
        });

        const avgExecutionTime = await prisma.reportExecution.aggregate({
          where: { 
            reportId: report.id,
            status: 'completed',
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
          },
          _avg: { executionTime: true }
        });

        return {
          id: report.id,
          name: report.name,
          description: report.description,
          category: report.category,
          type: report.type,
          slug: report.slug,
          dataSource: report.dataSource,
          dimensions: report.dimensions,
          metrics: report.metrics,
          visualizations: report.visualizations,
          schedule: report.schedule,
          settings: report.settings,
          createdAt: report.createdAt.toISOString(),
          updatedAt: report.updatedAt.toISOString(),
          user: report.user,
          stats: {
            totalExecutions: report._count.executions,
            totalExports: report._count.exports,
            totalShares: report._count.shares,
            lastExecutedAt: lastExecution?.createdAt?.toISOString(),
            lastExecutionStatus: lastExecution?.status,
            avgExecutionTime: Math.round(avgExecutionTime._avg.executionTime || 0),
            isScheduled: (report.schedule as any)?.enabled || false
          }
        };
      })
    );

    // Get summary statistics
    const summaryStats = {
      total: totalCount,
      byCategory: await prisma.analyticsReport.groupBy({
        by: ['category'],
        where: { userId },
        _count: true
      }),
      byType: await prisma.analyticsReport.groupBy({
        by: ['type'],
        where: { userId },
        _count: true
      }),
      scheduled: await prisma.analyticsReport.count({
        where: {
          userId,
          schedule: { path: ['enabled'], equals: true }
        }
      })
    };

    return NextResponse.json({
      reports: reportsWithStats,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrevious: page > 1
      },
      stats: summaryStats
    });

  } catch (error) {
    console.error('Analytics reports fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics reports' },
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
    const reportData = reportConfigSchema.parse(body);

    // Check report limits based on subscription
    const userSubscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const userPlan = userSubscription?.plan || 'free';
    const reportLimits = {
      free: 5,
      pro: 50,
      enterprise: 500
    };

    const reportCount = await prisma.analyticsReport.count({
      where: { userId }
    });

    if (reportCount >= reportLimits[userPlan as keyof typeof reportLimits]) {
      return NextResponse.json(
        { 
          error: `Report limit reached. ${userPlan} plan allows ${reportLimits[userPlan as keyof typeof reportLimits]} reports.`,
          upgradeRequired: userPlan === 'free'
        },
        { status: 403 }
      );
    }

    // Generate unique slug
    const baseSlug = reportData.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    let slug = baseSlug;
    let counter = 1;

    while (await prisma.analyticsReport.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Validate data source configuration
    const validationResult = await validateDataSource(reportData.dataSource, userId);
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: `Data source validation failed: ${validationResult.error}` },
        { status: 400 }
      );
    }

    // Create analytics report
    const newReport = await prisma.analyticsReport.create({
      data: {
        userId,
        name: reportData.name,
        description: reportData.description,
        slug,
        category: reportData.category,
        type: reportData.type,
        dataSource: reportData.dataSource,
        dimensions: reportData.dimensions,
        metrics: reportData.metrics,
        visualizations: reportData.visualizations,
        schedule: reportData.schedule || { enabled: false },
        settings: reportData.settings || {
          refreshInterval: 3600,
          cacheEnabled: true,
          cacheDuration: 1800,
          maxRows: 10000,
          allowDrillDown: true,
          showExportOptions: true,
          isPublic: false
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

    // Create initial report execution to validate configuration
    const executionResult = await executeReport(newReport.id, userId);

    // Log report creation
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'analytics_report_created',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          reportId: newReport.id,
          reportName: newReport.name,
          category: newReport.category,
          type: newReport.type,
          dimensionCount: reportData.dimensions.length,
          metricCount: reportData.metrics.length,
          visualizationCount: reportData.visualizations.length,
          initialExecutionStatus: executionResult.status
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Analytics report created successfully',
      report: {
        id: newReport.id,
        name: newReport.name,
        description: newReport.description,
        slug: newReport.slug,
        category: newReport.category,
        type: newReport.type,
        dataSource: newReport.dataSource,
        dimensions: newReport.dimensions,
        metrics: newReport.metrics,
        visualizations: newReport.visualizations,
        schedule: newReport.schedule,
        settings: newReport.settings,
        createdAt: newReport.createdAt.toISOString(),
        user: newReport.user,
        initialExecution: executionResult
      }
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid report configuration', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Analytics report creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create analytics report' },
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

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');

    if (!reportId) {
      return NextResponse.json(
        { error: 'Report ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates = updateReportSchema.parse(body);

    // Verify user owns the report
    const existingReport = await prisma.analyticsReport.findFirst({
      where: {
        id: reportId,
        userId
      }
    });

    if (!existingReport) {
      return NextResponse.json(
        { error: 'Report not found or access denied' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.dataSource !== undefined) updateData.dataSource = updates.dataSource;
    if (updates.dimensions !== undefined) updateData.dimensions = updates.dimensions;
    if (updates.metrics !== undefined) updateData.metrics = updates.metrics;
    if (updates.visualizations !== undefined) updateData.visualizations = updates.visualizations;
    if (updates.schedule !== undefined) updateData.schedule = updates.schedule;
    if (updates.settings !== undefined) updateData.settings = updates.settings;

    // Validate data source if updated
    if (updates.dataSource) {
      const validationResult = await validateDataSource(updates.dataSource, userId);
      if (!validationResult.valid) {
        return NextResponse.json(
          { error: `Data source validation failed: ${validationResult.error}` },
          { status: 400 }
        );
      }
    }

    // Update report
    const updatedReport = await prisma.analyticsReport.update({
      where: { id: reportId },
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

    // Clear cache if data source or configuration changed
    if (updates.dataSource || updates.dimensions || updates.metrics) {
      await prisma.reportCache.deleteMany({
        where: { reportId }
      });
    }

    // Log report update
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'analytics_report_updated',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          reportId,
          reportName: updatedReport.name,
          updatedFields: Object.keys(updateData)
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Analytics report updated successfully',
      report: {
        id: updatedReport.id,
        name: updatedReport.name,
        description: updatedReport.description,
        slug: updatedReport.slug,
        category: updatedReport.category,
        type: updatedReport.type,
        dataSource: updatedReport.dataSource,
        dimensions: updatedReport.dimensions,
        metrics: updatedReport.metrics,
        visualizations: updatedReport.visualizations,
        schedule: updatedReport.schedule,
        settings: updatedReport.settings,
        updatedAt: updatedReport.updatedAt.toISOString(),
        user: updatedReport.user
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid report update data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Analytics report update error:', error);
    return NextResponse.json(
      { error: 'Failed to update analytics report' },
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
    const reportId = searchParams.get('reportId');

    if (!reportId) {
      return NextResponse.json(
        { error: 'Report ID is required' },
        { status: 400 }
      );
    }

    // Verify user owns the report
    const report = await prisma.analyticsReport.findFirst({
      where: {
        id: reportId,
        userId
      }
    });

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found or access denied' },
        { status: 404 }
      );
    }

    // Delete report and related data in transaction
    await prisma.$transaction(async (tx) => {
      // Delete report cache
      await tx.reportCache.deleteMany({
        where: { reportId }
      });

      // Delete report executions
      await tx.reportExecution.deleteMany({
        where: { reportId }
      });

      // Delete report exports
      await tx.reportExport.deleteMany({
        where: { reportId }
      });

      // Delete report shares
      await tx.reportShare.deleteMany({
        where: { reportId }
      });

      // Delete scheduled executions
      await tx.scheduledExecution.deleteMany({
        where: { reportId }
      });

      // Delete the report
      await tx.analyticsReport.delete({
        where: { id: reportId }
      });
    });

    // Log report deletion
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'analytics_report_deleted',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          reportId,
          reportName: report.name,
          category: report.category,
          type: report.type
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Analytics report deleted successfully'
    });

  } catch (error) {
    console.error('Analytics report deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete analytics report' },
      { status: 500 }
    );
  }
}

// Helper functions
async function validateDataSource(dataSource: any, userId: string) {
  try {
    switch (dataSource.type) {
      case 'database':
        return await validateDatabaseSource(dataSource, userId);
      case 'api':
        return await validateApiSource(dataSource, userId);
      case 'mixed':
        return await validateMixedSource(dataSource, userId);
      case 'event_stream':
        return await validateEventStreamSource(dataSource, userId);
      default:
        return { valid: false, error: `Unsupported data source type: ${dataSource.type}` };
    }
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}

async function validateDatabaseSource(dataSource: any, userId: string) {
  // Validate database access and table permissions
  if (!dataSource.tables || dataSource.tables.length === 0) {
    return { valid: false, error: 'At least one table must be specified' };
  }

  // Check if user has access to specified tables
  // This would integrate with your database permission system
  const allowedTables = [
    'users', 'projects', 'chats', 'generatedApps', 'usage', 
    'auditLogs', 'analyticsEvents', 'dashboards', 'teams'
  ];

  const invalidTables = dataSource.tables.filter((table: string) => 
    !allowedTables.includes(table)
  );

  if (invalidTables.length > 0) {
    return { 
      valid: false, 
      error: `Access denied to tables: ${invalidTables.join(', ')}` 
    };
  }

  return { valid: true };
}

async function validateApiSource(dataSource: any, userId: string) {
  if (!dataSource.queries || dataSource.queries.length === 0) {
    return { valid: false, error: 'At least one API query must be specified' };
  }

  // Validate API endpoints
  for (const query of dataSource.queries) {
    if (!query.endpoint) {
      return { valid: false, error: 'API endpoint is required for each query' };
    }

    try {
      const url = new URL(query.endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS endpoints are allowed' };
      }
    } catch (error) {
      return { valid: false, error: `Invalid endpoint URL: ${query.endpoint}` };
    }
  }

  return { valid: true };
}

async function validateMixedSource(dataSource: any, userId: string) {
  // Validate both database and API components
  const dbResult = await validateDatabaseSource(dataSource, userId);
  if (!dbResult.valid) return dbResult;

  const apiResult = await validateApiSource(dataSource, userId);
  if (!apiResult.valid) return apiResult;

  return { valid: true };
}

async function validateEventStreamSource(dataSource: any, userId: string) {
  // Validate event stream configuration
  if (!dataSource.queries || dataSource.queries.length === 0) {
    return { valid: false, error: 'Event stream configuration is required' };
  }

  return { valid: true };
}

async function executeReport(reportId: string, userId: string) {
  try {
    const report = await prisma.analyticsReport.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      return { status: 'failed', error: 'Report not found' };
    }

    const startTime = Date.now();

    // Create execution record
    const execution = await prisma.reportExecution.create({
      data: {
        reportId,
        userId,
        status: 'running',
        startedAt: new Date()
      }
    });

    // Execute the report (simplified implementation)
    const results = await processReportData(report.dataSource, report.dimensions, report.metrics);
    const executionTime = Date.now() - startTime;

    // Update execution record
    await prisma.reportExecution.update({
      where: { id: execution.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        executionTime,
        results,
        rowCount: results.data ? results.data.length : 0
      }
    });

    return {
      status: 'completed',
      executionId: execution.id,
      executionTime,
      rowCount: results.data ? results.data.length : 0
    };

  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function processReportData(dataSource: any, dimensions: any[], metrics: any[]) {
  // This would contain the actual data processing logic
  // For now, return mock data
  return {
    data: [
      { date: '2024-01-01', users: 1000, revenue: 50000 },
      { date: '2024-01-02', users: 1100, revenue: 55000 },
      { date: '2024-01-03', users: 950, revenue: 47500 }
    ],
    metadata: {
      totalRows: 3,
      executionTime: 150,
      cacheHit: false
    }
  };
}