/**
 * Driver descriptors for the pi (pi-coding-agent) fusion.
 *
 * pi presents the first-party `recoder_code` surface (per docs §3.5: recoder-code delegates
 * to pi or in-process; `AgentSurface` has no standalone `pi` value). Two variants are
 * exposed:
 *
 *  - `pi-print`: headless one-shot via `pi --mode json` (default; in-process semantics on the
 *    pi side, consumed as a JSONL event stream).
 *  - `pi-rpc`:   bidirectional JSONL RPC (`pi --mode rpc`) enabling steer/abort/compaction.
 */

import type { AgentCapability } from '@recoder/agent-os';
import type { DriverDescriptor } from '../../registry/driver-descriptor';

const PI_CAPABILITIES: readonly AgentCapability[] = [
  { capabilityId: 'pi.implementation', kind: 'implementation', label: 'Code implementation' },
  { capabilityId: 'pi.verification', kind: 'verification', label: 'Verification & checks' },
  { capabilityId: 'pi.planning', kind: 'planning', label: 'Planning & reasoning' },
];

const PI_CLI = {
  binary: 'pi',
  versionArg: '--version',
  binName: 'pi',
} as const;

/** Default pi driver: headless `--mode json` print run. */
export const PI_PRINT_DESCRIPTOR: DriverDescriptor = {
  id: 'pi-print',
  kind: 'recoder_code',
  surfaces: ['recoder_code'],
  // `in_process` reflects pi's own in-process print semantics; `json` is the wire format.
  modes: ['json', 'in_process'],
  capabilities: PI_CAPABILITIES,
  cli: PI_CLI,
  label: 'pi (print/json)',
};

/** Steerable pi driver: bidirectional JSONL RPC run. */
export const PI_RPC_DESCRIPTOR: DriverDescriptor = {
  id: 'pi-rpc',
  kind: 'recoder_code',
  surfaces: ['recoder_code'],
  modes: ['rpc', 'json'],
  capabilities: PI_CAPABILITIES,
  cli: PI_CLI,
  label: 'pi (rpc/steerable)',
};
