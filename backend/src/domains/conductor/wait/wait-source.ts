/**
 * Real-runtime adapters for {@link WaitService}: a POLLING {@link WaitEventSource}
 * over the conductor's own attention snapshot, and a wall-clock {@link WaitTimer}.
 *
 * The service itself is stream-agnostic (its unit tests drive a scripted source);
 * these are the production seams. The poll adapter mirrors herdr's actual loop
 * (`src/api/wait.rs`): re-probe the authoritative state each interval and yield it
 * as a monotonically-stamped frame, which the service re-classifies + settles on.
 * Each poll increments the seq so the service's replay/live dedup still holds, and
 * a probe that finds the workspace GONE ends the stream truthfully (the service
 * resolves `stream-ended`, never a faked settle).
 */
import type {
  WaitEventSource,
  WaitFrame,
  WaitFrameData,
  WaitTimer,
} from './wait.service.js';

/** Probe the authoritative attention snapshot for a workspace, or null if it is gone. */
export type WaitProbe = (workspaceId: string) => Promise<WaitFrameData | null>;

/** Sleep seam (injectable so the cadence is testable without a real timer). */
export type WaitSleep = (ms: number) => Promise<void>;

/** Default gap between authoritative re-probes (herdr's connection poll cadence). */
export const DEFAULT_WAIT_POLL_INTERVAL_MS = 750;

export interface PollingWaitSourceDeps {
  readonly probe: WaitProbe;
  readonly sleep?: WaitSleep;
  readonly intervalMs?: number;
}

/** A real {@link WaitSleep} backed by `setTimeout` (unref'd so it never pins exit). */
export const realWaitSleep: WaitSleep = ms =>
  new Promise(resolve => {
    const handle = setTimeout(resolve, ms);
    (handle as { unref?: () => void }).unref?.();
  });

/**
 * A polling {@link WaitEventSource}: re-probe the workspace every `intervalMs` and
 * yield each snapshot as a frame with a strictly-increasing seq (resuming from the
 * caller's `sinceSeq`). A null probe (workspace gone) ends the stream.
 */
export function createPollingWaitSource(
  deps: PollingWaitSourceDeps
): WaitEventSource {
  const interval = deps.intervalMs ?? DEFAULT_WAIT_POLL_INTERVAL_MS;
  const sleep = deps.sleep ?? realWaitSleep;
  return {
    watch(workspaceId: string, sinceSeq: number): AsyncIterable<WaitFrame> {
      return {
        async *[Symbol.asyncIterator](): AsyncIterator<WaitFrame> {
          let seq = sinceSeq;
          for (;;) {
            let data: WaitFrameData | null;
            try {
              data = await deps.probe(workspaceId);
            } catch {
              // A read failure must not become a detached rejection after the wait
              // has resolved. End the source truthfully, like a missing workspace.
              return;
            }
            if (data == null) return; // gone → truthful stream end (no faked settle)
            seq += 1;
            yield { seq, ...data };
            await sleep(interval);
          }
        },
      };
    },
  };
}

/**
 * A wall-clock {@link WaitTimer} backed by `setTimeout`. Unref'd so a pending wait
 * never keeps the process alive on its own; `arm` returns a disarm that clears it.
 */
export function createRealWaitTimer(): WaitTimer {
  return {
    arm(ms: number, onFire: () => void): () => void {
      const handle = setTimeout(onFire, ms);
      (handle as { unref?: () => void }).unref?.();
      return () => clearTimeout(handle);
    },
  };
}
