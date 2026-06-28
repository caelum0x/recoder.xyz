/** MCP host + registry + policy + external supervision — public barrel. */

// Registry + catalog gate (untrusted descriptor validation)
export { McpRegistry, type McpServerRegistration } from "./registry/registry";
export {
  validateToolCatalog,
  validateToolDescriptor,
  validateResourceDescriptor,
  validatePromptDescriptor,
  CATALOG_LIMITS,
  type CatalogValidationResult,
  type CatalogRejection,
} from "./registry/catalog-validator";
export type {
  ToolDescriptor,
  ResourceDescriptor,
  PromptDescriptor,
} from "./registry/tool-descriptor";

// Policy (composed from agent-mcp)
export {
  canCallMcpTool,
  estimateMcpToolRisk,
  checkMcpToolPermission,
  type McpToolCallInput,
  type McpToolCallDecision,
  type McpToolRisk,
} from "./policy/index";

// Audit
export {
  buildToolAuditEvent,
  createMcpToolCall,
  createMcpToolAuditEvent,
  type McpAuditSinkPort,
  type McpToolCall,
  type McpToolCallStatus,
  type McpToolAuditEvent,
} from "./audit/audit";

// Host
export { InteropMcpHost, type InteropMcpHostOptions, type HostCallOutcome } from "./host/host";
export { McpHost } from "./host/facade";

// External supervision
export {
  ExternalMcpProcessManager,
  type ExternalServerHealth,
  type TransportFactory,
} from "./external/process-manager";
export {
  StdioMcpClient,
  type StdioMcpTransport,
  type StdioServerState,
} from "./external/stdio-client";
export type { ExternalMcpServerConfig } from "./external/external-server-config";
export {
  buildPalServerConfig,
  palServerAvailability,
  defaultPalPythonPath,
  PAL_TOOL_NAMES,
  PAL_SERVER_ID,
  type PalServerOptions,
  type PalAvailability,
} from "./external/pal-server";
