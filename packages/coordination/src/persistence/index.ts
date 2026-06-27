/**
 * persistence barrel — adapters implementing the store ports.
 *
 * The in-memory adapters are the default (tests + single-process). The Postgres
 * (production source of record) and Redis (fast-path) adapters are deferred to
 * wave-2 — they are intentionally NOT stubbed here so nothing fakes durability.
 */

export * as memory from './memory';

// TODO(wave-2): export * as postgres from './postgres' — pg-backed source of
// record (locks unique partial index, claims FOR UPDATE SKIP LOCKED, signal
// sink → agent-os table). Lazy `import("pg")` so the pure core has no hard dep.
// TODO(wave-2): export * as redis from './redis' — EmptyClaimCache negative
// cache + short-lived lock lease/fence. Lazy `import("ioredis")`.
