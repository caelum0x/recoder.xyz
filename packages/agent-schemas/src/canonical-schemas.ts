import { agentProfileSchema } from './agent-profile.schema';
import { approvalSchema } from './approval.schema';
import { artifactSchema } from './artifact.schema';
import { contextPackSchema } from './context-pack.schema';
import { instructionBundleSchema } from './instruction-bundle.schema';
import { memoryCandidateSchema } from './memory-candidate.schema';
import { ossComponentSchema, recoderComponentSchema } from './oss-component.schema';
import { palPlanSchema } from './pal-plan.schema';
import { policyDecisionSchema } from './policy-decision.schema';
import { runEventSchema } from './run-event.schema';
import type { SchemaGuard, SchemaResult } from './schema-guard';
import { taskSpecSchema } from './task-spec.schema';
import { workLockSchema } from './work-lock.schema';
import { workSignalSchema } from './work-signal.schema';

export const agentOsCanonicalSchemas = {
  AgentProfile: agentProfileSchema,
  TaskSpec: taskSpecSchema,
  ContextPack: contextPackSchema,
  PALPlan: palPlanSchema,
  InstructionBundle: instructionBundleSchema,
  RunEvent: runEventSchema,
  Artifact: artifactSchema,
  Approval: approvalSchema,
  MemoryCandidate: memoryCandidateSchema,
  WorkLock: workLockSchema,
  WorkSignal: workSignalSchema,
  PolicyDecision: policyDecisionSchema,
  OSSComponentDescriptor: ossComponentSchema,
  RecoderComponentDescriptor: recoderComponentSchema,
} as const;

export type AgentOsCanonicalSchemaName = keyof typeof agentOsCanonicalSchemas;

export function getAgentOsCanonicalSchema(name: AgentOsCanonicalSchemaName): SchemaGuard<unknown> {
  return agentOsCanonicalSchemas[name] as SchemaGuard<unknown>;
}

export function validateAgentOsCanonicalSchema(
  name: AgentOsCanonicalSchemaName,
  value: unknown,
): SchemaResult<unknown> {
  return getAgentOsCanonicalSchema(name).parse(value);
}
