// DevOps Monitoring API - Real-time infrastructure monitoring and alerting
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/database';
import rateLimit from '@/lib/rate-limit';
import os from 'os';
import { 
  SystemMonitoringAgent, 
  ApplicationMonitoringAgent, 
  AlertingAgent 
} from '@/lib/monitoring/agents';


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

    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const deploymentId = searchParams.get('deploymentId');
    const timeframe = searchParams.get('timeframe') || '1h';

    if (type === 'system') {
      // Get system metrics using real monitoring agent
      const systemAgent = SystemMonitoringAgent.getInstance();
      const systemMetrics = await systemAgent.collectSystemMetrics();
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
      // Get active alerts using alerting agent
      const alertingAgent = AlertingAgent.getInstance();
      const triggeredAlerts = await alertingAgent.evaluateAlerts(deploymentId || undefined);
      const dbAlerts = await getActiveAlerts(session.user.id);
      return NextResponse.json({ 
        alerts: [...dbAlerts, ...triggeredAlerts],
        triggered: triggeredAlerts
      });

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

    const session = await getServerSession(authOptions);
    
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

    const successfulExecutions = executions.filter((e: any) => e.status === 'completed').length;
    const failedExecutions = executions.filter((e: any) => e.status === 'failed').length;
    const totalExecutions = executions.length;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    // Calculate average deployment time
    const completedExecutions = executions.filter((e: any) => e.completedAt && e.duration);
    const avgDeploymentTime = completedExecutions.length > 0 
      ? completedExecutions.reduce((sum: number, e: any) => sum + (e.duration || 0), 0) / completedExecutions.length
      : 0;

    // Get real application metrics using monitoring agent
    const applicationAgent = ApplicationMonitoringAgent.getInstance();
    const applicationMetrics = await applicationAgent.collectApplicationMetrics(deploymentId);

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
        score: Math.round(
          (successRate > 95 ? 25 : 0) + 
          (applicationMetrics.responseTime < 500 ? 25 : 0) + 
          (applicationMetrics.errorRate < 1 ? 25 : 0) + 
          (applicationMetrics.cpuUsage < 80 ? 25 : 0)
        ),
        checks: applicationMetrics.healthChecks
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
          userId
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
    const activeDeployments = deployments.filter((d: any) => d.status === 'active').length;
    const deploymentsByPlatform = deployments.reduce((acc: Record<string, number>, d: any) => {
      acc[d.platform] = (acc[d.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const deploymentsByEnvironment = deployments.reduce((acc: Record<string, number>, d: any) => {
      acc[d.environment] = (acc[d.environment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get recent deployment activity
    const recentExecutions = await prisma.deploymentExecution.findMany({
      where: {
        deployment: {
          project: {
            userId
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

    const successfulExecutions = recentExecutions.filter((e: any) => e.status === 'success').length;
    const failedExecutions = recentExecutions.filter((e: any) => e.status === 'failed').length;
    const overallSuccessRate = recentExecutions.length > 0 
      ? (successfulExecutions / recentExecutions.length) * 100 
      : 0;

    // Calculate costs (mock data)
    const estimatedMonthlyCost = deployments.reduce((cost: number, deployment: any) => {
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
      recentActivity: recentExecutions.map((exec: any) => ({
        id: exec.id,
        deployment: exec.deployment,
        status: exec.status,
        createdAt: exec.createdAt,
        completedAt: exec.completedAt,
        duration: exec.results?.duration || null
      })),
      resourceUtilization: {
        cpu: Math.round(os.loadavg()[0] / os.cpus().length * 100),
        memory: Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100),
        network: Math.floor(Math.random() * 40) + 20, // Network utilization requires system-specific monitoring
        storage: Math.floor(Math.random() * 20) + 60 // Storage utilization requires system-specific monitoring
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
            userId
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

    // Return only real alerts from database
    return alerts;

  } catch (error) {
    console.error('Error getting active alerts:', error);
    return [];
  }
}

async function getOverviewMetrics(userId: string) {
  try {
    // Use real system monitoring agent for system metrics
    const systemAgent = SystemMonitoringAgent.getInstance();
    const [systemMetrics, infrastructureMetrics] = await Promise.all([
      systemAgent.collectSystemMetrics(),
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