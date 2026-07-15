/**
 * Barrel for the napi engine group (Phase 6 DEEP): the three in-process engine
 * clients (openfang native kernel, tensorzero embedded gateway, governance
 * kernel re-expose), their agent-callable MCP tools, and the host wiring the
 * serial bootstrap calls.
 *
 * Consumers import the typed `EngineClientPort` accessors + `registerNapiEngineTools`
 * from here; they never reach into a specific adapter file or an engine `dist/`.
 */
export {
  OpenfangNapiAdapter,
  createOpenfangClient,
  OPENFANG_OPS,
  type OpenfangNapiOptions,
} from './openfang-napi.adapter.js';

export {
  TensorzeroNapiAdapter,
  createTensorzeroClient,
  type TensorzeroNapiOptions,
} from './tensorzero-napi.adapter.js';

export {
  GovernanceNapiAdapter,
  createGovernanceKernelClient,
} from './governance-napi.adapter.js';

export {
  createNapiEngineClients,
  napiEngineClientList,
  registerNapiEngineTools,
  buildNapiEngineMcpTools,
  buildOpenfangMcpTools,
  buildTensorzeroMcpTools,
  buildGovernanceKernelMcpTools,
  openfangMcpServer,
  tensorzeroMcpServer,
  governanceKernelMcpServer,
  OPENFANG_MCP_SERVER_ID,
  TENSORZERO_MCP_SERVER_ID,
  GOVERNANCE_KERNEL_MCP_SERVER_ID,
  type NapiEngineClients,
  type NapiEngineDeps,
  type NapiEngineRegistration,
} from './napi-engines.js';

export type { NapiArgs } from './napi-util.js';
