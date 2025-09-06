// Analytics Report Execution API
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';

const executeReportSchema = z.object({
  reportId: z.string(),
  parameters: z.record(z.any()).optional(),
  options: z.object({
    useCache: z.boolean().default(true),
    maxCacheAge: z.number().default(1800), // 30 minutes
    timeout: z.number().min(10).max(300).default(60), // seconds
    format: z.enum(['json', 'csv', 'xlsx']).default('json'),
    limit: z.number().min(1).max(100000).optional(),
    offset: z.number().min(0).optional()
  }).optional()
});

const batchExecuteSchema = z.object({
  reportIds: z.array(z.string()).min(1).max(10),
  parameters: z.record(z.any()).optional(),
  options: z.object({
    useCache: z.boolean().default(true),
    parallel: z.boolean().default(true),
    timeout: z.number().min(30).max(600).default(120)
  }).optional()
});

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
    const { action = 'single' } = body;

    if (action === 'batch') {
      const { reportIds, parameters, options } = batchExecuteSchema.parse(body);
      return await executeBatchReports(reportIds, userId, parameters, options, request);
    } else {
      const { reportId, parameters, options } = executeReportSchema.parse(body);
      return await executeSingleReport(reportId, userId, parameters, options, request);
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid execution parameters', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Report execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute report' },
      { status: 500 }
    );
  }
}

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
    const reportId = searchParams.get('reportId');
    const executionId = searchParams.get('executionId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let whereClause: any = { userId };

    if (reportId) {
      whereClause.reportId = reportId;
    }

    if (executionId) {
      whereClause.id = executionId;
    }

    if (status) {
      whereClause.status = status;
    }

    // Get executions
    const executions = await prisma.reportExecution.findMany({
      where: whereClause,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        report: {
          select: {
            id: true,
            name: true,
            category: true,
            type: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Transform executions data
    const transformedExecutions = executions.map(execution => ({
      id: execution.id,
      reportId: execution.reportId,
      report: execution.report,
      status: execution.status,
      parameters: execution.parameters,
      startedAt: execution.startedAt.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      executionTime: execution.executionTime,
      rowCount: execution.rowCount,
      errorMessage: execution.errorMessage,
      cacheHit: execution.cacheHit,
      results: execution.results,
      metadata: execution.metadata,
      user: execution.user,
      createdAt: execution.createdAt.toISOString()
    }));

    // Get execution statistics
    const stats = await getExecutionStats(userId, reportId);

    return NextResponse.json({
      executions: transformedExecutions,
      stats,
      pagination: {
        limit,
        offset,
        total: await prisma.reportExecution.count({ where: whereClause })
      }
    });

  } catch (error) {
    console.error('Execution history fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch execution history' },
      { status: 500 }
    );
  }
}

async function executeSingleReport(
  reportId: string,
  userId: string,
  parameters: any = {},
  options: any = {},
  request: NextRequest
) {
  // Verify user has access to report
  const report = await prisma.analyticsReport.findFirst({
    where: {
      id: reportId,
      OR: [
        { userId },
        { 
          reportShares: {
            some: {
              sharedWith: userId,
              isActive: true,
              permissions: { path: ['canExecute'], equals: true }
            }
          }
        }
      ]
    }
  });

  if (!report) {
    return NextResponse.json(
      { error: 'Report not found or access denied' },
      { status: 404 }
    );
  }

  // Check execution limits
  const userSubscription = await prisma.subscription.findUnique({
    where: { userId }
  });

  const userPlan = userSubscription?.plan || 'free';
  const executionLimits = {
    free: 100,    // per day
    pro: 1000,    // per day
    enterprise: 10000  // per day
  };

  const todayExecutions = await prisma.reportExecution.count({
    where: {
      userId,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });

  if (todayExecutions >= executionLimits[userPlan as keyof typeof executionLimits]) {
    return NextResponse.json(
      { 
        error: `Daily execution limit reached. ${userPlan} plan allows ${executionLimits[userPlan as keyof typeof executionLimits]} executions per day.`,
        upgradeRequired: userPlan === 'free'
      },
      { status: 403 }
    );
  }

  try {
    // Check cache if enabled
    if (options.useCache) {
      const cached = await checkReportCache(reportId, parameters, options.maxCacheAge);
      if (cached) {
        // Log cache hit
        await prisma.reportExecution.create({
          data: {
            reportId,
            userId,
            status: 'completed',
            parameters,
            startedAt: new Date(),
            completedAt: new Date(),
            executionTime: 0,
            rowCount: cached.rowCount,
            cacheHit: true,
            results: cached.results,
            metadata: cached.metadata
          }
        });

        return NextResponse.json({
          success: true,
          execution: {
            id: 'cached',
            status: 'completed',
            executionTime: 0,
            rowCount: cached.rowCount,
            cacheHit: true,
            results: cached.results,
            completedAt: new Date().toISOString()
          }
        });
      }
    }

    // Create execution record
    const execution = await prisma.reportExecution.create({
      data: {
        reportId,
        userId,
        status: 'running',
        parameters,
        startedAt: new Date()
      }
    });

    // Execute report asynchronously
    const startTime = Date.now();
    
    try {
      const results = await executeReportQuery(report, parameters, options);
      const executionTime = Date.now() - startTime;

      // Update execution with results
      const completedExecution = await prisma.reportExecution.update({
        where: { id: execution.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          executionTime,
          rowCount: results.data ? results.data.length : 0,
          results: results.data,
          metadata: {
            ...results.metadata,
            parameters,
            executionOptions: options
          }
        }
      });

      // Cache results if enabled
      if (options.useCache && (report.settings as any)?.cacheEnabled !== false) {
        await cacheReportResults(reportId, parameters, results, (report.settings as any)?.cacheDuration || 1800);
      }

      // Log successful execution
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'analytics_report_executed',
          platform: 'web',
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          success: true,
          metadata: {
            reportId,
            executionId: execution.id,
            executionTime,
            rowCount: results.data ? results.data.length : 0,
            cacheHit: false
          }
        }
      });

      return NextResponse.json({
        success: true,
        execution: {
          id: completedExecution.id,
          status: 'completed',
          executionTime,
          rowCount: completedExecution.rowCount,
          cacheHit: false,
          results: completedExecution.results,
          metadata: completedExecution.metadata,
          startedAt: completedExecution.startedAt.toISOString(),
          completedAt: completedExecution.completedAt?.toISOString()
        }
      });

    } catch (error) {
      // Update execution with error
      await prisma.reportExecution.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          executionTime: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      throw error;
    }

  } catch (error) {
    console.error('Report execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute report' },
      { status: 500 }
    );
  }
}

async function executeBatchReports(
  reportIds: string[],
  userId: string,
  parameters: any = {},
  options: any = {},
  request: NextRequest
) {
  // Verify access to all reports
  const reports = await prisma.analyticsReport.findMany({
    where: {
      id: { in: reportIds },
      OR: [
        { userId },
        { 
          reportShares: {
            some: {
              sharedWith: userId,
              isActive: true,
              permissions: { path: ['canExecute'], equals: true }
            }
          }
        }
      ]
    }
  });

  if (reports.length !== reportIds.length) {
    const foundIds = reports.map(r => r.id);
    const missingIds = reportIds.filter(id => !foundIds.includes(id));
    return NextResponse.json(
      { error: `Access denied or reports not found: ${missingIds.join(', ')}` },
      { status: 404 }
    );
  }

  // Check batch execution limits
  const userSubscription = await prisma.subscription.findUnique({
    where: { userId }
  });

  const userPlan = userSubscription?.plan || 'free';
  const batchLimits = {
    free: 3,      // reports per batch
    pro: 10,      // reports per batch
    enterprise: 50     // reports per batch
  };

  if (reportIds.length > batchLimits[userPlan as keyof typeof batchLimits]) {
    return NextResponse.json(
      { 
        error: `Batch size limit exceeded. ${userPlan} plan allows ${batchLimits[userPlan as keyof typeof batchLimits]} reports per batch.`,
        upgradeRequired: userPlan === 'free'
      },
      { status: 403 }
    );
  }

  try {
    const batchStartTime = Date.now();
    const executions = [];

    if (options.parallel) {
      // Execute reports in parallel
      const executionPromises = reports.map(async (report) => {
        const startTime = Date.now();
        
        const execution = await prisma.reportExecution.create({
          data: {
            reportId: report.id,
            userId,
            status: 'running',
            parameters,
            startedAt: new Date()
          }
        });

        try {
          const results = await executeReportQuery(report, parameters, {
            ...options,
            timeout: options.timeout / reportIds.length // Adjust timeout per report
          });
          
          const executionTime = Date.now() - startTime;

          const completedExecution = await prisma.reportExecution.update({
            where: { id: execution.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              executionTime,
              rowCount: results.data ? results.data.length : 0,
              results: results.data,
              metadata: results.metadata
            }
          });

          return {
            reportId: report.id,
            reportName: report.name,
            executionId: execution.id,
            status: 'completed',
            executionTime,
            rowCount: results.data ? results.data.length : 0,
            results: results.data
          };

        } catch (error) {
          await prisma.reportExecution.update({
            where: { id: execution.id },
            data: {
              status: 'failed',
              completedAt: new Date(),
              executionTime: Date.now() - startTime,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            }
          });

          return {
            reportId: report.id,
            reportName: report.name,
            executionId: execution.id,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const results = await Promise.all(executionPromises);
      executions.push(...results);

    } else {
      // Execute reports sequentially
      for (const report of reports) {
        const startTime = Date.now();
        
        const execution = await prisma.reportExecution.create({
          data: {
            reportId: report.id,
            userId,
            status: 'running',
            parameters,
            startedAt: new Date()
          }
        });

        try {
          const results = await executeReportQuery(report, parameters, options);
          const executionTime = Date.now() - startTime;

          await prisma.reportExecution.update({
            where: { id: execution.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
              executionTime,
              rowCount: results.data ? results.data.length : 0,
              results: results.data,
              metadata: results.metadata
            }
          });

          executions.push({
            reportId: report.id,
            reportName: report.name,
            executionId: execution.id,
            status: 'completed',
            executionTime,
            rowCount: results.data ? results.data.length : 0,
            results: results.data
          });

        } catch (error) {
          await prisma.reportExecution.update({
            where: { id: execution.id },
            data: {
              status: 'failed',
              completedAt: new Date(),
              executionTime: Date.now() - startTime,
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            }
          });

          executions.push({
            reportId: report.id,
            reportName: report.name,
            executionId: execution.id,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    const totalBatchTime = Date.now() - batchStartTime;
    const successCount = executions.filter(e => e.status === 'completed').length;
    const failureCount = executions.filter(e => e.status === 'failed').length;

    // Log batch execution
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'analytics_batch_executed',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: failureCount === 0,
        metadata: {
          reportIds,
          totalReports: reportIds.length,
          successCount,
          failureCount,
          totalBatchTime,
          parallel: options.parallel
        }
      }
    });

    return NextResponse.json({
      success: true,
      batch: {
        totalReports: reportIds.length,
        successCount,
        failureCount,
        totalExecutionTime: totalBatchTime,
        parallel: options.parallel,
        executions
      }
    });

  } catch (error) {
    console.error('Batch execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute batch reports' },
      { status: 500 }
    );
  }
}

// Helper functions
async function checkReportCache(reportId: string, parameters: any, maxAge: number) {
  const cacheKey = generateCacheKey(reportId, parameters);
  
  const cached = await prisma.reportCache.findFirst({
    where: {
      reportId,
      cacheKey,
      createdAt: {
        gt: new Date(Date.now() - maxAge * 1000)
      }
    }
  });

  return cached ? {
    results: cached.results,
    metadata: cached.metadata,
    rowCount: cached.rowCount
  } : null;
}

async function cacheReportResults(
  reportId: string, 
  parameters: any, 
  results: any, 
  duration: number
) {
  const cacheKey = generateCacheKey(reportId, parameters);
  
  await prisma.reportCache.upsert({
    where: { cacheKey },
    update: {
      results: results.data,
      metadata: results.metadata,
      rowCount: results.data ? results.data.length : 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 1000)
    },
    create: {
      reportId,
      cacheKey,
      results: results.data,
      metadata: results.metadata,
      rowCount: results.data ? results.data.length : 0,
      expiresAt: new Date(Date.now() + duration * 1000)
    }
  });
}

function generateCacheKey(reportId: string, parameters: any) {
  const crypto = require('crypto');
  const paramString = JSON.stringify(parameters || {});
  return crypto.createHash('sha256')
    .update(`${reportId}-${paramString}`)
    .digest('hex');
}

async function executeReportQuery(report: any, parameters: any, options: any) {
  // This would contain the actual query execution logic
  // Different implementations for different data source types
  
  switch (report.dataSource.type) {
    case 'database':
      return await executeDatabaseQuery(report, parameters, options);
    case 'api':
      return await executeApiQuery(report, parameters, options);
    case 'mixed':
      return await executeMixedQuery(report, parameters, options);
    case 'event_stream':
      return await executeEventStreamQuery(report, parameters, options);
    default:
      throw new Error(`Unsupported data source type: ${report.dataSource.type}`);
  }
}

async function executeDatabaseQuery(report: any, parameters: any, options: any) {
  // Simulate database query execution
  // In a real implementation, this would:
  // 1. Build SQL queries from dimensions and metrics
  // 2. Apply filters and parameters
  // 3. Execute against the database
  // 4. Process and aggregate results
  
  return {
    data: generateMockData(report.metrics, report.dimensions, options.limit || 1000),
    metadata: {
      executionTime: Math.random() * 1000 + 100,
      queryCount: report.dataSource.queries?.length || 1,
      cacheHit: false,
      dataSourceType: 'database'
    }
  };
}

async function executeApiQuery(report: any, parameters: any, options: any) {
  // Simulate API query execution
  return {
    data: generateMockData(report.metrics, report.dimensions, options.limit || 1000),
    metadata: {
      executionTime: Math.random() * 2000 + 200,
      apiCalls: report.dataSource.queries?.length || 1,
      cacheHit: false,
      dataSourceType: 'api'
    }
  };
}

async function executeMixedQuery(report: any, parameters: any, options: any) {
  // Simulate mixed data source execution
  return {
    data: generateMockData(report.metrics, report.dimensions, options.limit || 1000),
    metadata: {
      executionTime: Math.random() * 3000 + 500,
      sources: ['database', 'api'],
      cacheHit: false,
      dataSourceType: 'mixed'
    }
  };
}

async function executeEventStreamQuery(report: any, parameters: any, options: any) {
  // Simulate event stream query execution
  return {
    data: generateMockData(report.metrics, report.dimensions, options.limit || 1000),
    metadata: {
      executionTime: Math.random() * 500 + 50,
      eventCount: Math.floor(Math.random() * 10000) + 1000,
      cacheHit: false,
      dataSourceType: 'event_stream'
    }
  };
}

function generateMockData(metrics: any[], dimensions: any[], limit: number) {
  const data = [];
  const rowCount = Math.min(limit, Math.floor(Math.random() * 1000) + 100);
  
  for (let i = 0; i < rowCount; i++) {
    const row: any = {};
    
    // Generate dimension values
    dimensions.forEach(dim => {
      switch (dim.type) {
        case 'date':
          row[dim.field] = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case 'string':
        case 'category':
          row[dim.field] = ['Category A', 'Category B', 'Category C'][Math.floor(Math.random() * 3)];
          break;
        case 'number':
          row[dim.field] = Math.floor(Math.random() * 1000);
          break;
        case 'boolean':
          row[dim.field] = Math.random() > 0.5;
          break;
        default:
          row[dim.field] = `Value ${i}`;
      }
    });
    
    // Generate metric values
    metrics.forEach(metric => {
      switch (metric.aggregation) {
        case 'count':
          row[metric.field] = Math.floor(Math.random() * 1000);
          break;
        case 'sum':
        case 'avg':
          row[metric.field] = Math.random() * 100000;
          break;
        case 'min':
        case 'max':
          row[metric.field] = Math.random() * 1000;
          break;
        default:
          row[metric.field] = Math.random() * 10000;
      }
    });
    
    data.push(row);
  }
  
  return data;
}

async function getExecutionStats(userId: string, reportId?: string) {
  const whereClause: any = { userId };
  if (reportId) {
    whereClause.reportId = reportId;
  }

  const [totalExecutions, todayExecutions, avgExecutionTime, statusBreakdown] = await Promise.all([
    prisma.reportExecution.count({ where: whereClause }),
    prisma.reportExecution.count({
      where: {
        ...whereClause,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    }),
    prisma.reportExecution.aggregate({
      where: {
        ...whereClause,
        status: 'completed',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      _avg: { executionTime: true }
    }),
    prisma.reportExecution.groupBy({
      by: ['status'],
      where: whereClause,
      _count: true
    })
  ]);

  return {
    totalExecutions,
    todayExecutions,
    avgExecutionTime: Math.round(avgExecutionTime._avg.executionTime || 0),
    statusBreakdown: statusBreakdown.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>)
  };
}