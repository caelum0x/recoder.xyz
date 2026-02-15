import { z } from 'zod';

const sessionTokenInnerSchema = z.object({
  accessToken: z.string().nullable().optional(),
});

export const sessionTokenResponseSchema = z.object({
  data: sessionTokenInnerSchema.optional(),
});

export type SessionTokenResponse = z.infer<typeof sessionTokenResponseSchema>;

export function parseSessionTokenResponse(payload: unknown): SessionTokenResponse {
  return sessionTokenResponseSchema.parse(payload);
}
