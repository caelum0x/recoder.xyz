/**
 * Legacy JSON-persistence compatibility shim.
 *
 * The old `data/*.json` `loadStore`/`saveStore`/`debouncedSave` store was
 * DELETED and replaced by the DB-backed `core.kv_store` (domain
 * `domains/persistence`). This module preserves the exact synchronous call
 * shape so existing consumers keep compiling and working, while routing every
 * read/write through the persistence domain's sync KV facade (in-memory cache +
 * async write-through to Postgres, degrade-safe to in-memory when no DB).
 *
 * New code should depend on the async `KvStore` port from
 * `domains/persistence` instead of these sync helpers.
 */
export { loadStore, saveStore, debouncedSave } from './domains/persistence/repositories/kv-compat.js';
