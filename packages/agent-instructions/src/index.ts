export {
  compileInstructionBundle,
  type RecoderTaskSpec,
  type RepoContextManifest,
  type SpacePolicy,
  type MemorySnapshot,
  type PathInstructionRule,
  type FailurePattern,
  type VerificationPlan,
  type InstructionCompileInput,
  type LoadedCompileContext,
} from './compiler';

export {
  buildAgentOsInstructionCompileInput,
  compileAgentOsInstructionBundle,
  type AgentOsContextPackInput,
  type AgentOsInstructionMemory,
  type AgentOsInstructionSpacePolicy,
  type AgentOsPALPlanInput,
  type CompileAgentOsInstructionBundleInput,
  type CompileAgentOsInstructionBundleResult,
} from './agent-os-compiler';

export { loadInstructionSources, type LoadInstructionSourcesInput } from './source-loader';

export {
  buildInstructionProvenance,
  sha256Hex,
  type LoadedInstructionSource,
} from './provenance';

export { renderClaudeInstructionBundle } from './claude-renderer';
export { renderCodexInstructionBundle } from './codex-renderer';
export { renderRecoderCodeInstructionBundle } from './recoder-code-renderer';
export * from './bundle';
export * from './loaders';
export * from './source-loaders';
export * from './renderers';
