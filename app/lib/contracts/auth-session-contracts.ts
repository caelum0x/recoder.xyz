import { z } from "zod";

const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  subscriptionPlan: z.string().optional(),
  subscriptionStatus: z.string().optional(),
});

const sessionMetaSchema = z.object({
  id: z.string(),
  expiresAt: z.union([z.string(), z.date()]).optional(),
});

export const authSessionGetResponseSchema = z.union([
  z.object({
    user: z.null(),
  }),
  z.object({
    user: sessionUserSchema,
    session: sessionMetaSchema,
  }),
]);

const listedSessionSchema = z.object({
  id: z.string(),
  device: z.string(),
  browser: z.string(),
  os: z.string(),
  deviceType: z.string(),
  ipAddress: z.string(),
  location: z.string(),
  lastActive: z.union([z.string(), z.date()]),
  createdAt: z.union([z.string(), z.date()]),
  current: z.boolean(),
});

export const authSessionsListResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    sessions: z.array(listedSessionSchema),
  }),
  z.object({
    success: z.literal(true),
    message: z.string(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export function assertAuthSessionGetResponse(payload: unknown) {
  return authSessionGetResponseSchema.parse(payload);
}

export function assertAuthSessionsListResponse(payload: unknown) {
  return authSessionsListResponseSchema.parse(payload);
}
