/**
 * @module orchestration
 *
 * Barrel export for A2A orchestration patterns.
 */

export {
  PipelineOrchestrator,
  getPipelineOrchestrator,
  resetPipelineOrchestrator,
  type PipelineStatus,
  type PipelineStep,
  type PipelineDefinition,
  type PipelineStepResult,
  type PipelineExecution,
} from './pipeline';

export {
  ScatterGatherOrchestrator,
  getScatterGatherOrchestrator,
  resetScatterGatherOrchestrator,
  type GatherStrategy,
  type ScatterGatherStatus,
  type ScatterTarget,
  type ScatterGatherDefinition,
  type ScatterResult,
  type ScatterGatherExecution,
} from './scatter-gather';

export {
  SupervisorOrchestrator,
  getSupervisorOrchestrator,
  resetSupervisorOrchestrator,
  type RestartPolicy,
  type ChildStatus,
  type SupervisorStatus,
  type ChildSpec,
  type ChildState,
  type SupervisorDefinition,
  type SupervisorState,
  type SupervisorEventName,
} from './supervisor';

export { orchestrationRouter } from './orchestration.routes';
