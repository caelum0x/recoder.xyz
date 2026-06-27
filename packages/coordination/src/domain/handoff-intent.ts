/**
 * HandoffIntent — the parsed intent of a handoff. MERGED from the
 * `'handoff' | 'delegate' | 'review' | 'message'` union + `INTENT_PREFIXES`
 * (`handoff:`/`delegate:`/`review:`) in
 * `docker-backend/src/a2a/autonomous-routing.service.ts`. Extended with `merge`
 * per the design (the pipeline merge stage).
 */

export type HandoffIntent = 'handoff' | 'delegate' | 'review' | 'merge';

export const HANDOFF_INTENTS: readonly HandoffIntent[] = [
  'handoff',
  'delegate',
  'review',
  'merge',
] as const;

/** Channel-message prefixes that select an intent (MERGED from INTENT_PREFIXES). */
export const HANDOFF_INTENT_PREFIXES: Readonly<Record<string, HandoffIntent>> = {
  'handoff:': 'handoff',
  'delegate:': 'delegate',
  'review:': 'review',
  'merge:': 'merge',
};

export type ParsedHandoffIntent = {
  intent: HandoffIntent;
  targetAgentId: string;
  prompt: string;
};
