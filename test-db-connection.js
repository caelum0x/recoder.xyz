const { PrismaClient } = require('@prisma/client');

// Test database connection
async function testDbConnection() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://neondb_owner:npg_LDgwo1PRFh2J@ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
      }
    }
  });

  try {
    console.log('Testing database connection...');
    
    // Test simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful:', result);
    
    // Test actual analytics query (same as the endpoint)
    const performanceData = await prisma.performanceLog.findMany({
      take: 5,
      select: {
        type: true,
        duration: true,
        success: true,
        timestamp: true,
        userId: true
      }
    });
    
    console.log('✅ Performance data query successful:', performanceData.length, 'records');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDbConnection();