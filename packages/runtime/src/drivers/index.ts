/**
 * Aggregate barrel for all driver factories + descriptors, consumed by
 * `registry/builtin-drivers.ts` and re-exported through the public API.
 */
export * from './shared';
export {
  ClaudeCodeDriver,
  createClaudeCodeDriver,
  type ClaudeCodeDriverOptions,
  CLAUDE_CODE_DESCRIPTOR,
} from './claude-code';
export {
  CodexDriver,
  createCodexDriver,
  type CodexDriverOptions,
  codexDescriptor,
} from './codex';
export {
  OpenCodeDriver,
  createOpenCodeDriver,
  type OpenCodeDriverOptions,
  OPENCODE_DESCRIPTOR,
} from './opencode';
export {
  PiPrintDriver,
  PiRpcDriver,
  createPiDrivers,
  PI_PRINT_DESCRIPTOR,
  PI_RPC_DESCRIPTOR,
  type PiDriverOptions,
} from './pi';
export {
  InProcessDriver,
  createInProcessDriver,
  type InProcessDriverOptions,
  inProcessDriverDescriptor,
} from './in-process';
export {
  RecoderCodeDriver,
  createRecoderCodeDriver,
  type RecoderCodeDriverOptions,
  type RecoderCodeDelegate,
  RECODER_CODE_DESCRIPTOR,
} from './recoder-code';
export {
  GenericProcessDriver,
  createGenericProcessDriver,
  type GenericProcessDriverOptions,
  type GenericArgsBuilder,
  createGeminiCliDriver,
  createQwenCodeDriver,
  createAcpDriver,
  GEMINI_CLI_DESCRIPTOR,
  QWEN_CODE_DESCRIPTOR,
  ACP_DESCRIPTOR,
} from './generic';
