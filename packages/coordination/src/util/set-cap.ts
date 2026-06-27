/**
 * Bounded set / ring — MERGED from the `_localEventIds` + `LOCAL_ID_CAP`
 * trimming logic in `docker-backend/src/a2a/a2a-event-bus.ts`. Used by the
 * dedup ledger and event retention to keep recent-id memory bounded.
 *
 * Immutable: every mutation returns a new BoundedSet (per coding-style).
 */

export class BoundedSet<T> {
  private readonly items: ReadonlyArray<T>;
  readonly cap: number;

  constructor(cap: number, items: ReadonlyArray<T> = []) {
    this.cap = Math.max(1, cap);
    this.items = items.slice(-this.cap);
  }

  has(value: T): boolean {
    return this.items.includes(value);
  }

  /** Returns a new BoundedSet with `value` appended (oldest trimmed past cap). */
  add(value: T): BoundedSet<T> {
    if (this.has(value)) {
      return this;
    }
    return new BoundedSet<T>(this.cap, [...this.items, value]);
  }

  get size(): number {
    return this.items.length;
  }

  values(): ReadonlyArray<T> {
    return this.items;
  }
}
