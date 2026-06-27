/**
 * The curated public surface of `@recoder/runtime`. Nothing private leaks; this file is
 * the single source of the package's exported API (docs §5).
 */

// Engine entry
export { createRuntime } from './engine/runtime';
export type { Runtime, CreateRuntimeInput } from './engine/runtime';

// Adapter factory (drop-in replacement for the agent-runtimes shells)
export { createRuntimeAdapter } from './adapter/runtime-adapter';
export type { CreateRuntimeAdapterOptions } from './adapter/runtime-adapter';

// Registry
export {
  DriverRegistry,
  createDriverRegistry,
  registerBuiltinDrivers,
  createBuiltinDrivers,
  resolveSurface,
  resolveVariant,
} from './registry';
export type { DriverDescriptor } from './registry/driver-descriptor';
export type { BuiltinDriverOptions } from './registry/builtin-drivers';

// Driver factories (drop-in replacements for the agent-runtimes shells; docs §5)
export {
  createClaudeCodeDriver,
  createCodexDriver,
  createOpenCodeDriver,
  createPiDrivers,
  createInProcessDriver,
  createRecoderCodeDriver,
  createGeminiCliDriver,
  createQwenCodeDriver,
  createAcpDriver,
  createGenericProcessDriver,
} from './drivers';
export type {
  ClaudeCodeDriverOptions,
  CodexDriverOptions,
  OpenCodeDriverOptions,
  PiDriverOptions,
  InProcessDriverOptions,
  RecoderCodeDriverOptions,
  GenericProcessDriverOptions,
} from './drivers';

// Driver SPI (for first-party drivers landed by the driver agents)
export type {
  RuntimeDriver,
  DriverProbe,
  ApprovalDecision,
} from './contracts/runtime-driver';
export type {
  DriverContext,
  DriverProbeContext,
} from './contracts/driver-context';
export type {
  DriverFrame,
  DriverFrameKind,
  TextFrame,
  ThinkingFrame,
  ToolCallFrame,
  ToolResultFrame,
  StateFrame,
  NeedsInputFrame,
  ApprovalFrame,
  UsageFrame,
  ArtifactFrame,
  LogFrame,
  ErrorFrame,
  DoneFrame,
} from './contracts/driver-frame';
export { isTerminalFrame, isWriteBearingFrame } from './contracts/driver-frame';
export type { DriverResult } from './contracts/driver-result';
export type { CliInvocation } from './contracts/cli-invocation';
export type { HeadlessMode } from './contracts/headless-mode';

// Engine internals exposed for host wiring / advanced drivers
export { RuntimeEngine } from './engine/runtime-engine';
export { CancellationRegistry } from './engine/cancellation';
export { RunJournal } from './engine/run-journal';
export { TerminalEventGuard, isTerminalRunEvent } from './engine/terminal-event-guard';

// Events (sinks + table)
export type { RunEventSink } from './events/run-event-sink';
export {
  MemoryRunEventSink,
  createMemoryRunEventSink,
  TeeRunEventSink,
  teeSinks,
  OutboxRunEventSink,
  createOutboxRunEventSink,
  FRAME_TO_EVENT_TYPE,
  frameToRunEvent,
} from './events';
export type { OutboxWriter } from './events/outbox-sink';

// Policy (enforcement helpers)
export {
  ForbiddenPathGuard,
  TargetPathGuard,
  WorkLockGuard,
  ShellGuard,
  ApprovalPause,
  SecretRedactor,
  createSecretRedactor,
  runPolicyGate,
  assertSignedEnvelope,
} from './policy';
export type { RunGuards, PolicyGateInput } from './policy/policy-gate';
export type { SignedEnvelope, EnvelopeVerifierFn } from './policy/envelope-verifier';

// Config
export {
  loadRuntimeConfig,
  validateRuntimeConfig,
  DEFAULT_RUNTIME_CONFIG,
  RUNTIME_ENV_KEYS,
} from './config';
export type { RuntimeConfig, RuntimeConfigInput } from './types/runtime-config';

// Domain types
export type {
  RunId,
  StopReason,
  TokenUsage,
  NormalizedToolCall,
  NormalizedToolResult,
  RuntimeEvidenceArtifact,
} from './types';
export { makeRunId } from './types/run-id';

// Errors
export {
  RuntimeAdapterError,
  runtimeError,
  classifyProcessFailure,
  errorToFailedEvent,
} from './errors';
export type { RuntimeErrorCode, RuntimeOperationalErrorCode } from './errors/error-codes';

// Shared driver machinery (reused by every driver)
export {
  spawnProcess,
  spawnProcessSync,
  waitForChildProcess,
  attachJsonlLineReader,
  attachJsonlObjectReader,
  serializeJsonLine,
  writeJsonLine,
  stripAnsi,
  attachAnsiTextReader,
  buildChildEnv,
  redactEnvForLog,
  ArgBuilder,
  resolveCwd,
  writePromptToStdin,
  writePromptToTempFile,
  locateCli,
  probeCliVersion,
  FrameDebouncer,
  ToolCallTracker,
  spawnInvocation,
  awaitProcessExit,
  killProcess,
} from './drivers/shared';

// Seams (typed ports for host wiring)
export type {
  AgentOsPort,
  InstructionsPort,
  PolicyPort,
  BrainPort,
  CoordinationPort,
  GovernancePort,
  MemoryPort,
  McpPort,
  SandboxPort,
  RuntimeSeams,
} from './seams';

// Execution environments (where the CLI runs)
export {
  LocalEnvironment,
  createLocalEnvironment,
  SandboxEnvironment,
  createSandboxEnvironment,
  createExecutionEnvironment,
  resolveWorktree,
} from './env';
export type {
  ExecutionEnvironment,
  ExecResult as EnvExecResult,
  ExecStreamChunk,
  EnvFactoryInput,
  BranchPolicy,
  ResolvedWorktree,
} from './env';

// Evidence (artifacts + verification)
export {
  collectEvidence,
  captureGitDiffArtifact,
  runVerification,
  hashContent,
  hashArtifactBody,
} from './evidence';
export type {
  EvidenceCollectionInput,
  EvidenceCollectionResult,
  VerificationRunResult,
  VerificationCommandResult,
} from './evidence';

// Persistence (replayable run journal)
export {
  MemoryRunStore,
  createMemoryRunStore,
  JsonlRunStore,
  createJsonlRunStore,
  createRunStore,
  replayRun,
  replayEvents,
} from './persistence';
export type { RunStore } from './persistence';

// Observability (truthful telemetry)
export {
  RuntimeLogger,
  createRuntimeLogger,
  RunMetrics,
  createRunMetrics,
  HealthMonitor,
  createHealthMonitor,
  FrameDebugTap,
  createFrameDebugTap,
} from './observability';
export type {
  LogLevel,
  LogRecord,
  LogSink,
  RunOutcome,
  RunMetricsSnapshot,
  HealthSnapshot,
} from './observability';

// Contract re-exports (kept compatible with @recoder/agent-runtimes)
export type {
  AgentRuntimeAdapter,
  RuntimeHandle,
  RuntimePolicy,
  RuntimeStartInput,
  RuntimeTaskInput,
} from '@recoder/agent-runtimes';
