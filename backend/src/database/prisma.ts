// Prisma Database Client
// Centralized database connection management

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Database connection handler
prisma.$connect()
  .then(() => {
    logger.info('Successfully connected to PostgreSQL database');
  })
  .catch((error) => {
    logger.error('Failed to connect to database:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Database connection closed');
});

export default prisma;