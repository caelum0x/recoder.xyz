import { z } from 'zod';

/**
 * The distribution channels a delivery can target. Each maps to a
 * ChannelPublisher in the engine's channel registry.
 */
export type DistributionChannel =
  | 'npm'
  | 'homebrew'
  | 'desktop'
  | 'mobile'
  | 'web_site'
  | 'preview'
  | 'download';

export const DistributionChannelSchema = z.enum([
  'npm',
  'homebrew',
  'desktop',
  'mobile',
  'web_site',
  'preview',
  'download',
]);

export const DISTRIBUTION_CHANNELS: readonly DistributionChannel[] = [
  'npm',
  'homebrew',
  'desktop',
  'mobile',
  'web_site',
  'preview',
  'download',
] as const;

/**
 * Channels that produce a customer-visible change and therefore MUST pass the
 * approval gate before publishing (production rule). `preview` and `download`
 * are signed/entitlement-gated but not blanket approval-gated.
 */
export const CUSTOMER_VISIBLE_CHANNELS: ReadonlySet<DistributionChannel> = new Set([
  'npm',
  'homebrew',
  'desktop',
  'mobile',
  'web_site',
]);

/** True when publishing to this channel requires a recorded Approval. */
export function requiresApproval(channel: DistributionChannel): boolean {
  return CUSTOMER_VISIBLE_CHANNELS.has(channel);
}
