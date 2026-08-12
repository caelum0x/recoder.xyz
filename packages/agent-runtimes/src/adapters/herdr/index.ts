// Public barrel for the herdr headless control-API client (Phase 0) so consumers
// (e.g. the backend conductor's herdr substrate adapter) import it as
// `@recoder/agent-runtimes/herdr` without reaching into src paths.
//
// herdr is vendored under apps/desktop/engines/herdr (Apache-2.0); this package
// only speaks its NDJSON Unix-socket wire. See docs/HERDR-INTEGRATION.md.

export * from './protocol';
export * from './socket-client';
