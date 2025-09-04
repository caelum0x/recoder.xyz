import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

export async function GET() {
  const startTime = Date.now();
  
  try {
    // Enhanced health checks
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage ? process.cpuUsage() : null;
    
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      responseTime: Date.now() - startTime,
      checks: {
        database: await checkDatabase(),
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          unit: 'MB'
        },
        cpu: cpuUsage ? {
          user: cpuUsage.user,
          system: cpuUsage.system
        } : null,
        nodejs: process.version,
        disk: await checkDiskSpace(),
        api: await checkApiEndpoints()
      },
      metrics: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch
      }
    };

    // Log health check
    logger.info('Health check completed', {
      status: 'healthy',
      responseTime: healthCheck.responseTime,
      memoryUsed: healthCheck.checks.memory.used
    });

    return NextResponse.json(healthCheck, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime
      }, 
      { status: 503 }
    );
  }
}

// Database health check
async function checkDatabase(): Promise<string> {
  try {
    // TODO: Add actual database connectivity check
    // For now, just return healthy
    return 'healthy';
  } catch (error) {
    return 'unhealthy';
  }
}

// Disk space check (simplified)
async function checkDiskSpace(): Promise<{ available: boolean; message: string }> {
  try {
    // In a real implementation, you'd check actual disk space
    // For now, just return available
    return { available: true, message: 'adequate space' };
  } catch (error) {
    return { available: false, message: 'unable to check' };
  }
}

// Check critical API endpoints
async function checkApiEndpoints(): Promise<{ [key: string]: boolean }> {
  const endpoints = {
    auth: true, // TODO: Check auth endpoints
    status: true // TODO: Check status endpoint
  };
  
  return endpoints;
}