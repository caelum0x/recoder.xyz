const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function introspect() {
  try {
    // Get the actual table structure
    const tableInfo = await prisma.$queryRaw`
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name IN ('accounts', 'users', 'sessions', 'verifications')
      ORDER BY table_name, ordinal_position;
    `;
    
    console.log('=== DATABASE SCHEMA ===');
    console.log(JSON.stringify(tableInfo, null, 2));
    
    // Try to query accounts table
    console.log('\n=== TESTING ACCOUNTS QUERY ===');
    try {
      const accounts = await prisma.$queryRaw`SELECT * FROM accounts LIMIT 1`;
      console.log('Direct SQL query works:', accounts.length, 'records');
    } catch (e) {
      console.log('Direct SQL error:', e.message);
    }
    
    // Try using Prisma model
    try {
      const accountsPrisma = await prisma.accounts.findMany({ take: 1 });
      console.log('Prisma model query works:', accountsPrisma.length, 'records');
    } catch (e) {
      console.log('Prisma model error:', e.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

introspect();
