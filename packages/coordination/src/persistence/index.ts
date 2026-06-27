/**
 * persistence barrel — adapters implementing the store ports.
 *
 * The in-memory adapters are the default (tests + single-process) and remain
 * the degrade fallback. The Postgres adapters are the durable, cross-process
 * source of record for work-locks + lease fence tokens; they depend only on a
 * narrow `PgPool` structural type, so the pure core keeps NO hard dep on `pg`
 * (the composition root injects a real pool via a lazy `import("pg")`).
 */

export * as memory from './memory';
export * as postgres from './postgres';

// TODO(wave-2): export * as redis from './redis' — EmptyClaimCache negative
// cache + short-lived lock lease/fence. Lazy `import("ioredis")`.
