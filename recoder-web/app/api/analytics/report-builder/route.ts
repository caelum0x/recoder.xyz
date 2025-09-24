// Report builder API for generating custom analytics reports
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for report operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

// Report configuration schema
const reportSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['summary', 'detailed', 'comparison', 'trend', 'custom']),
  dataSources: z.array(z.enum(['projects', 'usage', 'deployments', 'analytics', 'users', 'performance'])),
  metrics: z.array(z.object({
    field: z.string(),
    aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max', 'distinct']),
    alias: z.string().optional(),
  })),
  dimensions: z.array(z.string()).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'between']),
    value: z.any(),
  })).optional(),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    granularity: z.enum(['hour', 'day', 'week', 'month', 'quarter', 'year']).default('day'),
  }),
  groupBy: z.array(z.string()).optional(),
  orderBy: z.array(z.object({
    field: z.string(),
    direction: z.enum(['asc', 'desc']).default('desc'),
  })).optional(),
  format: z.enum(['json', 'csv', 'pdf', 'excel']).default('json'),
  schedule: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
    recipients: z.array(z.string().email()).optional(),
    timezone: z.string().default('UTC'),
  }).optional(),
  visualization: z.object({
    type: z.enum(['table', 'line', 'bar', 'pie', 'area', 'scatter']).default('table'),
    config: z.record(z.any()).optional(),
  }).optional(),
});

const generateReportSchema = z.object({
  reportId: z.string().optional(),
  reportConfig: reportSchema.optional(),
  format: z.enum(['json', 'csv', 'pdf', 'excel']).default('json'),
  includeCharts: z.boolean().default(false),
});

// Helper function to generate CSV content
function generateCSV(data: any[], headers: string[]): string {
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value?.toString() || '';
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
}

// Helper function to build aggregation queries
function buildAggregationQuery(metrics: any[], datasource: string) {
  const aggregations: any = {};
  
  metrics.forEach(metric => {
    const alias = metric.alias || `${metric.field}_${metric.aggregation}`;
    
    switch (metric.aggregation) {
      case 'count':
        aggregations[alias] = { _count: metric.field === '*' ? true : { [metric.field]: true } };
        break;
      case 'sum':
        aggregations[alias] = { _sum: { [metric.field]: true } };
        break;
      case 'avg':
        aggregations[alias] = { _avg: { [metric.field]: true } };
        break;
      case 'min':
        aggregations[alias] = { _min: { [metric.field]: true } };
        break;
      case 'max':
        aggregations[alias] = { _max: { [metric.field]: true } };
        break;
    }
  });
  
  return aggregations;
}

// Helper function to apply filters
function buildWhereClause(filters: any[], userId: string) {
  const where: any = { userId };
  
  if (!filters || filters.length === 0) return where;
  
  const conditions: any[] = [];
  
  filters.forEach(filter => {
    const condition: any = {};
    
    switch (filter.operator) {
      case 'equals':
        condition[filter.field] = filter.value;
        break;
      case 'contains':
        condition[filter.field] = { contains: filter.value, mode: 'insensitive' };
        break;
      case 'gt':
        condition[filter.field] = { gt: filter.value };
        break;
      case 'gte':
        condition[filter.field] = { gte: filter.value };
        break;
      case 'lt':
        condition[filter.field] = { lt: filter.value };
        break;
      case 'lte':
        condition[filter.field] = { lte: filter.value };
        break;
      case 'in':
        condition[filter.field] = { in: Array.isArray(filter.value) ? filter.value : [filter.value] };
        break;
      case 'between':
        if (Array.isArray(filter.value) && filter.value.length === 2) {
          condition[filter.field] = { gte: filter.value[0], lte: filter.value[1] };
        }
        break;
    }
    
    conditions.push(condition);
  });
  
  if (conditions.length > 0) {
    where.AND = conditions;
  }
  
  return where;
}

// GET - Get saved reports
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'report-read');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user settings with saved reports
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: (session?.user as any)?.id },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const savedReports = preferences.savedReports || [];

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    // Filter reports
    let filteredReports = savedReports;

    if (search) {
      filteredReports = filteredReports.filter((report: any) =>
        report.name.toLowerCase().includes(search.toLowerCase()) ||
        report.description?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (type) {
      filteredReports = filteredReports.filter((report: any) => report.type === type);
    }

    // Paginate results
    const startIndex = (page - 1) * limit;
    const paginatedReports = filteredReports.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      reports: paginatedReports,
      pagination: {
        page,
        limit,
        total: filteredReports.length,
        pages: Math.ceil(filteredReports.length / limit),
      },
      summary: {
        totalReports: savedReports.length,
        reportTypes: [...new Set(savedReports.map((r: any) => r.type))],
        scheduledReports: savedReports.filter((r: any) => r.schedule?.enabled).length,
      },
    });

  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save a new report or generate a report
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 15, 'report-operation');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'save';

    if (action === 'save') {
      return await handleSaveReport(request, (session?.user as any)?.id);
    } else if (action === 'generate') {
      return await handleGenerateReport(request, (session?.user as any)?.id);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "save" or "generate"' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Report operation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle saving a new report
async function handleSaveReport(request: NextRequest, userId: string) {
  const body = await request.json();
  const validatedData = reportSchema.parse(body);

  // Get user settings
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { preferences: true }
  });

  const preferences = (userSettings?.preferences as any) || {};
  const savedReports = preferences.savedReports || [];

  // Create new report
  const newReport = {
    id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: validatedData.name,
    description: validatedData.description,
    type: validatedData.type,
    dataSources: validatedData.dataSources,
    metrics: validatedData.metrics,
    dimensions: validatedData.dimensions,
    filters: validatedData.filters,
    dateRange: validatedData.dateRange,
    groupBy: validatedData.groupBy,
    orderBy: validatedData.orderBy,
    format: validatedData.format,
    schedule: validatedData.schedule,
    visualization: validatedData.visualization,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: userId,
    lastGenerated: null,
    generationCount: 0,
  };

  // Add to saved reports
  const updatedReports = [...savedReports, newReport];

  // Update preferences
  const updatedPreferences = {
    ...preferences,
    savedReports: updatedReports
  };

  await prisma.userSettings.upsert({
    where: { userId },
    update: { preferences: updatedPreferences },
    create: {
      userId,
      preferences: updatedPreferences,
      // limits: {}, // Field doesn't exist
    }
  });

  // Log report creation
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'report_saved',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        reportId: newReport.id,
        reportName: newReport.name,
        reportType: newReport.type,
        dataSources: newReport.dataSources,
      },
    },
  });

  return NextResponse.json({
    message: 'Report saved successfully',
    report: newReport,
  }, { status: 201 });
}

// Handle generating a report
async function handleGenerateReport(request: NextRequest, userId: string) {
  const body = await request.json();
  const validatedData = generateReportSchema.parse(body);

  let reportConfig: any = {};

  // Get report configuration
  if (validatedData.reportId) {
    // Load saved report
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { preferences: true }
    });

    const preferences = (userSettings?.preferences as any) || {};
    const savedReports = preferences.savedReports || [];
    const savedReport = savedReports.find((r: any) => r.id === validatedData.reportId);

    if (!savedReport) {
      return NextResponse.json(
        { error: 'Saved report not found' },
        { status: 404 }
      );
    }

    reportConfig = savedReport;
  } else if (validatedData.reportConfig) {
    reportConfig = validatedData.reportConfig;
  } else {
    return NextResponse.json(
      { error: 'Either reportId or reportConfig must be provided' },
      { status: 400 }
    );
  }

  // Generate report data
  const reportData = await generateReportData(reportConfig, userId);

  // Format data based on requested format
  let formattedData: any;
  let contentType = 'application/json';
  let filename = `report_${Date.now()}`;

  switch (validatedData.format) {
    case 'csv':
      if (reportData.data.length > 0) {
        const headers = Object.keys(reportData.data[0]);
        formattedData = generateCSV(reportData.data, headers);
        contentType = 'text/csv';
        filename += '.csv';
      } else {
        formattedData = 'No data available';
      }
      break;
    case 'json':
    default:
      formattedData = reportData;
      filename += '.json';
      break;
  }

  // Update generation count if it's a saved report
  if (validatedData.reportId) {
    await updateReportGenerationCount(validatedData.reportId, userId);
  }

  // Log report generation
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'report_generated',
      platform: 'web',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: true,
      metadata: {
        reportId: validatedData.reportId,
        format: validatedData.format,
        recordCount: reportData.summary?.totalRecords || 0,
        dataSources: reportConfig.dataSources,
      },
    },
  });

  if (validatedData.format === 'csv') {
    return new NextResponse(formattedData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({
    message: 'Report generated successfully',
    data: formattedData,
    metadata: {
      generatedAt: new Date().toISOString(),
      format: validatedData.format,
      recordCount: reportData.summary?.totalRecords || 0,
      reportConfig: {
        name: reportConfig.name,
        type: reportConfig.type,
        dataSources: reportConfig.dataSources,
        dateRange: reportConfig.dateRange,
      },
    },
  });
}

// Generate actual report data
async function generateReportData(reportConfig: any, userId: string) {
  const where = buildWhereClause(reportConfig.filters || [], userId);
  const dateRange = {
    createdAt: {
      gte: new Date(reportConfig.dateRange.start),
      lte: new Date(reportConfig.dateRange.end),
    },
  };

  let data: any[] = [];
  let summary: any = {};

  // Process each data source
  for (const dataSource of reportConfig.dataSources) {
    let sourceData: any[] = [];

    switch (dataSource) {
      case 'projects':
        sourceData = await prisma.project.findMany({
          where: { ...where, ...dateRange },
          select: {
            id: true,
            name: true,
            status: true,
            framework: true,
            language: true,
            visibility: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                deploymentHistory: true,
                // mediaFiles: true, // Field doesn't exist
              },
            },
          },
          orderBy: reportConfig.orderBy?.map((o: any) => ({ [o.field]: o.direction })) || [{ createdAt: 'desc' }],
        });
        break;

      case 'usage':
        sourceData = await prisma.usageAnalytics.findMany({
          where: { ...where, date: dateRange.createdAt },
          orderBy: reportConfig.orderBy?.map((o: any) => ({ [o.field]: o.direction })) || [{ date: 'desc' }],
        });
        break;
    }

    data = [...data, ...sourceData];
  }

  // Calculate summary statistics
  summary = {
    totalRecords: data.length,
    dataSources: reportConfig.dataSources,
    dateRange: reportConfig.dateRange,
    generatedAt: new Date().toISOString(),
  };

  // Apply grouping if specified
  if (reportConfig.groupBy && reportConfig.groupBy.length > 0) {
    const grouped = data.reduce((acc, item) => {
      const key = reportConfig.groupBy.map((field: string) => item[field]).join('|');
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});

    data = Object.entries(grouped).map(([key, items]: [string, any]) => ({
      groupKey: key,
      count: items.length,
      items,
    }));
  }

  return {
    data,
    summary,
    config: reportConfig,
  };
}

// Update report generation count
async function updateReportGenerationCount(reportId: string, userId: string) {
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { preferences: true }
  });

  const preferences = (userSettings?.preferences as any) || {};
  const savedReports = preferences.savedReports || [];

  const reportIndex = savedReports.findIndex((r: any) => r.id === reportId);
  if (reportIndex >= 0) {
    savedReports[reportIndex].lastGenerated = new Date().toISOString();
    savedReports[reportIndex].generationCount = (savedReports[reportIndex].generationCount || 0) + 1;

    const updatedPreferences = {
      ...preferences,
      savedReports
    };

    await prisma.userSettings.upsert({
      where: { userId },
      update: { preferences: updatedPreferences },
      create: {
        userId,
        preferences: updatedPreferences,
        // limits: {}, // Field doesn't exist
      }
    });
  }
}

export const runtime = "nodejs";
