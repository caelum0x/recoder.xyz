/**
 * @module patterns
 *
 * Barrel export for collaboration pattern templates.
 */

export type {
  PatternType,
  PatternConfig,
  PatternInput,
  PatternResult,
  CollaborationPattern,
  AgentRef,
  DirectHandoffInput,
  SupervisorInput,
  SubtaskDef,
  CompetitiveInput,
} from './types';

export { DirectHandoffPattern } from './direct-handoff';
export { SupervisorOrchestrationPattern } from './supervisor-orchestration';
export { CompetitivePattern } from './competitive-pattern';
export { PatternRegistry, getPatternRegistry, resetPatternRegistry } from './pattern-registry';
export { patternRouter } from './pattern.routes';
