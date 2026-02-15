// pnpm symlinked @prisma/client can miss generated type re-exports in this workspace.
// Importing from the generated client path keeps PrismaClient typing stable for local checks.
export { PrismaClient, Prisma } from '../node_modules/.prisma/client';
