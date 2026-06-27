/**
 * A bounded async queue decoupling a fast producer (driver frames) from a slow consumer
 * (the adapter's async generator). When full, `push` awaits drain rather than dropping
 * silently. `close` ends the stream; consumers drain remaining items then stop.
 */
export class BoundedAsyncQueue<T> {
  private readonly buffer: T[] = [];
  private closed = false;
  private error: unknown;
  private readonly waitingConsumers: Array<(result: IteratorResult<T>) => void> = [];
  private readonly waitingProducers: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error('BoundedAsyncQueue capacity must be >= 1');
  }

  /** Push an item, awaiting space if the buffer is full. */
  async push(item: T): Promise<void> {
    if (this.closed) throw new Error('Cannot push to a closed queue.');

    const consumer = this.waitingConsumers.shift();
    if (consumer) {
      consumer({ value: item, done: false });
      return;
    }

    if (this.buffer.length >= this.capacity) {
      await new Promise<void>((resolve) => this.waitingProducers.push(resolve));
    }
    this.buffer.push(item);
  }

  /** Signal end-of-stream; optionally with a terminal error to throw to the consumer. */
  close(error?: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.error = error;
    while (this.waitingConsumers.length > 0) {
      const consumer = this.waitingConsumers.shift();
      consumer?.({ value: undefined as never, done: true });
    }
    while (this.waitingProducers.length > 0) {
      this.waitingProducers.shift()?.();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.buffer.length > 0) {
        const value = this.buffer.shift() as T;
        this.waitingProducers.shift()?.();
        yield value;
        continue;
      }
      if (this.closed) {
        if (this.error !== undefined) throw this.error;
        return;
      }
      const result = await new Promise<IteratorResult<T>>((resolve) =>
        this.waitingConsumers.push(resolve),
      );
      if (result.done) {
        if (this.error !== undefined) throw this.error;
        return;
      }
      yield result.value;
    }
  }
}
