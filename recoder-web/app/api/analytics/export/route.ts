import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for export operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100, // Lower limit for resource-intensive operations
});

const exportRequestSchema = z.object({
  format: z.enum(['pdf', 'csv', 'excel', 'json']),
  timeRange: z.enum(['1h', '24h', '7d', '30d', '90d']),
  metrics: z.array(z.string()),
  dashboard: z.string().optional(),
  includeCharts: z.boolean().optional().default(false),
});

// POST /api/analytics/export - Export analytics data in various formats
export async function POST(request: NextRequest) {
  try {
    // Rate limiting with lower threshold for exports
    try {
      await limiter.check(request, 5, 'analytics-export');
    } catch {
      return NextResponse.json(
        { error: 'Too many export requests. Please try again later.' },
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
      validatedData = exportRequestSchema.parse(body);
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

    // Generate analytics data for export
    const analyticsData = await generateExportData(
      session.user.id,
      validatedData.timeRange,
      validatedData.metrics,
      validatedData.dashboard
    );

    let exportContent: string | Buffer;
    let contentType: string;
    let filename: string;

    // Generate export content based on format
    switch (validatedData.format) {
      case 'json':
        exportContent = JSON.stringify(analyticsData, null, 2);
        contentType = 'application/json';
        filename = `analytics_${validatedData.timeRange}.json`;
        break;

      case 'csv':
        exportContent = generateCSV(analyticsData);
        contentType = 'text/csv';
        filename = `analytics_${validatedData.timeRange}.csv`;
        break;

      case 'excel':
        exportContent = await generateExcel(analyticsData);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `analytics_${validatedData.timeRange}.xlsx`;
        break;

      case 'pdf':
        exportContent = await generatePDF(analyticsData, validatedData.includeCharts);
        contentType = 'application/pdf';
        filename = `analytics_report_${validatedData.timeRange}.pdf`;
        break;

      default:
        return NextResponse.json(
          { error: 'Unsupported export format' },
          { status: 400 }
        );
    }

    // Log export event
    await logExportEvent(session.user.id, 'analytics_exported', {
      format: validatedData.format,
      timeRange: validatedData.timeRange,
      metricsCount: validatedData.metrics.length,
      dataSize: exportContent.length,
      timestamp: new Date().toISOString(),
    });

    // Return file as download
    return new NextResponse(exportContent as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': exportContent.length.toString(),
      },
    });

  } catch (error) {
    console.error('Analytics export error:', error);
    return NextResponse.json(
      { error: 'Failed to export analytics data' },
      { status: 500 }
    );
  }
}

// Helper function to generate export data
async function generateExportData(
  userId: string, 
  timeRange: string, 
  metrics: string[], 
  dashboard?: string
) {
  // In production, this would query actual analytics data
  const mockData = {
    metadata: {
      userId,
      timeRange,
      exportedAt: new Date().toISOString(),
      dashboard: dashboard || 'default',
      metricsRequested: metrics,
    },
    summary: {
      totalSessions: 15247,
      activeUsers: 3421,
      aiRequests: 89432,
      successRate: 94.7,
      avgResponseTime: 2.3,
      costSavings: 15420,
    },
    timeSeries: generateTimeSeriesData(timeRange),
    featureUsage: {
      'Code Generation': 4521,
      'AI Chat': 3892,
      'Code Review': 2156,
      'Template Generation': 1823,
      'Deployment': 1204,
    },
    aiProviders: {
      'Claude': { requests: 45230, cost: 1204.50, successRate: 96.2 },
      'GPT-4': { requests: 32145, cost: 892.30, successRate: 93.8 },
      'Groq': { requests: 12057, cost: 234.20, successRate: 94.1 },
    },
    userSegments: [
      { segment: 'Power Users', count: 234, percentage: 15.3 },
      { segment: 'Regular Users', count: 1205, percentage: 78.9 },
      { segment: 'New Users', count: 89, percentage: 5.8 },
    ],
    topFeatures: [
      { feature: 'JavaScript Generation', usage: 12450 },
      { feature: 'React Components', usage: 8923 },
      { feature: 'API Endpoints', usage: 6712 },
      { feature: 'Database Queries', usage: 4556 },
      { feature: 'CSS Styling', usage: 3401 },
    ]
  };

  return mockData;
}

function generateTimeSeriesData(timeRange: string) {
  const days = getTimeRangeDays(timeRange);
  const data: Array<{
    date: string;
    sessions: number;
    aiRequests: number;
    errors: number;
    cost: number;
  }> = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    data.push({
      date: date.toISOString().split('T')[0],
      sessions: Math.floor(Math.random() * 500) + 200,
      aiRequests: Math.floor(Math.random() * 2000) + 1000,
      errors: Math.floor(Math.random() * 20) + 5,
      cost: Math.floor(Math.random() * 100) + 50,
    });
  }
  
  return data;
}

function getTimeRangeDays(timeRange: string): number {
  switch (timeRange) {
    case '1h': return 1;
    case '24h': return 1;
    case '7d': return 7;
    case '30d': return 30;
    case '90d': return 90;
    default: return 7;
  }
}

function generateCSV(data: any): string {
  const csvRows: string[] = [];
  
  // Add metadata
  csvRows.push('Analytics Export Report');
  csvRows.push(`Exported At,${data.metadata.exportedAt}`);
  csvRows.push(`Time Range,${data.metadata.timeRange}`);
  csvRows.push('');
  
  // Add summary
  csvRows.push('Summary Metrics');
  csvRows.push('Metric,Value');
  Object.entries(data.summary).forEach(([key, value]) => {
    csvRows.push(`${key},${value}`);
  });
  csvRows.push('');
  
  // Add time series data
  csvRows.push('Time Series Data');
  if (data.timeSeries.length > 0) {
    const headers = Object.keys(data.timeSeries[0]);
    csvRows.push(headers.join(','));
    data.timeSeries.forEach((row: any) => {
      csvRows.push(headers.map(h => row[h]).join(','));
    });
  }
  csvRows.push('');
  
  // Add feature usage
  csvRows.push('Feature Usage');
  csvRows.push('Feature,Usage');
  Object.entries(data.featureUsage).forEach(([feature, usage]) => {
    csvRows.push(`${feature},${usage}`);
  });
  
  return csvRows.join('\n');
}

async function generateExcel(data: any): Promise<Buffer> {
  // In production, use a library like ExcelJS to create actual Excel files
  // For now, return CSV content as a simple implementation
  const csvContent = generateCSV(data);
  return Buffer.from(csvContent, 'utf8');
}

async function generatePDF(data: any, includeCharts: boolean = false): Promise<Buffer> {
  // In production, use a library like PDFKit or Puppeteer to generate actual PDFs
  // For now, return a simple HTML-to-text conversion
  const htmlContent = `
    <html>
      <head><title>Analytics Report</title></head>
      <body>
        <h1>Analytics Export Report</h1>
        <p>Exported at: ${data.metadata.exportedAt}</p>
        <p>Time Range: ${data.metadata.timeRange}</p>
        
        <h2>Summary Metrics</h2>
        <ul>
          ${Object.entries(data.summary).map(([key, value]) => 
            `<li>${key}: ${value}</li>`
          ).join('')}
        </ul>
        
        <h2>Feature Usage</h2>
        <ul>
          ${Object.entries(data.featureUsage).map(([feature, usage]) => 
            `<li>${feature}: ${usage}</li>`
          ).join('')}
        </ul>
        
        <h2>AI Provider Performance</h2>
        <ul>
          ${Object.entries(data.aiProviders).map(([provider, stats]: [string, any]) => 
            `<li>${provider}: ${stats.requests} requests, $${stats.cost}, ${stats.successRate}% success rate</li>`
          ).join('')}
        </ul>
      </body>
    </html>
  `;
  
  return Buffer.from(htmlContent, 'utf8');
}

async function logExportEvent(userId: string, event: string, metadata: any): Promise<void> {
  try {
    // In production, this would write to audit log table
    console.log(`Export Event - User ${userId}: ${event}`, metadata);
  } catch (error) {
    console.error('Failed to log export event:', error);
  }
}

export const runtime = "edge";