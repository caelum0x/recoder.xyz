import { z } from 'zod';
import type { RuntimePolicy } from '@recoder/agent-runtimes';

/**
 * Zod parse of the `RuntimePolicy` contract owned by `@recoder/agent-runtimes`.
 * We re-validate at the runtime boundary (never trust external input) but never
 * redefine the canonical shape — the inferred type is asserted against the source.
 */
export const runtimePolicySchema = z.object({
  requireSignedEnvelope: z.boolean(),
  enforceWorkLocks: z.boolean(),
  allowNetwork: z.boolean(),
  allowShell: z.boolean(),
  approvalMode: z.enum(['manual', 'policy', 'auto']),
});

export type RuntimePolicyParsed = z.infer<typeof runtimePolicySchema>;

// Compile-time guarantee that our schema stays in lockstep with the source contract.
const _policyShapeCheck: RuntimePolicyParsed extends RuntimePolicy ? true : never = true;
void _policyShapeCheck;

export function parseRuntimePolicy(input: unknown): RuntimePolicy {
  return runtimePolicySchema.parse(input);
}

export type { RuntimePolicy };
