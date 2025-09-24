const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testUser() {
  try {
    const user = await prisma.user.findFirst();
    console.log('User fields:', Object.keys(user || {}));
    console.log('Has subscription:', 'subscription' in (user || {}));
    if (user) {
      console.log('Subscription value:', user.subscription);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testUser();
