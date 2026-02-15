import { z } from "zod";

export const APP_CLI_SESSION_CONTRACT = "app-cli-session-v1" as const;

const cliSessionSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export const cliSessionsListResponseSchema = z.object({
  contract: z.literal(APP_CLI_SESSION_CONTRACT),
  sessions: z.array(cliSessionSchema),
});

export const cliSessionActionResponseSchema = z
  .object({
    contract: z.literal(APP_CLI_SESSION_CONTRACT),
    success: z.boolean().optional(),
    message: z.string().optional(),
    sessionId: z.string().optional(),
    revokedCount: z.number().optional(),
  })
  .passthrough();

export const cliSessionErrorResponseSchema = z.object({
  contract: z.literal(APP_CLI_SESSION_CONTRACT),
  error: z.string(),
  message: z.string().optional(),
});

export function assertCliSessionsListResponse(payload: unknown) {
  return cliSessionsListResponseSchema.parse(payload);
}

export function assertCliSessionActionResponse(payload: unknown) {
  return cliSessionActionResponseSchema.parse(payload);
}

export function assertCliSessionErrorResponse(payload: unknown) {
  return cliSessionErrorResponseSchema.parse(payload);
}

