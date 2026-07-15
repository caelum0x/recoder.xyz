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
// Capability contract types (type-only — erased at runtime, no import cycle). A
// capability token lets a later domain resolve ONE cross-domain seam (the gate,
// secrets, the interop chain) without resolving the whole owning module.
import type { GovernanceGate } from '../domains/governance/ports/gate.port.js';
import type { SecretsPort } from '../domains/governance/ports/secrets.port.js';
import type { InteropChain } from '../domains/governance/ports/interop.port.js';
import type { WorkLockService } from '../domains/governance/services/work-lock.service.js';
import type { ApprovalService } from '../domains/governance/services/approval.service.js';
import type { EntitlementGate } from '../domains/billing/ports/entitlement.port.js';

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
 * Cross-domain CAPABILITY tokens (beyond the per-module {@link DOMAIN_TOKENS}).
 * A domain registers a single seam here so a later domain resolves just that
 * capability without reaching into the owning module. Phase 3 registers the
 * governance gate/secrets/locks/approvals + the interop chain.
 */
export const CAPABILITY_TOKENS = {
  /** THE write seam: `GovernanceGate.decide → risk → audit` (governance-owned). */
  governanceGate: createToken<GovernanceGate>('capability:governance-gate'),
  /** The envelope-encrypted secret store (governance-owned). */
  secrets: createToken<SecretsPort>('capability:secrets'),
  /** Path/work-lock acquire/release/check (governance-owned). */
  workLock: createToken<WorkLockService>('capability:work-lock'),
  /** The control-plane approval-gate lifecycle (governance-owned). */
  approval: createToken<ApprovalService>('capability:approval'),
  /** THE edge seam: `authorize→risk→policy→audit` (interop-owned, over the gate). */
  interopChain: createToken<InteropChain>('capability:interop-chain'),
  /**
   * THE cross-domain entitlement seam (billing-owned): `resolvePlan`/`check`/
   * `checkQuota`. Registered so conductor (pre-dispatch quota), inference (token
   * metering), and engines (usage) can resolve it without importing billing. The
   * consuming modules do not yet accept it at construction; this token makes it
   * available for that wiring once they expose a setter/optional dep.
   */
  entitlementGate: createToken<EntitlementGate>('capability:entitlement-gate'),
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
