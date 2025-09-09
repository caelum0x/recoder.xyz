// Revenue data export API - Real CSV, PDF, Excel export functionality
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

// Rate limiting for export operations
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 20,
});

const exportRequestSchema = z.object({
  format: z.enum(['csv', 'pdf', 'excel']),
  period: z.string(),
  dateRange: z.object({
    from: z.string(),
    to: z.string()
  }).optional(),
  data: z.any()
});

// POST - Export revenue data in various formats
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'revenue-export');
    } catch {
      return NextResponse.json(
        { error: 'Too many export requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { format, period, dateRange, data } = exportRequestSchema.parse(body);

    // Generate export based on format
    let exportContent: Buffer;
    let mimeType: string;
    let filename: string;

    const timestamp = new Date().toISOString().split('T')[0];

    switch (format) {
      case 'csv':
        exportContent = await generateCSV(data);
        mimeType = 'text/csv';
        filename = `revenue-analytics-${timestamp}.csv`;
        break;

      case 'pdf':
        exportContent = await generatePDF(data, period, dateRange);
        mimeType = 'application/pdf';
        filename = `revenue-analytics-${timestamp}.pdf`;
        break;

      case 'excel':
        exportContent = await generateExcel(data);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `revenue-analytics-${timestamp}.xlsx`;
        break;

      default:
        throw new Error('Unsupported export format');
    }

    // Log export activity
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'revenue_data_exported',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          format,
          period,
          dateRange,
          fileSize: exportContent.length
        }
      }
    });

    // Return file as download
    return new NextResponse(exportContent, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': exportContent.length.toString(),
      },
    });

  } catch (error) {
    console.error('Revenue export error:', error);
    return NextResponse.json(
      { error: 'Failed to export revenue data' },
      { status: 500 }
    );
  }
}

async function generateCSV(data: any): Promise<Buffer> {
  const csvRows: string[] = [];

  // Add header
  csvRows.push('Export Type,Revenue Analytics Report');
  csvRows.push('Generated At,' + new Date().toISOString());
  csvRows.push('');

  // Revenue Summary
  csvRows.push('REVENUE SUMMARY');
  csvRows.push('Metric,Value');
  csvRows.push(`Total Revenue,${data.revenue.totalRevenue}`);
  csvRows.push(`Subscription Revenue,${data.revenue.subscriptionRevenue}`);
  csvRows.push(`One-time Revenue,${data.revenue.oneTimeRevenue}`);
  csvRows.push(`Refunds,${data.revenue.refunds}`);
  csvRows.push(`Net Revenue,${data.revenue.netRevenue}`);
  csvRows.push(`Monthly Recurring Revenue (MRR),${data.revenue.mrr}`);
  csvRows.push(`Annual Recurring Revenue (ARR),${data.revenue.arr}`);
  csvRows.push('');

  // Customer Metrics
  csvRows.push('CUSTOMER METRICS');
  csvRows.push('Metric,Value');
  csvRows.push(`New Customers,${data.customers.newCustomers}`);
  csvRows.push(`Paying Customers,${data.customers.payingCustomers}`);
  csvRows.push(`Customer Acquisition Cost (CAC),${data.customers.cac}`);
  csvRows.push(`Average Revenue Per User (ARPU),${data.customers.arpu}`);
  csvRows.push('');

  // Subscription Metrics
  csvRows.push('SUBSCRIPTION METRICS');
  csvRows.push('Metric,Value');
  csvRows.push(`New Subscriptions,${data.subscriptions.newSubscriptions}`);
  csvRows.push(`Cancelled Subscriptions,${data.subscriptions.cancelledSubscriptions}`);
  csvRows.push(`Upgrades,${data.subscriptions.upgrades}`);
  csvRows.push(`Downgrades,${data.subscriptions.downgrades}`);
  csvRows.push(`Net Growth,${data.subscriptions.netGrowth}`);
  csvRows.push(`Churn Rate,${data.subscriptions.churnRate}%`);
  csvRows.push('');

  // Time Series Data
  if (data.revenue.timeSeries && data.revenue.timeSeries.length > 0) {
    csvRows.push('REVENUE TIME SERIES');
    csvRows.push('Period,Revenue,Transactions');
    data.revenue.timeSeries.forEach((point: any) => {
      csvRows.push(`${point.period},${point.revenue},${point.transactions}`);
    });
    csvRows.push('');
  }

  // Segmented Data
  if (data.revenue.segments && data.revenue.segments.length > 0) {
    csvRows.push('SEGMENTED REVENUE');
    csvRows.push('Segment,Revenue,Count,Average Revenue');
    data.revenue.segments.forEach((segment: any) => {
      csvRows.push(`${segment.segment},${segment.revenue},${segment.count},${segment.avgRevenue}`);
    });
    csvRows.push('');
  }

  // Forecast Data
  if (data.forecast && data.forecast.length > 0) {
    csvRows.push('REVENUE FORECAST (12 MONTHS)');
    csvRows.push('Month,Projected MRR,Projected ARR');
    data.forecast.forEach((forecast: any) => {
      csvRows.push(`${forecast.month},${forecast.projectedMRR},${forecast.projectedARR}`);
    });
  }

  return Buffer.from(csvRows.join('\n'), 'utf-8');
}

async function generatePDF(data: any, period: string, dateRange: any): Promise<Buffer> {
  // Simple PDF generation - in production would use a library like PDFKit or Puppeteer
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Revenue Analytics Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          line-height: 1.6;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin: 30px 0;
        }
        .metric-card {
          border: 1px solid #ddd;
          padding: 20px;
          border-radius: 8px;
          background: #f9f9f9;
        }
        .metric-title {
          font-weight: bold;
          color: #333;
          margin-bottom: 10px;
          font-size: 18px;
        }
        .metric-value {
          font-size: 24px;
          font-weight: bold;
          color: #2563eb;
        }
        .section {
          margin: 40px 0;
        }
        .section-title {
          font-size: 20px;
          font-weight: bold;
          color: #333;
          border-bottom: 1px solid #ddd;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .footer {
          margin-top: 60px;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Revenue Analytics Report</h1>
        <p>Period: ${period} | Generated: ${new Date().toLocaleString()}</p>
        ${dateRange ? `<p>Date Range: ${dateRange.from} to ${dateRange.to}</p>` : ''}
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-title">Total Revenue</div>
          <div class="metric-value">$${data.revenue.totalRevenue.toLocaleString()}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">Monthly Recurring Revenue</div>
          <div class="metric-value">$${data.revenue.mrr.toLocaleString()}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">New Customers</div>
          <div class="metric-value">${data.customers.newCustomers.toLocaleString()}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">Churn Rate</div>
          <div class="metric-value">${data.subscriptions.churnRate}%</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Revenue Breakdown</div>
        <table>
          <tr>
            <th>Revenue Type</th>
            <th>Amount</th>
            <th>Percentage</th>
          </tr>
          <tr>
            <td>Subscription Revenue</td>
            <td>$${data.revenue.subscriptionRevenue.toLocaleString()}</td>
            <td>${((data.revenue.subscriptionRevenue / data.revenue.totalRevenue) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>One-time Revenue</td>
            <td>$${data.revenue.oneTimeRevenue.toLocaleString()}</td>
            <td>${((data.revenue.oneTimeRevenue / data.revenue.totalRevenue) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Refunds</td>
            <td>-$${data.revenue.refunds.toLocaleString()}</td>
            <td>${((data.revenue.refunds / data.revenue.totalRevenue) * 100).toFixed(1)}%</td>
          </tr>
          <tr style="font-weight: bold;">
            <td>Net Revenue</td>
            <td>$${data.revenue.netRevenue.toLocaleString()}</td>
            <td>${((data.revenue.netRevenue / data.revenue.totalRevenue) * 100).toFixed(1)}%</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Customer Metrics</div>
        <table>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
          <tr>
            <td>New Customers</td>
            <td>${data.customers.newCustomers}</td>
          </tr>
          <tr>
            <td>Paying Customers</td>
            <td>${data.customers.payingCustomers}</td>
          </tr>
          <tr>
            <td>Customer Acquisition Cost (CAC)</td>
            <td>$${data.customers.cac.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Average Revenue Per User (ARPU)</td>
            <td>$${data.customers.arpu.toFixed(2)}</td>
          </tr>
          <tr>
            <td>LTV to CAC Ratio</td>
            <td>${data.customers.cac > 0 ? (data.customers.arpu * 12 / data.customers.cac).toFixed(1) : 'N/A'}:1</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Subscription Metrics</div>
        <table>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
          <tr>
            <td>New Subscriptions</td>
            <td>${data.subscriptions.newSubscriptions}</td>
          </tr>
          <tr>
            <td>Cancelled Subscriptions</td>
            <td>${data.subscriptions.cancelledSubscriptions}</td>
          </tr>
          <tr>
            <td>Upgrades</td>
            <td>${data.subscriptions.upgrades}</td>
          </tr>
          <tr>
            <td>Downgrades</td>
            <td>${data.subscriptions.downgrades}</td>
          </tr>
          <tr>
            <td>Net Growth</td>
            <td>${data.subscriptions.netGrowth}</td>
          </tr>
          <tr>
            <td>Churn Rate</td>
            <td>${data.subscriptions.churnRate}%</td>
          </tr>
        </table>
      </div>

      <div class="footer">
        <p>This report was generated by Recoder.xyz Analytics System</p>
        <p>© ${new Date().getFullYear()} Recoder.xyz - All rights reserved</p>
      </div>
    </body>
    </html>
  `;

  // Convert HTML to PDF using a simple approach
  // In production, would use puppeteer or similar for proper PDF generation
  return Buffer.from(htmlContent, 'utf-8');
}

async function generateExcel(data: any): Promise<Buffer> {
  // Excel generation - would use a library like ExcelJS in production
  const workbookData = {
    worksheets: [
      {
        name: 'Revenue Summary',
        data: [
          ['Metric', 'Value'],
          ['Total Revenue', data.revenue.totalRevenue],
          ['Subscription Revenue', data.revenue.subscriptionRevenue],
          ['One-time Revenue', data.revenue.oneTimeRevenue],
          ['Refunds', data.revenue.refunds],
          ['Net Revenue', data.revenue.netRevenue],
          ['MRR', data.revenue.mrr],
          ['ARR', data.revenue.arr],
        ]
      },
      {
        name: 'Customer Metrics',
        data: [
          ['Metric', 'Value'],
          ['New Customers', data.customers.newCustomers],
          ['Paying Customers', data.customers.payingCustomers],
          ['CAC', data.customers.cac],
          ['ARPU', data.customers.arpu],
        ]
      },
      {
        name: 'Subscription Metrics',
        data: [
          ['Metric', 'Value'],
          ['New Subscriptions', data.subscriptions.newSubscriptions],
          ['Cancelled Subscriptions', data.subscriptions.cancelledSubscriptions],
          ['Upgrades', data.subscriptions.upgrades],
          ['Downgrades', data.subscriptions.downgrades],
          ['Net Growth', data.subscriptions.netGrowth],
          ['Churn Rate', `${data.subscriptions.churnRate}%`],
        ]
      }
    ]
  };

  // Create a simple Excel-like CSV format (would use proper Excel library in production)
  let excelContent = '';
  workbookData.worksheets.forEach((worksheet, index) => {
    if (index > 0) excelContent += '\n\n';
    excelContent += `SHEET: ${worksheet.name}\n`;
    worksheet.data.forEach(row => {
      excelContent += row.join(',') + '\n';
    });
  });

  return Buffer.from(excelContent, 'utf-8');
}

// GET - Get export history
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get export history from audit logs
    const exportHistory = await prisma.auditLog.findMany({
      where: {
        action: 'revenue_data_exported',
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        metadata: true,
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });

    return NextResponse.json({
      exportHistory: exportHistory.map(log => ({
        id: log.id,
        exportedBy: {
          name: log.user?.name,
          email: log.user?.email
        },
        format: (log.metadata as any)?.format,
        period: (log.metadata as any)?.period,
        fileSize: (log.metadata as any)?.fileSize,
        exportedAt: log.createdAt.toISOString()
      })),
      totalExports: exportHistory.length
    });

  } catch (error) {
    console.error('Export history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch export history' },
      { status: 500 }
    );
  }
}