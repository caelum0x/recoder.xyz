const { PrismaClient } = require('@prisma/client');

async function seedTestData() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🌱 Seeding test data for analytics...');
    
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
    
    // Test query the data
    const recentActivity = await prisma.performanceLog.count({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });
    
    console.log(`📊 Found ${recentActivity} recent activities in the last 24 hours`);
    
  } catch (error) {
    console.error('❌ Error seeding test data:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData();