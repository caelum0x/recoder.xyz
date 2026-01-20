/**
 * Debug Module
 *
 * Exports all debug-related functionality for the Debug Adapter Protocol (DAP) implementation.
 * Supports debugging for multiple languages: JavaScript, TypeScript, Python, Go, Rust.
 */

// DAP Client - Low-level DAP protocol implementation
export {
  DAPClient,
  DEBUG_ADAPTER_CONFIGS,
  type DAPRequest,
  type DAPResponse,
  type DAPEvent,
  type DAPMessage,
  type Capabilities,
  type DebugLanguage,
  type DebugConfig,
  type DebugAdapterConfig,
  type Breakpoint,
  type SourceBreakpoint,
  type Source,
  type StackFrame,
  type Thread,
  type Scope,
  type Variable,
  type VariablePresentationHint,
  type InitializeRequestArguments,
  type LaunchRequestArguments,
  type AttachRequestArguments,
  type CompletionItem,
} from './dap-client.js';

// Debug Manager - High-level session management
export {
  debugManager,
  type DebugSession,
  type DebugSessionState,
  type DebugEvent,
  type FileBreakpoints,
} from './debug-manager.js';

// Re-export common types for convenience
export type {
  ExceptionBreakpointFilter,
  ColumnDescriptor,
  ChecksumAlgorithm,
  Checksum,
  ExceptionFilterOptions,
  SteppingGranularity,
  RestartArguments,
} from './dap-client.js';
