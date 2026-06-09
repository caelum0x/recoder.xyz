#!/usr/bin/env node

export const A2A_BRIDGE_CONTRACT_VERSION = '2026-06-07';

export const A2A_BRIDGE_ENDPOINTS = Object.freeze({
  jobsNext: '/api/a2a/bridge/jobs/next',
  heartbeat: '/api/a2a/bridge/heartbeat',
  pair: '/api/a2a/bridge/pair',
  sessions: '/api/a2a/bridge/sessions',
  jobs: '/api/a2a/bridge/jobs',
  heartbeats: '/api/a2a/bridge/heartbeats',
  policy: '/api/a2a/policy',
});

export const A2A_BRIDGE_ENDPOINT_PATTERNS = Object.freeze({
  jobResult: '/api/a2a/bridge/jobs/:jobId/result',
  heartbeatByBridgeId: '/api/a2a/bridge/heartbeats/:bridgeId',
  history: '/api/a2a/orchestrate/:threadId/:traceId/history',
  historyStream: '/api/a2a/orchestrate/:threadId/:traceId/history/stream',
  override: '/api/a2a/orchestrate/:threadId/:traceId/override',
  recompute: '/api/a2a/orchestrate/:threadId/:traceId/recompute',
});

export function bridgeJobResultPath(jobId) {
  return `/api/a2a/bridge/jobs/${encodeURIComponent(String(jobId))}/result`;
}

export function bridgeHeartbeatPath(bridgeId) {
  return `/api/a2a/bridge/heartbeats/${encodeURIComponent(String(bridgeId))}`;
}

export function orchestrationHistoryPath(threadId, traceId) {
  return `/api/a2a/orchestrate/${encodeURIComponent(String(threadId))}/${encodeURIComponent(String(traceId))}/history`;
}

export function orchestrationHistoryStreamPath(threadId, traceId) {
  return `${orchestrationHistoryPath(threadId, traceId)}/stream`;
}

export function orchestrationOverridePath(threadId, traceId) {
  return `/api/a2a/orchestrate/${encodeURIComponent(String(threadId))}/${encodeURIComponent(String(traceId))}/override`;
}

export function orchestrationRecomputePath(threadId, traceId) {
  return `/api/a2a/orchestrate/${encodeURIComponent(String(threadId))}/${encodeURIComponent(String(traceId))}/recompute`;
}

export function isBridgeEndpoint(path) {
  return (
    Object.values(A2A_BRIDGE_ENDPOINTS).includes(path) ||
    Object.values(A2A_BRIDGE_ENDPOINT_PATTERNS).includes(path)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(
    JSON.stringify(
      {
        version: A2A_BRIDGE_CONTRACT_VERSION,
        endpoints: A2A_BRIDGE_ENDPOINTS,
        patterns: A2A_BRIDGE_ENDPOINT_PATTERNS,
      },
      null,
      2,
    ),
  );
}
