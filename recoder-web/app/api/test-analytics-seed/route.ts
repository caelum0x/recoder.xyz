import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function POST() {
  try {
    const prisma = getPrisma();
    
    console.log('🌱 Seeding test analytics data...');
    
    // Create test performance logs
    const performanceLogs = await prisma.performanceLog.createMany({
      data: [
        {
          type: 'navigation',
          duration: 1200,
          url: '/api/test',
          success: true,
          userId: 'test-user-1',
          sessionId: 'session-1',
          platform: 'web',
          timestamp: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          metadata: { source: 'test-seed' }
        },
        {
          type: 'api_call',
          duration: 850,
          url: '/api/analytics/usage-stats',
          success: true,
          userId: 'test-user-1',
          sessionId: 'session-1',
          platform: 'web',
          timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          metadata: { source: 'test-seed' }
        },
        {
          type: 'navigation',
          duration: 900,
          url: '/dashboard',
          success: true,
          userId: 'test-user-2',
          sessionId: 'session-2',
          platform: 'web',
          timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          metadata: { source: 'test-seed' }
        },
        {
          type: 'api_call',
          duration: 500,
          url: '/api/realtime',
          success: true,
          userId: 'test-user-3',
          sessionId: 'session-3',
          platform: 'web',
          timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          metadata: { source: 'test-seed' }
        }
      ]
    });
    
    // Create test error logs
    const errorLogs = await prisma.errorLog.createMany({
      data: [
        {
          type: 'api_error',
          message: 'Test API timeout error',
          url: '/api/test-error',
          sessionId: 'session-error-1',
          platform: 'web',
          severity: 'medium',
          userAgent: 'Mozilla/5.0 Test Browser',
          timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
          context: { source: 'test-seed', errorCode: 'TIMEOUT' }
        }
      ]
    });
    
    console.log(`✅ Created ${performanceLogs.count} performance logs and ${errorLogs.count} error logs`);
    
    return NextResponse.json({
      success: true,
      performanceLogs: performanceLogs.count,
      errorLogs: errorLogs.count,
      message: 'Test analytics data seeded successfully'
    });
    
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    return NextResponse.json(
      { error: 'Failed to seed test data', details: error.message },
      { status: 500 }
    );
  }
}