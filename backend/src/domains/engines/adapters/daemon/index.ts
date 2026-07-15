/**
 * Barrel for the DEEP daemon-transport engine adapters (Phase 6 "daemon-engines"
 * group): supervised loopback sidecars (colbert, ops-recorder, multica) built on
 * the ONE `DaemonSupervisor`, plus the external-controller REST adapter (ziti).
 * Each implements the frozen `EngineClientPort` and ships its own in-proc MCP
 * server. The composer (deferred) constructs them over the injected supervisor +
 * config slice and seeds their MCP servers into the gated host.
 */
export {
  DaemonEngineAdapter,
  daemonFetch,
  message,
  type DaemonAdapterConfig,
  type ResolvedBinding,
} from './daemon-adapter-base.js';

export {
  ColbertLoopbackAdapter,
  type ColbertRequest,
  type ColbertRerankRequest,
  type ColbertSearchRequest,
  type ColbertRerankResult,
} from './colbert-loopback.adapter.js';
export {
  OpsRecorderLoopbackAdapter,
  type OpsRecorderRequest,
} from './ops-recorder-loopback.adapter.js';
export {
  MulticaLoopbackAdapter,
  type MulticaRequest,
} from './multica-loopback.adapter.js';
export { ZitiRestAdapter, type ZitiRequest } from './ziti-rest.adapter.js';

// MCP surfaces (server registration + tool builders) per adapter.
export {
  colbertMcpServer,
  buildColbertMcpTools,
  COLBERT_MCP_SERVER_ID,
} from './mcp/colbert-mcp.js';
export {
  opsRecorderMcpServer,
  buildOpsRecorderMcpTools,
  OPS_RECORDER_MCP_SERVER_ID,
} from './mcp/ops-recorder-mcp.js';
export {
  multicaMcpServer,
  buildMulticaMcpTools,
  MULTICA_MCP_SERVER_ID,
} from './mcp/multica-mcp.js';
export { zitiMcpServer, buildZitiMcpTools, ZITI_MCP_SERVER_ID } from './mcp/ziti-mcp.js';
export type { Invoker } from './mcp/daemon-mcp-shared.js';
