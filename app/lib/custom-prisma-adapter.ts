import { randomUUID } from "crypto";
import { prisma as defaultPrisma } from "./prisma";
import { logger } from '@/lib/logger';

type PrismaClient = typeof defaultPrisma;

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Custom Prisma adapter for Better Auth that properly handles Prisma models
 * with @map directives for snake_case database columns.
 *
 * IMPORTANT: `findOne` uses `findFirst` (NOT `findUnique`) because Better Auth
 * passes where conditions as flat key-value pairs (e.g. { providerId, accountId })
 * which do not match Prisma's compound-unique syntax
 * (e.g. { providerId_accountId: { ... } }).  Using `findFirst` avoids the
 * "Unknown arg" Prisma error that silently broke account look-ups and therefore
 * social sign-in, session validation, etc.
 */
export function customPrismaAdapter(prisma: PrismaClient) {
  // Map Better Auth model names to Prisma model names
  // Better Auth uses singular names, but this DB uses plural 'users' for the main table
  const modelMap: Record<string, string> = {
    user: 'users',  // Map to plural 'users' table which has all the fields
    account: 'accounts',
    session: 'sessions',
    verification: 'verification',  // Use singular table (camelCase columns matching Better Auth)
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

  // Better Auth expects database to be a function: (options) => adapter
  return (_options: any) => ({
    id: "custom-prisma",

      async create({ model, data }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];

          if (!modelClient) {
            logger.error('Model not found in Prisma client', { model: String(prismaModel) });
            throw new Error(`Model ${prismaModel} not found`);
          }

          // Generate ID if not provided (Better Auth doesn't always provide IDs)
          if (!data.id) {
            data.id = randomUUID();
          }

          // Ensure required fields have defaults for users table
          if (model === 'user') {
            if (!data.updatedAt) {
              data.updatedAt = new Date();
            }
          }

          const result = await modelClient.create({ data });
          return result;
        } catch (error) {
          logger.error('Error creating model', { model: String(model), error: errMsg(error) });
          throw error;
        }
      },

      /**
       * Uses `findFirst` instead of `findUnique` because Better Auth where
       * clauses can include multiple fields (e.g. providerId + accountId)
       * that form a compound unique in Prisma.  `findUnique` rejects those
       * as "unknown arg", while `findFirst` happily accepts them.
       */
      async findOne({ model, where }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];

          if (!modelClient) {
            return null;
          }

          const prismaWhere = transformWhere(where);
          const result = await modelClient.findFirst({
            where: prismaWhere,
          });
          return result;
        } catch (error) {
          logger.error('Error finding model', { model: String(model), error: errMsg(error) });
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
        } catch (error) {
          logger.error('Error finding many models', { model: String(model), error: errMsg(error) });
          return [];
        }
      },

      async count({ model, where }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];
          if (!modelClient) return 0;

          const result = await modelClient.count({
            where: where ? transformWhere(where) : undefined,
          });
          return result;
        } catch (error) {
          logger.error('Error counting models', { model: String(model), error: errMsg(error) });
          return 0;
        }
      },

      /**
       * Better Auth sends `{ model, update: {...}, where: [...] }` — note
       * the field is called `update`, not `data`.  We accept both for
       * backward-compatibility with any direct callers that use `data`.
       */
      async update({ model, where, update, data }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];

          if (!modelClient) {
            throw new Error(`Model ${prismaModel} not found`);
          }

          // Better Auth uses "update"; legacy callers may use "data"
          const updateData = update ?? data;

          // If updateData is empty or undefined, Better Auth might just be checking existence
          // Return the record without updating
          if (!updateData || Object.keys(updateData).length === 0) {
            return await modelClient.findFirst({
              where: transformWhere(where)
            });
          }

          // Auto-update updatedAt for users table
          if (model === 'user' && !updateData.updatedAt) {
            updateData.updatedAt = new Date();
          }

          // Use updateMany + findFirst to avoid Prisma compound-unique issues
          // (Better Auth passes flat where like { id: "..." } which works for
          // updateMany, but not for update when compound keys are involved.)
          const prismaWhere = transformWhere(where);
          await modelClient.updateMany({
            where: prismaWhere,
            data: updateData
          });
          // Return the updated record
          const result = await modelClient.findFirst({
            where: prismaWhere,
          });
          return result;
        } catch (error) {
          logger.error('Error updating model', { model: String(model), error: errMsg(error) });
          throw error;
        }
      },

      /**
       * Better Auth sends `{ model, update: {...}, where: [...] }`.
       */
      async updateMany({ model, where, update, data }: any) {
        try {
          const prismaModel = modelMap[model] || model;
          const modelClient = (prisma as any)[prismaModel];

          if (!modelClient) {
            throw new Error(`Model ${prismaModel} not found`);
          }

          const updateData = update ?? data;
          const result = await modelClient.updateMany({
            where: transformWhere(where),
            data: updateData
          });
          return result;
        } catch (error) {
          logger.error('Error updating many models', { model: String(model), error: errMsg(error) });
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

          // Use deleteMany to avoid Prisma compound-unique issues, then return count
          const prismaWhere = transformWhere(where);
          const result = await modelClient.deleteMany({
            where: prismaWhere,
          });
          return result;
        } catch (error) {
          logger.error('Error deleting model', { model: String(model), error: errMsg(error) });
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
        } catch (error) {
          logger.error('Error deleting many models', { model: String(model), error: errMsg(error) });
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
                return await modelClient.findFirst({
                  where: transformWhere(where)
                });
              },

              async update({ model, where, update, data }: any) {
                const prismaModel = modelMap[model] || model;
                const modelClient = (tx as any)[prismaModel];
                const updateData = update ?? data;
                const prismaWhere = transformWhere(where);
                await modelClient.updateMany({
                  where: prismaWhere,
                  data: updateData
                });
                return await modelClient.findFirst({
                  where: prismaWhere,
                });
              },
            };

            return await callback(txAdapter);
          });
        } catch (error) {
          logger.error('Transaction error', { error: errMsg(error) });
          throw error;
        }
      },
    });
}
