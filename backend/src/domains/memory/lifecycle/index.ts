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

export { createHarvestService } from './harvest.js';
export type { HarvestService, HarvestServiceDeps, HarvestInput, HarvestResult } from './harvest.js';

export { createRelateService } from './relate.js';
export type { RelateService, RelateServiceDeps, RelateInput } from './relate.js';
