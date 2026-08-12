// Public barrel for the loom headless control-API client (Phase 0) so consumers
// (e.g. the backend conductor's loom substrate adapter) import it as
// `@recoder/agent-runtimes/loom` without reaching into src paths.
//
// loom is vendored under apps/desktop/engines/loom (Apache-2.0); this package
// only speaks its NDJSON Unix-socket wire. See docs/LOOM-INTEGRATION.md.

export * from './protocol';
export * from './socket-client';
