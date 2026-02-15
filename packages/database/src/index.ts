/**
 * @recoder/database — Unified database access for all recoder apps.
 *
 * The canonical Prisma schema lives at app/prisma/schema.prisma.
 * All apps share the same PostgreSQL database via this package.
 *
 * Usage:
 *   import { db } from "@recoder/database";
 *   const user = await db.users.findUnique({ where: { id } });
 */

export { db, db as prisma, default } from "./client.js";
export type { PrismaClient } from "./client.js";
