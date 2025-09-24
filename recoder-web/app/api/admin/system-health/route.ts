// System Health Monitoring API - Real system performance and health metrics
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import os from 'os';

// Rate limiting for system health monitoring
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

const systemHealthSchema = z.object({
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  includeDetailedMetrics: z.boolean().default(true),
});

// GET - Get comprehensive system health metrics
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 30, 'system-health');
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

    // Check admin permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'day';
    const includeDetailedMetrics = searchParams.get('includeDetailedMetrics') !== 'false';
    
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');

    // Set default date range if not provided
    if (!startDate || !endDate) {
      const now = new Date();
      endDate = now.toISOString();
      
      switch (period) {
        case 'hour':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours
          break;
        case 'day':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
          break;
        case 'week':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
          break;
        case 'month':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days
          break;
      }
    }

    // Get system overview
    const systemOverview = await getSystemOverview();
    
    // Get performance metrics
    const performanceMetrics = await getPerformanceMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get error tracking
    const errorMetrics = await getErrorMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get database health
    const databaseHealth = await getDatabaseHealth();
    
    // Get API health metrics
    const apiHealth = await getAPIHealthMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get resource usage
    const resourceUsage = await getResourceUsage();
    
    // Get uptime metrics
    const uptimeMetrics = await getUptimeMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );
    
    // Get security metrics
    const securityMetrics = await getSecurityMetrics(
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
      endDate ? new Date(endDate) : new Date()
    );

    // Get detailed metrics if requested
    let detailedMetrics = null;
    if (includeDetailedMetrics) {
      detailedMetrics = await getDetailedSystemMetrics(
        startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
        endDate ? new Date(endDate) : new Date()
      );
    }

    return NextResponse.json({
      period,
      dateRange: { startDate, endDate },
      systemOverview,
      performanceMetrics,
      errorMetrics,
      databaseHealth,
      apiHealth,
      resourceUsage,
      uptimeMetrics,
      securityMetrics,
      detailedMetrics,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('System health monitoring error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system health metrics' },
      { status: 500 }
    );
  }
}

async function getSystemOverview() {
  const now = new Date();
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Get system uptime (simplified - in production use actual uptime tracking)
  const systemStartTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Mock: 30 days ago
  const uptimeHours = (Date.now() - systemStartTime.getTime()) / (1000 * 60 * 60);

  // Get total requests in last 24h
  const totalRequests = await prisma.auditLog.count({
    where: {
      createdAt: { gte: last24Hours, lte: now }
    }
  });

  // Get success rate
  const successfulRequests = await prisma.auditLog.count({
    where: {
      createdAt: { gte: last24Hours, lte: now },
      success: true
    }
  });

  const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

  // Get active users
  const activeUsers = await prisma.user.count({
    where: {
      lastLoginAt: { gte: last24Hours, lte: now }
    }
  });

  // Get system load (Node.js system info)
  const loadAverage = os.loadavg();
  const memoryUsage = process.memoryUsage();
  const cpuCount = os.cpus().length;

  // Calculate overall health score
  const healthScore = calculateHealthScore({
    successRate,
    uptimeHours,
    totalRequests,
    loadAverage: loadAverage[0],
    cpuCount
  });

  return {
    status: healthScore >= 95 ? 'healthy' : healthScore >= 85 ? 'warning' : 'critical',
    healthScore,
    uptime: Math.round(uptimeHours),
    totalRequests,
    successRate,
    activeUsers,
    systemLoad: {
      load1m: loadAverage[0],
      load5m: loadAverage[1],
      load15m: loadAverage[2]
    },
    memoryUsage: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss
    },
    cpuCount,
    nodeVersion: process.version,
    platform: process.platform
  };
}

async function getPerformanceMetrics(startDate: Date, endDate: Date) {
  // Average response times by endpoint (simulated from audit logs)
  const responseTimesQuery = `
    WITH response_times AS (
      SELECT 
        action,
        COALESCE((metadata->>'duration')::numeric, 
                 EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) * 1000) as duration_ms
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
        AND success = true
    )
    SELECT 
      action,
      AVG(duration_ms) as avg_response_time,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_response_time,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_response_time,
      COUNT(*) as request_count
    FROM response_times
    WHERE duration_ms IS NOT NULL AND duration_ms > 0 AND duration_ms < 60000
    GROUP BY action
    ORDER BY avg_response_time DESC;
  `;

  const responseTimeData = await prisma.$queryRawUnsafe(responseTimesQuery, startDate, endDate);

  // Throughput metrics
  const throughputQuery = `
    SELECT 
      DATE_TRUNC('hour', created_at) as hour,
      COUNT(*) as requests_per_hour,
      AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100 as success_rate
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY hour
    ORDER BY hour;
  `;

  const throughputData = await prisma.$queryRawUnsafe(throughputQuery, startDate, endDate);

  return {
    responseTimesByEndpoint: Array.isArray(responseTimeData) ? responseTimeData.map((row: any) => ({
      endpoint: row.action,
      avgResponseTime: Number(row.avg_response_time) || 0,
      medianResponseTime: Number(row.median_response_time) || 0,
      p95ResponseTime: Number(row.p95_response_time) || 0,
      requestCount: Number(row.request_count) || 0
    })) : [],
    throughputOverTime: Array.isArray(throughputData) ? throughputData.map((row: any) => ({
      hour: row.hour,
      requestsPerHour: Number(row.requests_per_hour) || 0,
      successRate: Number(row.success_rate) || 0
    })) : []
  };
}

async function getErrorMetrics(startDate: Date, endDate: Date) {
  // Error rate by type
  const errorsByType = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      createdAt: { gte: startDate, lte: endDate },
      success: false
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });

  // Error rate over time
  const errorRateQuery = `
    SELECT 
      DATE_TRUNC('hour', created_at) as hour,
      COUNT(*) as total_requests,
      COUNT(CASE WHEN NOT success THEN 1 END) as failed_requests,
      (COUNT(CASE WHEN NOT success THEN 1 END)::float / COUNT(*)) * 100 as error_rate
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY hour
    ORDER BY hour;
  `;

  const errorRateData = await prisma.$queryRawUnsafe(errorRateQuery, startDate, endDate);

  // Top error messages (from metadata if available)
  const topErrorsQuery = `
    SELECT 
      COALESCE(metadata->>'error', 'Unknown error') as error_message,
      COUNT(*) as occurrence_count
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND success = false
      AND metadata->>'error' IS NOT NULL
    GROUP BY error_message
    ORDER BY occurrence_count DESC
    LIMIT 10;
  `;

  const topErrorsData = await prisma.$queryRawUnsafe(topErrorsQuery, startDate, endDate);

  return {
    errorsByType: errorsByType.map(error => ({
      type: error.action,
      count: error._count.id
    })),
    errorRateOverTime: Array.isArray(errorRateData) ? errorRateData.map((row: any) => ({
      hour: row.hour,
      totalRequests: Number(row.total_requests) || 0,
      failedRequests: Number(row.failed_requests) || 0,
      errorRate: Number(row.error_rate) || 0
    })) : [],
    topErrors: Array.isArray(topErrorsData) ? topErrorsData.map((row: any) => ({
      message: row.error_message,
      count: Number(row.occurrence_count) || 0
    })) : []
  };
}

async function getDatabaseHealth() {
  try {
    const startTime = Date.now();
    
    // Test database connectivity and performance
    const userCount = await prisma.user.count();
    const auditLogCount = await prisma.auditLog.count();
    
    const responseTime = Date.now() - startTime;

    // Get database size info (PostgreSQL specific)
    const dbSizeQuery = `
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
        (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
    `;

    let dbStats = null;
    try {
      const result = await prisma.$queryRawUnsafe(dbSizeQuery);
      dbStats = Array.isArray(result) && result[0] ? result[0] : null;
    } catch (error) {
      console.warn('Could not fetch database stats:', error);
    }

    return {
      status: responseTime < 1000 ? 'healthy' : responseTime < 5000 ? 'warning' : 'critical',
      responseTime,
      connectionStatus: 'connected',
      recordCounts: {
        users: userCount,
        auditLogs: auditLogCount
      },
      databaseSize: dbStats ? (dbStats as any).database_size : 'unknown',
      tableCount: dbStats ? Number((dbStats as any).table_count) : 0,
      activeConnections: dbStats ? Number((dbStats as any).active_connections) : 0
    };
  } catch (error) {
    return {
      status: 'critical',
      responseTime: null,
      connectionStatus: 'failed',
      error: error instanceof Error ? error.message : 'Database connection failed'
    };
  }
}

async function getAPIHealthMetrics(startDate: Date, endDate: Date) {
  // API endpoint health
  const endpointHealthQuery = `
    SELECT 
      action,
      COUNT(*) as total_requests,
      AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100 as success_rate,
      AVG(COALESCE((metadata->>'duration')::numeric, 0)) as avg_duration
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
    GROUP BY action
    HAVING COUNT(*) >= 10
    ORDER BY total_requests DESC;
  `;

  const endpointHealth = await prisma.$queryRawUnsafe(endpointHealthQuery, startDate, endDate);

  // Rate limiting hits
  const rateLimitHits = await prisma.auditLog.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      metadata: {
        path: ['rateLimited'],
        equals: true
      }
    }
  });

  // API version usage
  const apiVersions = await prisma.auditLog.groupBy({
    by: ['platform'],
    where: {
      createdAt: { gte: startDate, lte: endDate }
    },
    _count: { id: true }
  });

  return {
    endpointHealth: Array.isArray(endpointHealth) ? endpointHealth.map((row: any) => ({
      endpoint: row.action,
      totalRequests: Number(row.total_requests) || 0,
      successRate: Number(row.success_rate) || 0,
      avgDuration: Number(row.avg_duration) || 0,
      status: Number(row.success_rate) >= 99 ? 'healthy' : 
              Number(row.success_rate) >= 95 ? 'warning' : 'critical'
    })) : [],
    rateLimitHits,
    platformUsage: apiVersions.map(version => ({
      platform: version.platform || 'unknown',
      requests: version._count.id
    }))
  };
}

async function getResourceUsage() {
  // Get current Node.js memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = {
    used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
    rss: Math.round(memoryUsage.rss / 1024 / 1024)
  };

  // Get system info
  const cpuUsage = process.cpuUsage();
  const uptime = Math.round(process.uptime());
  const loadAvg = os.loadavg();
  const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
  const freeMemory = Math.round(os.freemem() / 1024 / 1024);

  return {
    memory: {
      heap: memoryUsageMB,
      system: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
        usagePercentage: ((totalMemory - freeMemory) / totalMemory) * 100
      }
    },
    cpu: {
      usage: cpuUsage,
      loadAverage: loadAvg,
      cores: os.cpus().length
    },
    uptime,
    platform: {
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname()
    }
  };
}

async function getUptimeMetrics(startDate: Date, endDate: Date) {
  // Calculate uptime based on successful requests
  const hourlyUptimeQuery = `
    WITH hourly_stats AS (
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as total_requests,
        COUNT(CASE WHEN success THEN 1 END) as successful_requests
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY hour
    )
    SELECT 
      hour,
      total_requests,
      successful_requests,
      CASE 
        WHEN total_requests = 0 THEN 0
        ELSE (successful_requests::float / total_requests) * 100
      END as uptime_percentage
    FROM hourly_stats
    ORDER BY hour;
  `;

  const hourlyUptime = await prisma.$queryRawUnsafe(hourlyUptimeQuery, startDate, endDate);

  // Calculate SLA metrics
  const totalHours = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
  const uptimeData = Array.isArray(hourlyUptime) ? hourlyUptime : [];
  const avgUptime = uptimeData.length > 0 
    ? uptimeData.reduce((sum: number, row: any) => sum + (Number(row.uptime_percentage) || 0), 0) / uptimeData.length
    : 100;

  const slaCompliance = {
    target: 99.9,
    actual: avgUptime,
    met: avgUptime >= 99.9
  };

  return {
    overallUptime: avgUptime,
    slaCompliance,
    uptimeByHour: uptimeData.map((row: any) => ({
      hour: row.hour,
      totalRequests: Number(row.total_requests) || 0,
      successfulRequests: Number(row.successful_requests) || 0,
      uptimePercentage: Number(row.uptime_percentage) || 0
    })),
    downtimeIncidents: uptimeData.filter((row: any) => Number(row.uptime_percentage) < 99).length
  };
}

async function getSecurityMetrics(startDate: Date, endDate: Date) {
  // Failed authentication attempts
  const failedLogins = await prisma.auditLog.count({
    where: {
      action: { in: ['login', 'api_key_auth'] },
      success: false,
      createdAt: { gte: startDate, lte: endDate }
    }
  });

  // Suspicious IP addresses
  const suspiciousIPs = await prisma.auditLog.groupBy({
    by: ['ip'],
    where: {
      success: false,
      createdAt: { gte: startDate, lte: endDate }
    },
    _count: { id: true },
    having: {
      id: { _count: { gt: 10 } }
    },
    orderBy: { _count: { id: 'desc' } },
    take: 10
  });

  // Rate limit violations
  const rateLimitViolations = await prisma.auditLog.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      metadata: {
        path: ['rateLimited'],
        equals: true
      }
    }
  });

  return {
    failedLogins,
    suspiciousIPs: suspiciousIPs.map(ip => ({
      address: ip.ip || 'unknown',
      attempts: ip._count.id
    })),
    rateLimitViolations,
    securityScore: calculateSecurityScore(failedLogins, suspiciousIPs.length, rateLimitViolations)
  };
}

async function getDetailedSystemMetrics(startDate: Date, endDate: Date) {
  // Most active users
  const activeUsers = await prisma.auditLog.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: startDate, lte: endDate },
      userId: { not: '' }
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10
  });

  // Slowest endpoints
  const slowEndpoints = await prisma.$queryRawUnsafe(`
    SELECT 
      action,
      AVG(COALESCE((metadata->>'duration')::numeric, 0)) as avg_duration,
      COUNT(*) as request_count
    FROM audit_logs
    WHERE created_at >= $1 AND created_at <= $2
      AND metadata->>'duration' IS NOT NULL
    GROUP BY action
    HAVING COUNT(*) >= 5
    ORDER BY avg_duration DESC
    LIMIT 10;
  `, startDate, endDate);

  return {
    mostActiveUsers: activeUsers.map(user => ({
      userId: user.userId,
      requestCount: typeof user._count === 'object' && user._count ? Object.values(user._count)[0] as number || 0 : 0
    })),
    slowestEndpoints: Array.isArray(slowEndpoints) ? slowEndpoints.map((row: any) => ({
      endpoint: row.action,
      avgDuration: Number(row.avg_duration) || 0,
      requestCount: Number(row.request_count) || 0
    })) : []
  };
}

function calculateHealthScore(metrics: {
  successRate: number;
  uptimeHours: number;
  totalRequests: number;
  loadAverage: number;
  cpuCount: number;
}): number {
  const { successRate, uptimeHours, totalRequests, loadAverage, cpuCount } = metrics;
  
  // Weight different factors
  const successRateScore = successRate; // 0-100
  const uptimeScore = Math.min(100, (uptimeHours / (24 * 30)) * 100); // Assume 30 days max
  const requestVolumeScore = totalRequests > 1000 ? 100 : (totalRequests / 1000) * 100;
  const loadScore = Math.max(0, 100 - (loadAverage / cpuCount) * 100);
  
  // Weighted average
  const healthScore = (
    successRateScore * 0.4 +
    uptimeScore * 0.3 +
    requestVolumeScore * 0.2 +
    loadScore * 0.1
  );
  
  return Math.round(Math.max(0, Math.min(100, healthScore)));
}

function calculateSecurityScore(failedLogins: number, suspiciousIPs: number, rateLimitViolations: number): number {
  let score = 100;
  
  // Deduct points for security issues
  score -= Math.min(30, failedLogins / 10); // Max 30 points for failed logins
  score -= Math.min(40, suspiciousIPs * 5); // 5 points per suspicious IP
  score -= Math.min(20, rateLimitViolations / 50); // 1 point per 50 rate limit hits
  
  return Math.round(Math.max(0, score));
}