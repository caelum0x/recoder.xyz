/**
 * MemorySignalSink — Map-backed `SignalSinkPort`. Persists + lists WorkSignals
 * for tests and single-process runtimes. The coherence reconciler emits unsafe
 * drift here; the Postgres adapter (wave-2) writes to the agent-os signal table.
 *
 * `emit` is upsert-by-`signalId` so the reconciler's deterministic signal ids
 * coalesce repeated drift across ticks rather than piling up duplicates.
 */

import type { WorkSignal } from '../../domain';
import type { SignalSinkPort } from '../../ports';

export class MemorySignalSink implements SignalSinkPort {
  private readonly signals = new Map<string, WorkSignal>();

  async emit(signal: WorkSignal): Promise<void> {
    this.signals.set(signal.signalId, { ...signal });
  }

  async listOpen(spaceId?: string): Promise<WorkSignal[]> {
    const out: WorkSignal[] = [];
    for (const signal of this.signals.values()) {
      if (signal.status !== 'open') {
        continue;
      }
      if (spaceId !== undefined && signal.spaceId !== spaceId) {
        continue;
      }
      out.push({ ...signal });
    }
    return out;
  }

  async resolve(signalId: string, resolvedBy: string, at: string): Promise<void> {
    const existing = this.signals.get(signalId);
    if (!existing) {
      return;
    }
    this.signals.set(signalId, {
      ...existing,
      status: 'resolved',
      resolvedBy,
      resolvedAt: at,
    });
  }
}
