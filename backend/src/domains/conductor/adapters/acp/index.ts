/**
 * ACP (Agent Client Protocol) adapter stack — public surface.
 *
 * Layering (each lower layer is pure + unit-tested; only acp-process touches the OS):
 *   acp-codec   → JSON-RPC 2.0 / ndjson framing
 *   acp-client  → request/response correlation + agent-request routing
 *   acp-driver  → session lifecycle over an injected process seam
 *   acp-process → the real child_process-backed AcpProcess + spawner
 *
 * To wire ACP as a conductor runtime: `makeAcpSpawner({ command, cwd })` →
 * `new AcpAgentDriver({ spawn, onRequest: <approval gate>, onNotification: <tail> })`.
 */
export * from './acp-codec.js';
export { AcpClient, type AcpClientDeps } from './acp-client.js';
export { AcpAgentDriver, ACP_PROTOCOL_VERSION, type AcpProcess, type AcpDriverDeps } from './acp-driver.js';
export {
  makeAcpProcess,
  makeAcpSpawner,
  type AcpChild,
  type AcpSpawnOptions,
  type LowLevelSpawn,
} from './acp-process.js';
