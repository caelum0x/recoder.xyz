import type { DriverFrame } from '../contracts/driver-frame';
import { addTokenUsage, emptyTokenUsage, type TokenUsage } from '../types/usage';

/**
 * Accumulates `usage` frames across a run into a single `TokenUsage`, folded into the
 * terminal `completed.data.usage`. Immutable: each observe returns a fresh aggregator.
 */
export class UsageAggregator {
  private constructor(private readonly total: TokenUsage) {}

  static empty(): UsageAggregator {
    return new UsageAggregator(emptyTokenUsage());
  }

  observe(frame: DriverFrame): UsageAggregator {
    if (frame.kind === 'usage') {
      return new UsageAggregator(addTokenUsage(this.total, frame.usage));
    }
    if (frame.kind === 'done' && frame.usage) {
      return new UsageAggregator(addTokenUsage(this.total, frame.usage));
    }
    return this;
  }

  value(): TokenUsage {
    return this.total;
  }
}
