import { PrismaClient } from "@prisma/client";
import { cache } from "react";
import { Pool } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";

// SECURITY: Never hardcode database URLs - always use environment variables
// For Edge Runtime, we need to access env vars differently
const getDatabaseUrl = () => {
  // Try multiple sources for DATABASE_URL in Edge Runtime
  if (typeof process !== 'undefined' && process.env?.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // Fallback for Edge Runtime - check globalThis
  if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.DATABASE_URL) {
    return (globalThis as any).process.env.DATABASE_URL;
  }
  return undefined;
};

// Determine runtime environment
const isEdgeRuntime = (() => {
  try {
    return typeof (globalThis as any).EdgeRuntime !== 'undefined';
  } catch {
    return false;
  }
})();

// In-memory store for when database is unavailable
export const inMemoryStore = {
  chats: new Map<string, any>(),
  messages: new Map<string, any>(),
};

export const getPrisma = cache(() => {
  const DATABASE_URL = getDatabaseUrl();

  // If no DATABASE_URL, return null immediately
  if (!DATABASE_URL || DATABASE_URL.trim() === '') {
    console.warn('⚠️  DATABASE_URL not found - using in-memory storage');
    return null;
  }

  // Validate DATABASE_URL format
  if (!DATABASE_URL.startsWith('postgres') && !DATABASE_URL.startsWith('mysql')) {
    console.warn('⚠️  Invalid DATABASE_URL format - using in-memory storage');
    return null;
  }

  console.log('✅ DATABASE_URL found, length:', DATABASE_URL.length);

  try {
    // CRITICAL: Set the environment variable for Prisma to use
    // Prisma reads from process.env.DATABASE_URL at runtime
    if (typeof process !== 'undefined' && process.env) {
      process.env.DATABASE_URL = DATABASE_URL;
    }

    if (isEdgeRuntime) {
      // Edge Runtime - Use Neon adapter with serverless pool
      const pool = new Pool({
        connectionString: DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      const adapter = new PrismaNeon(pool);

      const client = new PrismaClient({
        adapter: adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        errorFormat: 'pretty',
      });

      return client;
    } else {
      // Node.js Runtime - Use standard client with explicit datasource
      const client = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        errorFormat: 'pretty',
        datasources: {
          db: {
            url: DATABASE_URL,
          },
        },
      });

      return client;
    }
  } catch (error) {
    console.error('❌ Failed to create Prisma client:', error);
    console.warn('⚠️  Falling back to in-memory storage');
    return null;
  }
});

// Export prisma instance (may be null if DB not configured)
export const prisma = getPrisma();
 