/**
 * SignalSinkPort — persists + emits WorkSignals. The coherence reconciler sends
 * unsafe drift here; the Postgres adapter writes to the agent-os signal table.
 */

import type { WorkSignal } from '../domain';

export interface SignalSinkPort {
  emit(signal: WorkSignal): Promise<void>;
  /** Open signals, optionally filtered to a space. */
  listOpen(spaceId?: string): Promise<WorkSignal[]>;
  resolve(signalId: string, resolvedBy: string, at: string): Promise<void>;
}
