import { PrismaClient } from "@prisma/client";

/**
 * Custom Prisma adapter for Better Auth that properly handles Prisma models
 * with @map directives for snake_case database columns.
 * 
 * This adapter uses Prisma's ORM methods which automatically handle the
 * field name to column name mapping defined in the schema.
 */
export function customPrismaAdapter(prisma: PrismaClient) {
  // Map Better Auth model names to Prisma model names (capitalized)
  const modelMap: Record<string, string> = {
    user: 'user',
    account: 'account',
    session: 'session',
    verification: 'verification',
  };

  // Transform Better Auth where conditions to Prisma format
  function transformWhere(where: any): any {
    if (!where) return undefined;
    
    // If it's an array of conditions, transform each one
    if (Array.isArray(where)) {
      const transformed: any = {};
      for (const condition of where) {
        if (condition.field && condition.value !== undefined) {
          const operator = condition.operator || 'equals';
          const field = condition.field;
          
          if (operator === 'lt') {
            transformed[field] = { lt: condition.value };
          } else if (operator === 'gt') {
            transformed[field] = { gt: condition.value };
          } else if (operator === 'lte') {
            transformed[field] = { lte: condition.value };
          } else if (operator === 'gte') {
            transformed[field] = { gte: condition.value };
          } else {
            transformed[field] = condition.value;
          }
        }
      }
      return transformed;
    }
    
    return where;
  }

  // Transform Better Auth orderBy to Prisma format
  function transformOrderBy(sortBy: any): any {
    if (!sortBy) return undefined;
    
    if (sortBy.field && sortBy.direction) {
      return { [sortBy.field]: sortBy.direction.toLowerCase() };
    }
    
    return sortBy;
  }

  return () => {
    return {
      id: "custom-prisma",
      
      async create({ model, data }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          
          if (!modelClient) {
            console.error(`Model ${prismaModel} not found in Prisma client`);
            throw new Error(`Model ${prismaModel} not found`);
          }
          
          // Generate ID if not provided (Better Auth doesn't always provide IDs)
          if (!data.id) {
            data.id = crypto.randomUUID();
          }
          
          const result = await modelClient.create({ data });
          return result;
        } catch (error: any) {
          console.error(`Error creating ${model}:`, error.message);
          throw error;
        }
      },
      
      async findOne({ model, where }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          
          if (!modelClient) {
            return null;
          }
          
          const result = await modelClient.findUnique({ 
            where: transformWhere(where) 
          });
          return result;
        } catch (error: any) {
          console.error(`Error finding ${model}:`, error.message);
          return null;
        }
      },
      
      async findMany({ model, where, limit, offset, sortBy }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          
          if (!modelClient) {
            return [];
          }
          
          const query: any = {};
          if (where) query.where = transformWhere(where);
          if (limit) query.take = limit;
          if (offset) query.skip = offset;
          if (sortBy) query.orderBy = transformOrderBy(sortBy);
          
          const results = await modelClient.findMany(query);
          return results;
        } catch (error: any) {
          console.error(`Error finding many ${model}:`, error.message);
          return [];
        }
      },
      
      async update({ model, where, data }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          
          if (!modelClient) {
            throw new Error(`Model ${prismaModel} not found`);
          }
          
          // If data is empty or undefined, Better Auth might just be checking existence
          // Return the record without updating
          if (!data || Object.keys(data).length === 0) {
            return await modelClient.findUnique({ 
              where: transformWhere(where) 
            });
          }
          
          const result = await modelClient.update({ 
            where: transformWhere(where), 
            data 
          });
          return result;
        } catch (error: any) {
          console.error(`Error updating ${model}:`, error.message);
          throw error;
        }
      },
      
      async updateMany({ model, where, data }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          
          if (!modelClient) {
            throw new Error(`Model ${prismaModel} not found`);
          }
          
          const result = await modelClient.updateMany({ 
            where: transformWhere(where), 
            data 
          });
          return result;
        } catch (error: any) {
          console.error(`Error updating many ${model}:`, error.message);
          throw error;
        }
      },
      
      async delete({ model, where }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          
          if (!modelClient) {
            throw new Error(`Model ${prismaModel} not found`);
          }
          
          const result = await modelClient.delete({ 
            where: transformWhere(where) 
          });
          return result;
        } catch (error: any) {
          console.error(`Error deleting ${model}:`, error.message);
          throw error;
        }
      },
      
      async deleteMany({ model, where }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          
          if (!modelClient) {
            return { count: 0 };
          }
          
          const result = await modelClient.deleteMany({ 
            where: transformWhere(where) 
          });
          return result;
        } catch (error: any) {
          console.error(`Error deleting many ${model}:`, error.message);
          return { count: 0 };
        }
      },

      // Transaction support for Better Auth
      async transaction(callback: (tx: any) => Promise<any>) {
        try {
          return await prisma.$transaction(async (tx) => {
            // Create a transaction adapter with the same methods
            const txAdapter = {
              async create({ model, data }: any) {
                const prismaModel = modelMap[model] || model;
                const modelClient = (tx as any)[prismaModel];
                
                if (!data.id) {
                  data.id = crypto.randomUUID();
                }
                
                return await modelClient.create({ data });
              },
              
              async findOne({ model, where }: any) {
                const prismaModel = modelMap[model] || model;
                const modelClient = (tx as any)[prismaModel];
                return await modelClient.findUnique({ 
                  where: transformWhere(where) 
                });
              },
              
              async update({ model, where, data }: any) {
                const prismaModel = modelMap[model] || model;
                const modelClient = (tx as any)[prismaModel];
                return await modelClient.update({ 
                  where: transformWhere(where), 
                  data 
                });
              },
            };
            
            return await callback(txAdapter);
          });
        } catch (error: any) {
          console.error('Transaction error:', error.message);
          throw error;
        }
      },
    };
  };
}
