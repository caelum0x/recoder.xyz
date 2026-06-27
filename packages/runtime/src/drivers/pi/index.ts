/**
 * The pi (pi-coding-agent) driver fusion.
 *
 * Exposes two `RuntimeDriver`s presenting the `recoder_code` surface:
 *  - `PiPrintDriver` — headless `pi --mode json` one-shot (default).
 *  - `PiRpcDriver`   — steerable `pi --mode rpc` (steer/abort/compaction).
 *
 * Each driver's only job is `native pi JSONL output -> DriverFrame[]`; the engine owns
 * normalization, policy guards, the terminal guard, and sink fan-out.
 */

import type { RuntimeDriver } from '../../contracts/runtime-driver';
import { PiPrintDriver } from './pi-print-driver';
import { PiRpcDriver } from './pi-rpc-driver';
import type { PiDriverOptions } from './pi-session-host';

export { PiPrintDriver } from './pi-print-driver';
export { PiRpcDriver } from './pi-rpc-driver';
export { PI_PRINT_DESCRIPTOR, PI_RPC_DESCRIPTOR } from './pi-descriptor';
export {
  probePiCli,
  buildPiArgs,
  buildPiInvocation,
  resolvePiBinary,
  resolvePiPrompt,
  PI_BINARY,
  type PiRunMode,
  type PiDriverOptions,
} from './pi-session-host';
export { resolvePiModel, type PiModelSelection } from './pi-model-resolver';
export {
  mapSessionEvent,
  summarizeAgentEnd,
  mapUsage,
  mapStopReason,
  classifyToolCall,
  type PiTerminalSummary,
} from './pi-event-mapper';
export { PiRpcClient, type PiRpcEventListener } from './pi-rpc-client';
export * from './pi-wire-types';

/**
 * Construct the pi drivers for registration. `PiPrintDriver` is the default variant; the
 * rpc variant is included so the registry can resolve steerable runs when requested.
 */
export function createPiDrivers(options: PiDriverOptions = {}): RuntimeDriver[] {
  return [new PiPrintDriver(options), new PiRpcDriver(options)];
}
