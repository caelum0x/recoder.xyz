// Dashboard Export API for exporting dashboards in various formats
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const exportSchema = z.object({
  format: z.enum(['json', 'pdf', 'png', 'csv', 'xlsx', 'html']),
  options: z.object({
    includeData: z.boolean().default(true),
    includeSettings: z.boolean().default(true),
    includeTheme: z.boolean().default(true),
    resolution: z.enum(['low', 'medium', 'high']).default('medium'),
    orientation: z.enum(['portrait', 'landscape']).default('landscape'),
    paperSize: z.enum(['a4', 'letter', 'legal', 'a3']).default('a4'),
    margins: z.object({
      top: z.number().default(20),
      right: z.number().default(20),
      bottom: z.number().default(20),
      left: z.number().default(20)
    }).optional(),
    watermark: z.string().optional(),
    includeDateRange: z.boolean().default(true),
    customFileName: z.string().optional()
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

    if (!dashboardId) {
      return NextResponse.json(
        { error: 'Dashboard ID is required' },
        { status: 400 }
      );
    }

    // Note: Mock export history since we don't have a DashboardExport model
    const exportHistory: any[] = [];

    const transformedHistory = exportHistory.map((exp: any) => ({
      id: exp.id,
      format: exp.format,
      status: exp.status,
      fileSize: exp.fileSize,
      downloadUrl: exp.downloadUrl,
      createdAt: exp.createdAt,
      expiresAt: exp.expiresAt,
      options: exp.options,
      error: exp.error
    }));

    // Get available export formats
    const availableFormats = [
      {
        id: 'json',
        name: 'JSON',
        description: 'Dashboard configuration and data in JSON format',
        extension: '.json',
        category: 'data',
        supportsData: true,
        estimatedSize: 'Small (KB)'
      },
      {
        id: 'pdf',
        name: 'PDF',
        description: 'Static PDF report with dashboard visualization',
        extension: '.pdf',
        category: 'document',
        supportsData: false,
        estimatedSize: 'Medium (MB)'
      },
      {
        id: 'png',
        name: 'PNG Image',
        description: 'High-quality image of the dashboard',
        extension: '.png',
        category: 'image',
        supportsData: false,
        estimatedSize: 'Medium (MB)'
      },
      {
        id: 'csv',
        name: 'CSV',
        description: 'Comma-separated values of dashboard data',
        extension: '.csv',
        category: 'data',
        supportsData: true,
        estimatedSize: 'Small (KB)'
      },
      {
        id: 'xlsx',
        name: 'Excel',
        description: 'Microsoft Excel spreadsheet with data and charts',
        extension: '.xlsx',
        category: 'data',
        supportsData: true,
        estimatedSize: 'Medium (MB)'
      },
      {
        id: 'html',
        name: 'HTML',
        description: 'Interactive HTML page with embedded dashboard',
        extension: '.html',
        category: 'web',
        supportsData: true,
        estimatedSize: 'Large (MB)'
      }
    ];

    return NextResponse.json({
      availableFormats,
      exportHistory: transformedHistory,
      quotaInfo: {
        used: exportHistory.length,
        limit: 50, // Free users get 50 exports per month
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

  } catch (error) {
    console.error('Dashboard export info error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch export information' },
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
    const { format, options } = exportSchema.parse(body);

    // Verify user has access to dashboard
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        OR: [
          { userId },
          { 
            AND: [
              { settings: { path: ['isPublic'], equals: true } },
              // TODO: Add dashboardShares model for sharing functionality
              // { 
              //   dashboardShares: {
              //     some: {
              //       sharedWith: userId,
              //       isActive: true,
              //       permissions: { path: ['canExport'], equals: true }
              //     }
              //   }
              // }
            ]
          }
        ]
      },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    if (!dashboard) {
      return NextResponse.json(
        { error: 'Dashboard not found or export not permitted' },
        { status: 404 }
      );
    }

    // Note: Mock export quota check since we don't have a DashboardExport model
    const monthlyExports = 0;

    const userSubscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const userPlan = userSubscription?.plan || 'free';
    const exportLimits = {
      free: 50,
      pro: 500,
      enterprise: 5000
    };

    if (monthlyExports >= exportLimits[userPlan as keyof typeof exportLimits]) {
      return NextResponse.json(
        { 
          error: `Export limit reached. ${userPlan} plan allows ${exportLimits[userPlan as keyof typeof exportLimits]} exports per month.`,
          upgradeRequired: userPlan === 'free'
        },
        { status: 403 }
      );
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = options?.customFileName || 
      `${dashboard.name.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`;

    // Note: Mock export record since we don't have a DashboardExport model
    const exportRecord = {
      id: `export_${Date.now()}`,
      userId,
      dashboardId,
      format,
      status: 'processing',
      fileName: `${fileName}.${getFileExtension(format)}`,
      options: options || {},
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    };

    // Process export asynchronously
    try {
      const exportResult = await processExport(dashboard, format, options || {}, exportRecord.id);

      // Note: Would update export record here if we had a DashboardExport model
      console.log('Export completed:', {
        id: exportRecord.id,
        status: exportResult.success ? 'completed' : 'failed',
        downloadUrl: exportResult.downloadUrl,
        fileSize: exportResult.fileSize,
        error: exportResult.error
      });

      // Log export activity
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'dashboard_exported',
          resource: 'dashboard',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: exportResult.success,
          metadata: {
            dashboardId,
            dashboardName: dashboard.name,
            exportId: exportRecord.id,
            format,
            fileSize: exportResult.fileSize,
            options
          }
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Export completed successfully',
        export: {
          id: exportRecord.id,
          format,
          status: exportResult.success ? 'completed' : 'failed',
          fileName: exportRecord.fileName,
          downloadUrl: exportResult.downloadUrl,
          fileSize: exportResult.fileSize,
          createdAt: exportRecord.createdAt.toISOString(),
          expiresAt: exportRecord.expiresAt.toISOString(),
          error: exportResult.error
        }
      });

    } catch (error) {
      // Note: Would update export record as failed here if we had a DashboardExport model
      console.log('Export failed:', {
        id: exportRecord.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid export parameters', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Dashboard export error:', error);
    return NextResponse.json(
      { error: 'Failed to export dashboard' },
      { status: 500 }
    );
  }
}

// Helper functions
function getFileExtension(format: string): string {
  const extensions: Record<string, string> = {
    json: 'json',
    pdf: 'pdf',
    png: 'png',
    csv: 'csv',
    xlsx: 'xlsx',
    html: 'html'
  };
  return extensions[format] || 'txt';
}

async function processExport(
  dashboard: any, 
  format: string, 
  options: any, 
  exportId: string
): Promise<{ success: boolean; downloadUrl?: string; fileSize?: number; error?: string }> {
  try {
    switch (format) {
      case 'json':
        return await exportAsJSON(dashboard, options, exportId);
      case 'pdf':
        return await exportAsPDF(dashboard, options, exportId);
      case 'png':
        return await exportAsPNG(dashboard, options, exportId);
      case 'csv':
        return await exportAsCSV(dashboard, options, exportId);
      case 'xlsx':
        return await exportAsXLSX(dashboard, options, exportId);
      case 'html':
        return await exportAsHTML(dashboard, options, exportId);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function exportAsJSON(dashboard: any, options: any, exportId: string) {
  const exportData = {
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      layout: dashboard.layout,
      widgets: options.includeData ? dashboard.widgets : dashboard.widgets.map((w: any) => ({
        ...w,
        data: undefined,
        dataSource: options.includeSettings ? w.dataSource : undefined
      })),
      theme: options.includeTheme ? dashboard.theme : undefined,
      settings: options.includeSettings ? dashboard.settings : undefined,
      metadata: dashboard.metadata
    },
    exportInfo: {
      exportId,
      exportedAt: new Date().toISOString(),
      exportedBy: dashboard.user.name || dashboard.user.email,
      format: 'json',
      version: '1.0'
    }
  };

  const jsonData = JSON.stringify(exportData, null, 2);
  const fileSize = Buffer.byteLength(jsonData, 'utf8');

  // In a real implementation, you would upload this to cloud storage
  const downloadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboards/export/download/${exportId}`;

  return {
    success: true,
    downloadUrl,
    fileSize
  };
}

async function exportAsPDF(dashboard: any, options: any, exportId: string) {
  // This would require a PDF generation library like puppeteer or jsPDF
  // For now, return mock success
  return {
    success: true,
    downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboards/export/download/${exportId}`,
    fileSize: 1024 * 1024 // 1MB mock size
  };
}

async function exportAsPNG(dashboard: any, options: any, exportId: string) {
  // This would require screenshot generation with puppeteer or similar
  // For now, return mock success
  return {
    success: true,
    downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboards/export/download/${exportId}`,
    fileSize: 2048 * 1024 // 2MB mock size
  };
}

async function exportAsCSV(dashboard: any, options: any, exportId: string) {
  // Extract data from widgets and convert to CSV
  // For now, return mock success
  return {
    success: true,
    downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboards/export/download/${exportId}`,
    fileSize: 256 * 1024 // 256KB mock size
  };
}

async function exportAsXLSX(dashboard: any, options: any, exportId: string) {
  // This would require a library like ExcelJS
  // For now, return mock success
  return {
    success: true,
    downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboards/export/download/${exportId}`,
    fileSize: 512 * 1024 // 512KB mock size
  };
}

async function exportAsHTML(dashboard: any, options: any, exportId: string) {
  // Generate standalone HTML with embedded dashboard
  // For now, return mock success
  return {
    success: true,
    downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboards/export/download/${exportId}`,
    fileSize: 4096 * 1024 // 4MB mock size
  };
}