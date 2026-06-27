import type { RunEvent } from '@recoder/agent-os';
import type { RunEventSink } from './run-event-sink';

/**
 * Fan-out sink: pushes every event to all child sinks (journal + outbox + observability).
 * A failing child does not stop the others; the first error is rethrown after all attempt.
 */
export class TeeRunEventSink implements RunEventSink {
  constructor(private readonly sinks: readonly RunEventSink[]) {}

  async push(event: RunEvent): Promise<void> {
    const results = await Promise.allSettled(this.sinks.map((sink) => sink.push(event)));
    rethrowFirstRejection(results);
  }

  async flush(): Promise<void> {
    const results = await Promise.allSettled(
      this.sinks.map((sink) => sink.flush?.() ?? Promise.resolve()),
    );
    rethrowFirstRejection(results);
  }
}

function rethrowFirstRejection(results: readonly PromiseSettledResult<unknown>[]): void {
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (rejected) {
    throw rejected.reason;
  }
}

export function teeSinks(...sinks: RunEventSink[]): TeeRunEventSink {
  return new TeeRunEventSink(sinks);
}
