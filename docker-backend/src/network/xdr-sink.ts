/**
 * xdr-sink.ts — the docker-backend adapter that owns the process-wide network
 * XDR sink singleton.
 *
 * @recoder/network's `XdrSink` is pure: it requires an AuditSinkPort injected at
 * construction and never builds a governance store itself. This adapter is where
 * the singleton lives and where the real @recoder/governance audit store is wired
 * in, so the rest of the backend (the network routes) can reach the shared feed
 * via `getXdrSink()` exactly as before.
 */
import { XdrSink } from '@recoder/network';
import { createGovernanceAuditSink } from './governance-ports';

/** Process-wide singleton sink for the network XDR feed. */
let sharedSink: XdrSink | null = null;

export function getXdrSink(): XdrSink {
  if (sharedSink === null) {
    sharedSink = new XdrSink(createGovernanceAuditSink());
  }
  return sharedSink;
}

/** Reset the shared sink (tests only). */
export function __resetXdrSinkForTests(): void {
  sharedSink = null;
}
