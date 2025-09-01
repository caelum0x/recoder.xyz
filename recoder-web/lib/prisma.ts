import { PrismaClient } from "@prisma/client";
import { cache } from "react";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_LDgwo1PRFh2J@ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

export const getPrisma = cache(() => {
  console.log('Creating Prisma client with URL:', DATABASE_URL ? DATABASE_URL.substring(0, 30) + '...' : 'No URL');
  
  return new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL
      }
    }
  });
});

// Export default prisma instance
export const prisma = getPrisma();
 