import * as PrismaPkg from '@prisma/client';

// Some workspace installs temporarily expose @prisma/client without typed named
// exports until client generation is finalized. Keep compile-time stable.
export const PrismaClient = (PrismaPkg as any).PrismaClient;
export const Prisma = (PrismaPkg as any).Prisma;
