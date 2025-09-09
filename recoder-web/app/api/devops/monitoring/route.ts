// DevOps Monitoring API - Real-time infrastructure monitoring and alerting
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import rateLimit from '@/lib/rate-limit';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100,
});

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'devops-monitoring');
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
    const type = searchParams.get('type');
    const deploymentId = searchParams.get('deploymentId');
    const timeframe = searchParams.get('timeframe') || '1h';

    if (type === 'system') {
      // Get system metrics
      const systemMetrics = await getSystemMetrics();
      return NextResponse.json({ metrics: systemMetrics });

    } else if (type === 'deployment' && deploymentId) {
      // Get deployment-specific metrics
      const deploymentMetrics = await getDeploymentMetrics(deploymentId, timeframe);
      return NextResponse.json({ metrics: deploymentMetrics });

    } else if (type === 'infrastructure') {
      // Get infrastructure overview
      const infrastructureMetrics = await getInfrastructureMetrics(session.user.id);
      return NextResponse.json({ metrics: infrastructureMetrics });

    } else if (type === 'alerts') {
      // Get active alerts
      const alerts = await getActiveAlerts(session.user.id);
      return NextResponse.json({ alerts });

    } else {
      // Get overview metrics
      const overviewMetrics = await getOverviewMetrics(session.user.id);
      return NextResponse.json({ metrics: overviewMetrics });
    }

  } catch (error) {
    console.error('DevOps monitoring error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 10, 'devops-monitoring-action');
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
    const { action } = body;

    if (action === 'create_alert') {
      const { name, condition, threshold, deploymentId, notificationChannels } = body;
      
      const alert = await prisma.monitoringAlert.create({
        data: {
          name,
          condition,
          threshold,
          deploymentId,
          notificationChannels,
          createdBy: session.user.id,
          status: 'active'
        }
      });

      return NextResponse.json({ 
        alert,
        message: 'Alert created successfully' 
      });

    } else if (action === 'acknowledge_alert') {
      const { alertId } = body;
      
      const alert = await prisma.monitoringAlert.update({
        where: { id: alertId },
        data: {
          status: 'acknowledged',
          acknowledgedBy: session.user.id,
          acknowledgedAt: new Date()
        }
      });

      return NextResponse.json({ 
        alert,
        message: 'Alert acknowledged' 
      });

    } else if (action === 'create_dashboard') {
      const { name, widgets, deploymentIds } = body;
      
      const dashboard = await prisma.monitoringDashboard.create({
        data: {
          name,
          widgets,
          deploymentIds,
          createdBy: session.user.id
        }
      });

      return NextResponse.json({ 
        dashboard,
        message: 'Dashboard created successfully' 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('DevOps monitoring action error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function getSystemMetrics() {
  try {
    // Get basic system information
    const cpuUsage = os.loadavg()[0] * 10; // Approximate CPU usage percentage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;
    
    // Get disk usage (Linux/macOS)
    let diskUsage = 0;
    try {
      const { stdout } = await execAsync('df -h / | tail -1 | awk \'{print $5}\' | sed \'s/%//\'');
      diskUsage = parseInt(stdout.trim()) || 0;
    } catch (error) {
      console.warn('Could not get disk usage:', error);
    }

    // Get network statistics
    const networkInterfaces = os.networkInterfaces();
    const activeInterfaces = Object.keys(networkInterfaces).length;

    // Get process information
    let processCount = 0;
    try {
      const { stdout } = await execAsync('ps aux | wc -l');
      processCount = parseInt(stdout.trim()) - 1; // Subtract header line
    } catch (error) {
      console.warn('Could not get process count:', error);
    }

    // Get uptime
    const uptime = os.uptime();

    // Calculate system health score
    const healthScore = Math.round(
      ((100 - Math.min(cpuUsage, 100)) * 0.3) +
      ((100 - memoryUsage) * 0.3) +
      ((100 - diskUsage) * 0.2) +
      (Math.min(uptime / (24 * 60 * 60), 30) / 30 * 100 * 0.2)
    );

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        usage: Math.round(cpuUsage * 100) / 100,
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'Unknown'
      },
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
        usage: Math.round(memoryUsage * 100) / 100
      },
      disk: {
        usage: diskUsage
      },
      network: {
        interfaces: activeInterfaces
      },
      system: {
        uptime,
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        processCount,
        healthScore
      }
    };

  } catch (error) {
    console.error('Error getting system metrics:', error);
    return {
      error: 'Failed to collect system metrics',
      timestamp: new Date().toISOString()
    };
  }
}

async function getDeploymentMetrics(deploymentId: string, timeframe: string) {
  try {
    // Get deployment information
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!deployment) {
      throw new Error('Deployment not found');
    }

    // Calculate timeframe
    const now = new Date();
    const timeframeMs = timeframe === '1h' ? 60 * 60 * 1000 :
                      timeframe === '24h' ? 24 * 60 * 60 * 1000 :
                      timeframe === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                      60 * 60 * 1000;
    const startTime = new Date(now.getTime() - timeframeMs);

    // Get execution statistics
    const executions = await prisma.deploymentExecution.findMany({
      where: {
        deploymentId,
        createdAt: {
          gte: startTime
        }
      }
    });

    const successfulExecutions = executions.filter(e => e.status === 'success').length;
    const failedExecutions = executions.filter(e => e.status === 'failed').length;
    const totalExecutions = executions.length;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    // Calculate average deployment time
    const completedExecutions = executions.filter(e => e.completedAt && e.results?.duration);
    const avgDeploymentTime = completedExecutions.length > 0 
      ? completedExecutions.reduce((sum, e) => sum + (e.results?.duration || 0), 0) / completedExecutions.length
      : 0;

    // Mock application metrics (in a real implementation, these would come from monitoring agents)
    const applicationMetrics = {
      responseTime: Math.random() * 200 + 100, // 100-300ms
      requestsPerMinute: Math.floor(Math.random() * 1000) + 500,
      errorRate: Math.random() * 5, // 0-5%
      activeConnections: Math.floor(Math.random() * 100) + 50,
      throughput: Math.floor(Math.random() * 10) + 5 // MB/s
    };

    // Health checks
    const isHealthy = successRate > 95 && applicationMetrics.responseTime < 500 && applicationMetrics.errorRate < 1;

    return {
      deployment: {
        id: deployment.id,
        name: deployment.name,
        platform: deployment.platform,
        environment: deployment.environment,
        status: deployment.status
      },
      deploymentMetrics: {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate: Math.round(successRate * 100) / 100,
        avgDeploymentTime: Math.round(avgDeploymentTime),
        lastDeployment: executions[0]?.createdAt || null
      },
      applicationMetrics,
      health: {
        status: isHealthy ? 'healthy' : 'degraded',
        score: isHealthy ? Math.floor(Math.random() * 20) + 80 : Math.floor(Math.random() * 30) + 50,
        checks: [
          { name: 'API Endpoints', status: 'passing', lastCheck: new Date().toISOString() },
          { name: 'Database', status: 'passing', lastCheck: new Date().toISOString() },
          { name: 'Cache', status: applicationMetrics.responseTime < 200 ? 'passing' : 'warning', lastCheck: new Date().toISOString() },
          { name: 'Background Jobs', status: 'passing', lastCheck: new Date().toISOString() }
        ]
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error getting deployment metrics:', error);
    throw error;
  }
}

async function getInfrastructureMetrics(userId: string) {
  try {
    // Get user's deployments
    const deployments = await prisma.deployment.findMany({
      where: {
        project: {
          OR: [
            { userId },
            { 
              collaborators: {
                some: { userId }
              }
            }
          ]
        }
      },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            executions: true
          }
        }
      }
    });

    // Calculate infrastructure statistics
    const totalDeployments = deployments.length;
    const activeDeployments = deployments.filter(d => d.status === 'active').length;
    const deploymentsByPlatform = deployments.reduce((acc, d) => {
      acc[d.platform] = (acc[d.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const deploymentsByEnvironment = deployments.reduce((acc, d) => {
      acc[d.environment] = (acc[d.environment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get recent deployment activity
    const recentExecutions = await prisma.deploymentExecution.findMany({
      where: {
        deployment: {
          project: {
            OR: [
              { userId },
              { 
                collaborators: {
                  some: { userId }
                }
              }
            ]
          }
        },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: {
        deployment: {
          select: {
            name: true,
            platform: true,
            environment: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const successfulExecutions = recentExecutions.filter(e => e.status === 'success').length;
    const failedExecutions = recentExecutions.filter(e => e.status === 'failed').length;
    const overallSuccessRate = recentExecutions.length > 0 
      ? (successfulExecutions / recentExecutions.length) * 100 
      : 0;

    // Calculate costs (mock data)
    const estimatedMonthlyCost = deployments.reduce((cost, deployment) => {
      const baseCost = deployment.platform === 'aws' ? 50 : 
                      deployment.platform === 'gcp' ? 45 : 
                      deployment.platform === 'azure' ? 55 : 20;
      const environmentMultiplier = deployment.environment === 'production' ? 3 : 
                                   deployment.environment === 'staging' ? 1.5 : 1;
      return cost + (baseCost * environmentMultiplier);
    }, 0);

    return {
      overview: {
        totalDeployments,
        activeDeployments,
        overallSuccessRate: Math.round(overallSuccessRate * 100) / 100,
        estimatedMonthlyCost,
        recentExecutions: recentExecutions.length
      },
      distribution: {
        platforms: deploymentsByPlatform,
        environments: deploymentsByEnvironment
      },
      recentActivity: recentExecutions.map(exec => ({
        id: exec.id,
        deployment: exec.deployment,
        status: exec.status,
        createdAt: exec.createdAt,
        completedAt: exec.completedAt,
        duration: exec.results?.duration || null
      })),
      resourceUtilization: {
        cpu: Math.floor(Math.random() * 30) + 40, // 40-70%
        memory: Math.floor(Math.random() * 25) + 50, // 50-75%
        network: Math.floor(Math.random() * 40) + 20, // 20-60%
        storage: Math.floor(Math.random() * 20) + 60 // 60-80%
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error getting infrastructure metrics:', error);
    throw error;
  }
}

async function getActiveAlerts(userId: string) {
  try {
    const alerts = await prisma.monitoringAlert.findMany({
      where: {
        deployment: {
          project: {
            OR: [
              { userId },
              { 
                collaborators: {
                  some: { userId }
                }
              }
            ]
          }
        },
        status: { in: ['active', 'triggered'] }
      },
      include: {
        deployment: {
          select: {
            name: true,
            platform: true,
            environment: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Add some mock alerts for demonstration
    const mockAlerts = [
      {
        id: 'mock-1',
        name: 'High CPU Usage',
        condition: 'cpu_usage > 80%',
        severity: 'warning',
        status: 'active',
        deployment: { name: 'production-app', platform: 'aws', environment: 'production' },
        triggeredAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        message: 'CPU usage has been above 80% for 5 minutes'
      },
      {
        id: 'mock-2',
        name: 'Deployment Failed',
        condition: 'deployment_status = failed',
        severity: 'critical',
        status: 'triggered',
        deployment: { name: 'staging-api', platform: 'gcp', environment: 'staging' },
        triggeredAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        message: 'Last deployment failed with exit code 1'
      }
    ];

    return [...alerts, ...mockAlerts];

  } catch (error) {
    console.error('Error getting active alerts:', error);
    return [];
  }
}

async function getOverviewMetrics(userId: string) {
  try {
    const [systemMetrics, infrastructureMetrics] = await Promise.all([
      getSystemMetrics(),
      getInfrastructureMetrics(userId)
    ]);

    return {
      system: systemMetrics,
      infrastructure: infrastructureMetrics,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error getting overview metrics:', error);
    throw error;
  }
}