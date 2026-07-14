/**
 * Typed dependency-injection tokens.
 *
 * A `Token<T>` is a branded symbol carrying its resolved type at compile time so
 * `container.resolve(TOKENS.AppConfig)` returns `AppConfig` with no cast. The
 * `_type` field is phantom (never assigned) — it only exists to bind `T`.
 */
import type { Logger } from 'pino';
import type { AppConfig } from './app-config.js';
import type { DomainModule } from './module-base.js';
import type { DomainKey } from './domain-registry.js';

/** A DI key that remembers the type it resolves to. */
export interface Token<T> {
  readonly symbol: symbol;
  readonly description: string;
  /** Phantom marker — never read at runtime. */
  readonly _type?: T;
}

/** Create a fresh typed token. */
export function createToken<T>(description: string): Token<T> {
  return { symbol: Symbol(description), description };
}

/** Well-known foundation tokens registered by `bootstrap/container.ts`. */
export const TOKENS = {
  AppConfig: createToken<AppConfig>('AppConfig'),
  Logger: createToken<Logger>('Logger'),
} as const;

/**
 * One token per domain module, keyed by {@link DomainKey}. Domains register
 * their composed module under `DOMAIN_TOKENS[key]`; the edge/observability
 * resolve them back out. Phase 0 registers none — the map is the seam.
 */
export const DOMAIN_TOKENS: Readonly<Record<DomainKey, Token<DomainModule>>> = {
  persistence: createToken<DomainModule>('module:persistence'),
  identity: createToken<DomainModule>('module:identity'),
  governance: createToken<DomainModule>('module:governance'),
  edge: createToken<DomainModule>('module:edge'),
  'agent-os': createToken<DomainModule>('module:agent-os'),
  conductor: createToken<DomainModule>('module:conductor'),
  interop: createToken<DomainModule>('module:interop'),
  engines: createToken<DomainModule>('module:engines'),
  inference: createToken<DomainModule>('module:inference'),
  social: createToken<DomainModule>('module:social'),
  memory: createToken<DomainModule>('module:memory'),
  billing: createToken<DomainModule>('module:billing'),
  cloud: createToken<DomainModule>('module:cloud'),
  observability: createToken<DomainModule>('module:observability'),
};
