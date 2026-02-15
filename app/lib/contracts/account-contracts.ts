import { z } from "zod";

const accountUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  emailVerified: z.union([z.string(), z.date(), z.null()]).optional(),
  role: z.string().optional(),
  isActive: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
}).passthrough();

export const accountGetResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: accountUserSchema,
  }),
});

export const accountPutResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    message: z.string(),
    emailChangePending: z.literal(true),
    newEmail: z.string().email(),
  }),
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      user: accountUserSchema,
    }),
  }),
]);

export const accountDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export function assertAccountGetResponse(payload: unknown) {
  return accountGetResponseSchema.parse(payload);
}

export function assertAccountPutResponse(payload: unknown) {
  return accountPutResponseSchema.parse(payload);
}

export function assertAccountDeleteResponse(payload: unknown) {
  return accountDeleteResponseSchema.parse(payload);
}
