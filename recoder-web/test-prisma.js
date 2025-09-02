#!/usr/bin/env node

// Test script to verify Prisma connection and chat creation
const { PrismaClient } = require('@prisma/client');

async function testPrismaConnection() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    },
    log: ['error', 'warn', 'info'],
    errorFormat: 'pretty',
  });

  try {
    console.log('🔌 Testing Prisma connection...');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Database connection successful');

    // Test basic query
    const userCount = await prisma.user.count();
    console.log(`📊 Total users in database: ${userCount}`);

    // Test chat creation (without user association)
    console.log('🆕 Testing chat creation...');
    const testChat = await prisma.chat.create({
      data: {
        model: 'claude-3-5-sonnet-20241022',
        quality: 'high',
        prompt: 'Test chat for Prisma verification',
        title: 'Test Chat',
        shadcn: true,
        userId: null,
      },
    });
    console.log(`✅ Test chat created with ID: ${testChat.id}`);

    // Clean up test chat
    await prisma.chat.delete({
      where: { id: testChat.id }
    });
    console.log('🧹 Test chat cleaned up');

    console.log('🎉 All Prisma tests passed!');
    
  } catch (error) {
    console.error('❌ Prisma test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('🔚 Prisma connection closed');
  }
}

testPrismaConnection().catch(console.error);
