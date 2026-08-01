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
  sidecarBreaker,
  sidecarKeyForUrl,
  message,
  type DaemonAdapterConfig,
  type ResolvedBinding,
  type DaemonFetchInit,
  type DaemonFetchResilience,
  type FetchLike,
} from './daemon-adapter-base.js';

export {
  ColbertLoopbackAdapter,
  type ColbertRequest,
  type ColbertRerankRequest,
  type ColbertSearchRequest,
  type ColbertRerankResult,
  type ColbertBatchRerankItem,
  type ColbertBatchRerankRequest,
  type ColbertBatchRerankResult,
  type ColbertBatchRerankItemResult,
  type ColbertCreateCollectionRequest,
  type ColbertCollectionNameRequest,
  type ColbertListCollectionsRequest,
  type ColbertCollectionSummary,
  type ColbertCollectionsList,
} from './colbert-loopback.adapter.js';
export {
  OpsRecorderLoopbackAdapter,
  type OpsRecorderRequest,
  type OpsRecorderSignalFilters,
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
  colbertIndexMcpServer,
  buildColbertIndexMcpTools,
  COLBERT_INDEX_MCP_SERVER_ID,
} from './mcp/colbert-index-mcp.js';
export {
  opsRecorderMcpServer,
  buildOpsRecorderMcpTools,
  OPS_RECORDER_MCP_SERVER_ID,
  OPS_RECORDER_WRITE_TOOL_NAMES,
} from './mcp/ops-recorder-mcp.js';
export {
  opsRecorderSignalsMcpServer,
  buildOpsRecorderSignalsMcpTools,
  OPS_RECORDER_SIGNALS_MCP_SERVER_ID,
} from './mcp/ops-recorder-signals-mcp.js';
export {
  multicaMcpServer,
  buildMulticaMcpTools,
  MULTICA_MCP_SERVER_ID,
} from './mcp/multica-mcp.js';
export { zitiMcpServer, buildZitiMcpTools, ZITI_MCP_SERVER_ID } from './mcp/ziti-mcp.js';
export type { Invoker } from './mcp/daemon-mcp-shared.js';
