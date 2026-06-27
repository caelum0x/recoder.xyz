/**
 * In-memory metrics for the runtime: run counts, durations, token usage, exit-code
 * distribution, and queue depth. Dependency-free counters/histograms a host can scrape or
 * forward to a real metrics backend. Never fabricated: every value is recorded from an
 * observed event.
 */
export type RunOutcome = 'completed' | 'failed' | 'cancelled';

export type RunMetricsSnapshot = {
  runsStarted: number;
  runsByOutcome: Record<RunOutcome, number>;
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  exitCodes: Record<string, number>;
  maxQueueDepth: number;
};

export class RunMetrics {
  #runsStarted = 0;
  readonly #byOutcome: Record<RunOutcome, number> = { completed: 0, failed: 0, cancelled: 0 };
  #totalDurationMs = 0;
  #inputTokens = 0;
  #outputTokens = 0;
  readonly #exitCodes = new Map<string, number>();
  #maxQueueDepth = 0;

  recordStart(): void {
    this.#runsStarted += 1;
  }

  recordOutcome(outcome: RunOutcome, durationMs?: number): void {
    this.#byOutcome[outcome] += 1;
    if (typeof durationMs === 'number' && durationMs >= 0) {
      this.#totalDurationMs += durationMs;
    }
  }

  recordTokens(input: { inputTokens?: number; outputTokens?: number }): void {
    this.#inputTokens += input.inputTokens ?? 0;
    this.#outputTokens += input.outputTokens ?? 0;
  }

  recordExitCode(code: number | null): void {
    const key = code === null ? 'null' : String(code);
    this.#exitCodes.set(key, (this.#exitCodes.get(key) ?? 0) + 1);
  }

  recordQueueDepth(depth: number): void {
    if (depth > this.#maxQueueDepth) this.#maxQueueDepth = depth;
  }

  snapshot(): RunMetricsSnapshot {
    return {
      runsStarted: this.#runsStarted,
      runsByOutcome: { ...this.#byOutcome },
      totalDurationMs: this.#totalDurationMs,
      totalInputTokens: this.#inputTokens,
      totalOutputTokens: this.#outputTokens,
      exitCodes: Object.fromEntries(this.#exitCodes),
      maxQueueDepth: this.#maxQueueDepth,
    };
  }
}

export function createRunMetrics(): RunMetrics {
  return new RunMetrics();
}
