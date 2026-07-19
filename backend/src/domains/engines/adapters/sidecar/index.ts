/**
 * Barrel for the Python-sidecar engine adapters (mem0 / browser-use / pal-mcp).
 * Each is a degrade-safe `EngineClientPort` over a real OSS surface; the composer
 * imports the classes + the MCP binder factories from here.
 */
export { Mem0Adapter } from './mem0.adapter.js';
export type { Mem0Op, Mem0AdapterDeps, Mem0ClientFns, Mem0Fetch } from './mem0.adapter.js';

export { BrowserUseAdapter, browserUseEngineBinder } from './browser-use.adapter.js';
export type { BrowserUseOp, BrowserUseAdapterDeps } from './browser-use.adapter.js';

export { BrowserExtClient } from './browser-ext.client.js';
export type {
  BrowserExtPort,
  BrowserExtClientDeps,
  ExtractStructuredInput,
  RunTaskInput,
  ScreenshotAnnotateInput,
  FillFormInput,
} from './browser-ext.client.js';

export { browserSessionEngineBinder } from './browser-session.binder.js';
export { executeBrowserVerification } from './browser-verification.executor.js';
export type {
  BrowserVerifyAssertion,
  BrowserVerifyRequest,
  BrowserVerificationRun,
} from './browser-verification.executor.js';

export { PalMcpAdapter, palPlanEngineBinder } from './pal-mcp.adapter.js';
export type { PalMcpAdapterDeps, PalExternalCall } from './pal-mcp.adapter.js';

export {
  GovernedSidecarAdapter,
  governSidecar,
  bindSidecarEnforcement,
} from './governed-sidecar.adapter.js';
export type {
  SidecarEnforcement,
  SidecarToolEnforcer,
  GovernedSidecarOptions,
} from './governed-sidecar.adapter.js';

export {
  palCommsEngineBinder,
  recoderPalCommsServer,
  buildAgentCommsArgs,
  PAL_AGENTCOMMS_OP,
} from './pal-comms.binder.js';
export type {
  PalCommsModelSpec,
  PalRouteRequest,
  PalConsensusRequest,
} from './pal-comms.binder.js';
