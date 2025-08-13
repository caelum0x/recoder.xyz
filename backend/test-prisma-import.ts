// Simple test to verify PrismaClient import works
import { PrismaClient } from '@prisma/client';

console.log('PrismaClient imported successfully:', typeof PrismaClient);

const client = new PrismaClient();
console.log('PrismaClient instance created successfully');

export { client };
