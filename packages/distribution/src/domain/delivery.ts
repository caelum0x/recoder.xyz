import { z } from 'zod';
import { DistributionChannelSchema, type DistributionChannel } from './channel';
import { ChannelHealthSchema, type ChannelHealth } from './health-state';

/**
 * A request to deliver an agent-os Artifact to a distribution channel. The
 * `artifactId` references the canonical agent-os artifact (never redefined
 * here); `actor` is the requesting subject; `approvalRef` is filled by the
 * approval gate when one is recorded.
 */
export interface DeliveryRequest {
  readonly requestId: string;
  readonly artifactId: string;
  readonly taskId: string;
  readonly channel: DistributionChannel;
  readonly actor: {
    readonly subjectId: string;
    readonly kind: 'user' | 'org';
  };
  /** Idempotency key so a retried request never double-publishes. */
  readonly idempotencyKey: string;
  readonly approvalRef?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const DeliveryRequestSchema: z.ZodType<DeliveryRequest> = z.object({
  requestId: z.string().min(1),
  artifactId: z.string().min(1),
  taskId: z.string().min(1),
  channel: DistributionChannelSchema,
  actor: z.object({
    subjectId: z.string().min(1),
    kind: z.enum(['user', 'org']),
  }),
  idempotencyKey: z.string().min(1),
  approvalRef: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type DeliveryStatus = 'completed' | 'failed' | 'pending_approval' | 'denied';

/**
 * The signed, evidence-bearing result of a delivery. Carries the public
 * `{ url, sha256, health, approvalRef }` recorded back to agent-os as a
 * RunEvent. A delivery is only `completed` after the published surface reports
 * healthy — no inferred success.
 */
export interface DeliveryReceipt {
  readonly requestId: string;
  readonly channel: DistributionChannel;
  readonly status: DeliveryStatus;
  readonly url?: string;
  readonly sha256?: string;
  readonly health: ChannelHealth;
  readonly approvalRef?: string;
  readonly errorCode?: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly completedAt: string;
}

export const DeliveryReceiptSchema: z.ZodType<DeliveryReceipt> = z.object({
  requestId: z.string().min(1),
  channel: DistributionChannelSchema,
  status: z.enum(['completed', 'failed', 'pending_approval', 'denied']),
  url: z.string().optional(),
  sha256: z.string().optional(),
  health: ChannelHealthSchema,
  approvalRef: z.string().optional(),
  errorCode: z.string().optional(),
  evidence: z.record(z.unknown()),
  completedAt: z.string().min(1),
});
