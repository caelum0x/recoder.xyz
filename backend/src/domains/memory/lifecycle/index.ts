/**
 * lifecycle barrel — candidate proposal, governed promotion, harvest, relations.
 */
export { createCandidateService } from './candidate-service.js';
export type {
  CandidateService,
  CandidateServiceDeps,
  ProposeCandidateInput,
  CandidateEvidence,
  MemoryScope,
} from './candidate-service.js';

export { createMemoryLifecycle, MEMORY_PROMOTE_ACTION, MEMORY_REJECT_ACTION } from './memory-lifecycle.js';
export type {
  MemoryLifecycle,
  MemoryLifecycleDeps,
  AcceptCandidateInput,
  RejectCandidateInput,
  AcceptResult,
  RejectResult,
} from './memory-lifecycle.js';

export { createForgetService, MEMORY_FORGET_ACTION } from './forget.js';
export type { ForgetService, ForgetServiceDeps, ForgetMemoryInput, ForgetResult } from './forget.js';

export { createHarvestService } from './harvest.js';
export type { HarvestService, HarvestServiceDeps, HarvestInput, HarvestResult } from './harvest.js';

export { createRelateService } from './relate.js';
export type { RelateService, RelateServiceDeps, RelateInput } from './relate.js';

export { createMemoryWriteAllowlist } from './write-allowlist.js';
export type {
  MemoryWriteAllowlist,
  MemoryWriteAllowlistConfig,
  MemoryWriteContext,
  AllowlistDecision,
} from './write-allowlist.js';
