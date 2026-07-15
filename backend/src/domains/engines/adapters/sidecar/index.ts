/**
 * Barrel for the Python-sidecar engine adapters (mem0 / browser-use / pal-mcp).
 * Each is a degrade-safe `EngineClientPort` over a real OSS surface; the composer
 * imports the classes + the MCP binder factories from here.
 */
export { Mem0Adapter } from './mem0.adapter.js';
export type { Mem0Op, Mem0AdapterDeps, Mem0ClientFns, Mem0Fetch } from './mem0.adapter.js';

export { BrowserUseAdapter, browserUseEngineBinder } from './browser-use.adapter.js';
export type { BrowserUseOp, BrowserUseAdapterDeps } from './browser-use.adapter.js';

export { PalMcpAdapter, palPlanEngineBinder } from './pal-mcp.adapter.js';
export type { PalMcpAdapterDeps, PalExternalCall } from './pal-mcp.adapter.js';
