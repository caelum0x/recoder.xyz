/**
 * Social zod schemas — validation at the boundary. Every untrusted admin/send
 * body is parsed here before any handler trusts it (fail fast with a clear
 * message). The raw webhook body is NOT parsed here — its signature is verified
 * over the RAW bytes first (see `adapters/webhook-ingress.adapter.ts`); this file
 * validates the JSON shape only AFTER that verification.
 */
import { z } from 'zod';
import { CHANNEL_IDS } from './types.js';

/** A `ChannelId` value. */
export const channelIdSchema = z.enum(CHANNEL_IDS);

/** Admin: bind an allowlisted chat_ref → space/agent (WRITE, governance-gated). */
export const bindChannelSchema = z.object({
  chatRef: z.string().min(1),
  spaceId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  /** Hostile-by-default: an explicit `true` is required to admit the chat. */
  allow: z.boolean().default(true),
});
export type BindChannelInput = z.infer<typeof bindChannelSchema>;

/** Manual outbound send over the real ConnectorPort (WRITE, governance-gated). */
export const sendMessageSchema = z.object({
  chatRef: z.string().min(1),
  text: z.string().min(1).max(8000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * The shape of a verified webhook body AFTER signature verification. Loose by
 * design (channels vary); the connector's own `normalize()` extracts messages.
 * We only assert it is a JSON object so a malformed-but-signed body is a clean
 * 400 rather than a crash.
 */
export const webhookBodySchema = z.record(z.string(), z.unknown());
export type WebhookBody = z.infer<typeof webhookBodySchema>;
