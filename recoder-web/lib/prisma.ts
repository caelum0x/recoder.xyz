import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { cache } from "react";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_LDgwo1PRFh2J@ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

export const getPrisma = cache(() => {
  console.log('Creating Prisma client with URL:', DATABASE_URL ? DATABASE_URL.substring(0, 30) + '...' : 'No URL');
  
  try {
    // Use Neon serverless adapter for edge runtime compatibility
    const connectionString = process.env.DATABASE_URL || DATABASE_URL;
    console.log('Using connection string for Neon Pool:', connectionString ? 'Available' : 'Missing');
    
    // Create Neon Pool with explicit configuration
    const neon = new Pool({ 
      connectionString: connectionString
    });
    
    // Create adapter with proper type handling
    const adapter = new PrismaNeon(neon as any) as any;
    
    const client = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      errorFormat: 'pretty',
    });

    return client;
  } catch (error) {
    console.error('Failed to create Prisma client:', error);
    throw new Error(`Prisma initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Export default prisma instance
export const prisma = getPrisma();
 