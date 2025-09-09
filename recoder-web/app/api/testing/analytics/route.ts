// Testing Analytics API - Real analytics for test execution data
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import rateLimit from '@/lib/rate-limit';

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'testing-analytics');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || '7d';
    const projectId = searchParams.get('projectId');

    // Calculate date range
    const now = new Date();
    const daysAgo = timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));

    // Base query conditions
    const whereConditions: any = {
      createdAt: {
        gte: startDate
      },
      testSuite: {
        project: {
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id
                }
              }
            }
          ]
        }
      }
    };

    if (projectId) {
      whereConditions.testSuite.projectId = projectId;
    }

    // Get execution statistics
    const [
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      avgExecutionTime,
      executionsByDate,
      frameworkStats,
      testTypeStats,
      coverageStats
    ] = await Promise.all([
      // Total executions
      prisma.testExecution.count({
        where: whereConditions
      }),
      
      // Successful executions
      prisma.testExecution.count({
        where: {
          ...whereConditions,
          status: 'passed'
        }
      }),
      
      // Failed executions
      prisma.testExecution.count({
        where: {
          ...whereConditions,
          status: 'failed'
        }
      }),
      
      // Average execution time
      prisma.testExecution.aggregate({
        where: {
          ...whereConditions,
          completedAt: { not: null }
        },
        _avg: {
          executionTime: true
        }
      }),
      
      // Executions by date
      prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total_executions,
          SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          AVG(CASE WHEN results->>'executionTime' IS NOT NULL 
              THEN CAST(results->>'executionTime' AS NUMERIC) 
              ELSE NULL END) as avg_time
        FROM test_executions te
        JOIN test_suites ts ON te.test_suite_id = ts.id
        JOIN projects p ON ts.project_id = p.id
        WHERE te.created_at >= ${startDate}
          AND (p.user_id = ${session.user.id} OR EXISTS(
            SELECT 1 FROM collaborators c 
            WHERE c.project_id = p.id AND c.user_id = ${session.user.id}
          ))
          ${projectId ? `AND ts.project_id = '${projectId}'` : ''}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `,
      
      // Framework statistics
      prisma.$queryRaw`
        SELECT 
          ts.framework,
          COUNT(*) as execution_count,
          AVG(CASE WHEN te.status = 'passed' THEN 1.0 ELSE 0.0 END) * 100 as success_rate,
          AVG(CASE WHEN te.results->>'executionTime' IS NOT NULL 
              THEN CAST(te.results->>'executionTime' AS NUMERIC) 
              ELSE NULL END) as avg_execution_time
        FROM test_executions te
        JOIN test_suites ts ON te.test_suite_id = ts.id
        JOIN projects p ON ts.project_id = p.id
        WHERE te.created_at >= ${startDate}
          AND (p.user_id = ${session.user.id} OR EXISTS(
            SELECT 1 FROM collaborators c 
            WHERE c.project_id = p.id AND c.user_id = ${session.user.id}
          ))
          ${projectId ? `AND ts.project_id = '${projectId}'` : ''}
        GROUP BY ts.framework
        ORDER BY execution_count DESC
      `,
      
      // Test type statistics
      prisma.$queryRaw`
        SELECT 
          ts.test_type,
          COUNT(*) as execution_count,
          AVG(CASE WHEN te.status = 'passed' THEN 1.0 ELSE 0.0 END) * 100 as success_rate
        FROM test_executions te
        JOIN test_suites ts ON te.test_suite_id = ts.id
        JOIN projects p ON ts.project_id = p.id
        WHERE te.created_at >= ${startDate}
          AND (p.user_id = ${session.user.id} OR EXISTS(
            SELECT 1 FROM collaborators c 
            WHERE c.project_id = p.id AND c.user_id = ${session.user.id}
          ))
          ${projectId ? `AND ts.project_id = '${projectId}'` : ''}
        GROUP BY ts.test_type
        ORDER BY execution_count DESC
      `,
      
      // Coverage statistics
      prisma.$queryRaw`
        SELECT 
          AVG(CASE WHEN te.results->>'coverage' IS NOT NULL 
              THEN CAST(te.results->>'coverage' AS NUMERIC) 
              ELSE NULL END) as avg_coverage,
          COUNT(CASE WHEN te.results->>'coverage' IS NOT NULL THEN 1 END) as coverage_reports
        FROM test_executions te
        JOIN test_suites ts ON te.test_suite_id = ts.id
        JOIN projects p ON ts.project_id = p.id
        WHERE te.created_at >= ${startDate}
          AND (p.user_id = ${session.user.id} OR EXISTS(
            SELECT 1 FROM collaborators c 
            WHERE c.project_id = p.id AND c.user_id = ${session.user.id}
          ))
          ${projectId ? `AND ts.project_id = '${projectId}'` : ''}
      `
    ]);

    // Calculate success rate
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    // Get recent activity
    const recentActivity = await prisma.testExecution.findMany({
      where: whereConditions,
      include: {
        testSuite: {
          include: {
            project: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    // Prepare trend data
    const trendData = (executionsByDate as any[]).map(item => ({
      date: item.date,
      totalExecutions: parseInt(item.total_executions),
      passed: parseInt(item.passed),
      failed: parseInt(item.failed),
      successRate: item.total_executions > 0 ? (parseInt(item.passed) / parseInt(item.total_executions)) * 100 : 0,
      avgExecutionTime: item.avg_time ? parseFloat(item.avg_time) : 0
    }));

    const stats = {
      summary: {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate: Math.round(successRate * 100) / 100,
        avgExecutionTime: avgExecutionTime._avg.executionTime || 0,
        timeframe
      },
      trends: {
        daily: trendData
      },
      frameworks: frameworkStats as any[],
      testTypes: testTypeStats as any[],
      coverage: {
        average: (coverageStats as any[])[0]?.avg_coverage || 0,
        reportsCount: (coverageStats as any[])[0]?.coverage_reports || 0
      },
      recentActivity: recentActivity.map(exec => ({
        id: exec.id,
        testSuiteName: exec.testSuite.name,
        projectName: exec.testSuite.project.name,
        status: exec.status,
        framework: exec.testSuite.framework,
        testType: exec.testSuite.testType,
        executionTime: exec.results?.executionTime || null,
        createdAt: exec.createdAt,
        completedAt: exec.completedAt
      }))
    };

    // Log analytics access
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'testing_analytics_view',
        platform: 'testing',
        success: true,
        metadata: {
          timeframe,
          projectId: projectId || null,
          totalExecutions,
          successRate
        }
      }
    });

    return NextResponse.json({ 
      stats,
      message: 'Testing analytics retrieved successfully' 
    });

  } catch (error) {
    console.error('Testing analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch testing analytics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'testing-analytics-export');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, format, timeframe, projectId } = body;

    if (action === 'export') {
      // Calculate date range
      const now = new Date();
      const daysAgo = timeframe === '1d' ? 1 : timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
      const startDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));

      // Get detailed execution data for export
      const executions = await prisma.testExecution.findMany({
        where: {
          createdAt: {
            gte: startDate
          },
          testSuite: {
            project: {
              OR: [
                { userId: session.user.id },
                { 
                  collaborators: {
                    some: {
                      userId: session.user.id
                    }
                  }
                }
              ]
            },
            ...(projectId && { projectId })
          }
        },
        include: {
          testSuite: {
            include: {
              project: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Format data based on export format
      let exportData;
      
      if (format === 'csv') {
        const csvData = executions.map(exec => ({
          'Execution ID': exec.id,
          'Test Suite': exec.testSuite.name,
          'Project': exec.testSuite.project.name,
          'Framework': exec.testSuite.framework,
          'Test Type': exec.testSuite.testType,
          'Status': exec.status,
          'Tests Run': exec.results?.testsRun || 0,
          'Tests Passed': exec.results?.testsPassed || 0,
          'Tests Failed': exec.results?.testsFailed || 0,
          'Execution Time (ms)': exec.results?.executionTime || 0,
          'Coverage %': exec.results?.coverage || null,
          'Created At': exec.createdAt.toISOString(),
          'Completed At': exec.completedAt?.toISOString() || null
        }));
        
        exportData = {
          format: 'csv',
          data: csvData,
          filename: `testing-analytics-${timeframe}-${Date.now()}.csv`
        };
        
      } else if (format === 'json') {
        exportData = {
          format: 'json',
          data: {
            metadata: {
              exportedAt: new Date().toISOString(),
              timeframe,
              projectId,
              totalRecords: executions.length
            },
            executions: executions.map(exec => ({
              id: exec.id,
              testSuite: {
                id: exec.testSuite.id,
                name: exec.testSuite.name,
                framework: exec.testSuite.framework,
                testType: exec.testSuite.testType
              },
              project: {
                name: exec.testSuite.project.name
              },
              status: exec.status,
              results: exec.results,
              createdAt: exec.createdAt,
              completedAt: exec.completedAt
            }))
          },
          filename: `testing-analytics-${timeframe}-${Date.now()}.json`
        };
      }

      // Log export
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'testing_analytics_export',
          platform: 'testing',
          success: true,
          metadata: {
            format,
            timeframe,
            projectId: projectId || null,
            recordCount: executions.length
          }
        }
      });

      return NextResponse.json({
        exportData,
        message: 'Analytics data exported successfully'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Testing analytics export error:', error);
    return NextResponse.json(
      { error: 'Failed to export analytics data' },
      { status: 500 }
    );
  }
}