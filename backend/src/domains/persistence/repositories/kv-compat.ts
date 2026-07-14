/**
 * `kv-compat` — the SYNC compatibility facade that preserves the exact
 * signatures the deleted JSON persistence exposed:
 *
 *   loadStore<T>(name, default): T          // synchronous read
 *   saveStore<T>(name, value): void          // fire-and-forget write-through
 *   debouncedSave<T>(name, value, ms?): void // debounced fire-and-forget
 *
 * The old model treated each "store name" as one whole JSON blob. Here that maps
 * to a single `core.kv_store` row: namespace `legacy-store`, key = store name.
 *
 * How sync works over an async DB: an in-memory cache is the synchronous source
 * of truth. It is HYDRATED from the KvStore at boot (`hydrate()`), reads come
 * straight from the cache, and writes update the cache synchronously then
 * write through to the DB asynchronously. With no DB the cache alone backs the
 * store (degraded, in-process only) — truthful, never a fake durable write.
 *
 * A module-level singleton is exported so the recreated `src/persistence.ts`
 * shim and the migrated consumers share one cache and one bound KvStore.
 */
import type { Logger } from '../../../shared/logger.js';
import type { KvStore } from '../ports/kv-store.port.js';

const LEGACY_NAMESPACE = 'legacy-store';
const DEFAULT_DEBOUNCE_MS = 250;

export class LegacyKvCompat {
  private readonly cache = new Map<string, unknown>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pending = new Set<string>();
  private kv: KvStore | null = null;
  private log: Logger | null = null;
  private hydrated = false;

  /** Bind the real KvStore + logger (called by the composer at boot). */
  bind(kv: KvStore, log: Logger): void {
    this.kv = kv;
    this.log = log;
  }

  /** Load every legacy-store row into the cache so `loadStore` is warm. */
  async hydrate(): Promise<void> {
    if (!this.kv) return;
    try {
      const entries = await this.kv.list(LEGACY_NAMESPACE);
      for (const entry of entries) {
        // Do not clobber a value written between bind() and hydrate().
        if (!this.cache.has(entry.key)) this.cache.set(entry.key, entry.value);
      }
      this.hydrated = true;
      this.log?.info({ stores: entries.length }, 'legacy KV cache hydrated');
    } catch (err) {
      this.log?.warn({ err: msg(err) }, 'legacy KV hydrate failed (degraded to in-memory)');
    }
  }

  /** Synchronous read from the cache; returns `fallback` when absent. */
  loadStore<T>(name: string, fallback: T): T {
    if (this.cache.has(name)) return this.cache.get(name) as T;
    // Not in cache — return the default and, if bound but not yet hydrated,
    // kick a background load so a later read reflects the durable value.
    if (this.kv && !this.hydrated) void this.hydrateKey(name);
    return fallback;
  }

  /** Synchronous cache update + immediate async write-through. */
  saveStore<T>(name: string, value: T): void {
    this.cache.set(name, value);
    this.clearTimer(name);
    void this.writeThrough(name, value);
  }

  /** Synchronous cache update + debounced async write-through. */
  debouncedSave<T>(name: string, value: T, delayMs = DEFAULT_DEBOUNCE_MS): void {
    this.cache.set(name, value);
    this.pending.add(name);
    this.clearTimer(name);
    const timer = setTimeout(() => {
      this.timers.delete(name);
      this.pending.delete(name);
      void this.writeThrough(name, this.cache.get(name));
    }, delayMs);
    // Do not keep the event loop alive for a pending debounce.
    if (typeof timer.unref === 'function') timer.unref();
    this.timers.set(name, timer);
  }

  /** Flush every pending debounced write (graceful shutdown). */
  async flush(): Promise<void> {
    const names = [...this.pending];
    for (const name of names) {
      this.clearTimer(name);
      this.pending.delete(name);
      await this.writeThrough(name, this.cache.get(name));
    }
  }

  private async hydrateKey(name: string): Promise<void> {
    if (!this.kv) return;
    try {
      const value = await this.kv.get(LEGACY_NAMESPACE, name);
      if (value !== null && !this.cache.has(name)) this.cache.set(name, value);
    } catch {
      /* degraded — the fallback default already returned */
    }
  }

  private async writeThrough(name: string, value: unknown): Promise<void> {
    if (!this.kv) return;
    try {
      await this.kv.set(LEGACY_NAMESPACE, name, value ?? null);
    } catch (err) {
      this.log?.warn({ err: msg(err), store: name }, 'legacy KV write-through failed');
    }
  }

  private clearTimer(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
  }
}

/** The process-wide singleton shared by the shim + migrated consumers. */
export const legacyKv = new LegacyKvCompat();

/** Synchronous whole-store read (JSON persistence replacement). */
export function loadStore<T>(name: string, fallback: T): T {
  return legacyKv.loadStore(name, fallback);
}

/** Synchronous cache write + immediate durable write-through. */
export function saveStore<T>(name: string, value: T): void {
  legacyKv.saveStore(name, value);
}

/** Synchronous cache write + debounced durable write-through. */
export function debouncedSave<T>(name: string, value: T, delayMs?: number): void {
  legacyKv.debouncedSave(name, value, delayMs);
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
