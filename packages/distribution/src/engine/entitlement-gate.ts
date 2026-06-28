import type { DeliveryRequest } from '../domain/delivery';
import type { DistributionChannel } from '../domain/channel';
import type { Feature, Plan } from '../domain/subscription-plan';
import type { EntitlementResolver } from '../channels/billing/entitlement-resolver';

/** The feature each channel requires an actor to be entitled to. */
const CHANNEL_FEATURE: Partial<Record<DistributionChannel, Feature>> = {
  web_site: 'publish_site',
  preview: 'signed_preview',
  desktop: 'desktop_signed_build',
};

export interface EntitlementGateDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly requiredFeature?: Feature;
}

/**
 * Block a delivery the actor is not entitled to. Fail safe: on a resolution
 * error or a missing grant the gate DENIES — it never optimistically allows.
 * Channels with no feature requirement (e.g. download, npm) pass the gate
 * (their gating is entitlement/quota at a finer level).
 */
export async function entitlementGate(
  resolver: EntitlementResolver,
  req: DeliveryRequest,
  actorPlan: Plan,
): Promise<EntitlementGateDecision> {
  const required = CHANNEL_FEATURE[req.channel];
  if (!required) {
    return { allowed: true };
  }
  const subject = { subjectId: req.actor.subjectId, kind: req.actor.kind };
  let allowed = false;
  try {
    allowed = await resolver.hasFeature(subject, required, actorPlan);
  } catch {
    allowed = false; // deny on miss
  }
  return allowed
    ? { allowed: true, requiredFeature: required }
    : {
        allowed: false,
        requiredFeature: required,
        reason: `actor not entitled to '${required}' for channel '${req.channel}'`,
      };
}
