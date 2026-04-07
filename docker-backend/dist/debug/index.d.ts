/**
 * Debug Module
 *
 * Exports all debug-related functionality for the Debug Adapter Protocol (DAP) implementation.
 * Supports debugging for multiple languages: JavaScript, TypeScript, Python, Go, Rust.
 */
export { DAPClient, DEBUG_ADAPTER_CONFIGS, type DAPRequest, type DAPResponse, type DAPEvent, type DAPMessage, type Capabilities, type DebugLanguage, type DebugConfig, type DebugAdapterConfig, type Breakpoint, type SourceBreakpoint, type Source, type StackFrame, type Thread, type Scope, type Variable, type VariablePresentationHint, type InitializeRequestArguments, type LaunchRequestArguments, type AttachRequestArguments, type CompletionItem, } from './dap-client.js';
export { debugManager, type DebugSession, type DebugSessionState, type DebugEvent, type FileBreakpoints, } from './debug-manager.js';
export type { ExceptionBreakpointFilter, ColumnDescriptor, ChecksumAlgorithm, Checksum, ExceptionFilterOptions, SteppingGranularity, RestartArguments, } from './dap-client.js';
