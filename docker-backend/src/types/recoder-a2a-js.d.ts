/**
 * Ambient declarations for the owned @recoder/a2a-js (merged from a2a-js).
 * The package ships JS without .d.ts (its client gRPC transport DTS is pruned),
 * and a2a-standard-server.ts consumes the server subpaths via dynamic import.
 * These shims let tsc resolve those dynamic imports; the real implementations
 * come from the built package at runtime.
 */
declare module '@recoder/a2a-js/server' {
  export const InMemoryTaskStore: any;
  export const DefaultRequestHandler: any;
  export const DefaultExecutionEventBusManager: any;
  const _default: any;
  export default _default;
}

declare module '@recoder/a2a-js/server/express' {
  export const agentCardHandler: any;
  export const jsonRpcHandler: any;
  export const UserBuilder: any;
  const _default: any;
  export default _default;
}

declare module '@recoder/a2a-js/server/*' {
  const _default: any;
  export default _default;
}

declare module '@recoder/a2a-js' {
  const _default: any;
  export default _default;
}
