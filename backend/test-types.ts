import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testTypes() {
  const user = await prisma.user.findFirst();
  
  // This should work if subscription field exists
  if (user) {
    console.log(user.subscription);
  }
}

testTypes();