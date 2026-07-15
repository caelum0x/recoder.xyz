/**
 * Shared fakes for interop unit tests. Not a `*.test.ts` file, so vitest does not
 * collect it as a suite.
 */
import type { InteropConfig } from '../config.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { Principal } from '../../identity/types.js';
import type {
  GateDecisionContext,
  GateVerdict,
  GovernanceAction,
  RoutingHint,
} from '../../governance/types.js';

const BUCKET = { maxRequests: 100, windowMs: 60_000, maxConcurrent: 10 };

/** A complete {@link InteropConfig} with degrade-safe defaults for tests. */
export function makeInteropConfig(overrides: Partial<InteropConfig> = {}): InteropConfig {
  return {
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    isProduction: false,
    requireSignedIngress: false,
    hmacSecret: null,
    allowInsecureIngress: true,
    signingMode: 'off',
    rateLimit: { edge: { ...BUCKET }, mcp: { ...BUCKET }, connector: { ...BUCKET } },
    runtimes: {},
    dispatchTimeoutMs: 5_000,
    heartbeatStaleMs: 30_000,
    ...overrides,
  };
}

export function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: 'u1',
    scopes: ['write'],
    kind: 'session',
    isAnonymous: false,
    raw: null,
    ...overrides,
  };
}

export function anonymousPrincipal(): Principal {
  return { userId: 'anonymous', scopes: ['read'], kind: 'anonymous', isAnonymous: true, raw: null };
}

/** Options for the {@link fakeGate}. */
export interface FakeGateOpts {
  readonly verdict?: GateVerdict;
  readonly routing?: RoutingHint;
  readonly throwOnDecide?: boolean;
  readonly throwOnRoute?: boolean;
}

const now = (): string => new Date().toISOString();

export const ALLOW_VERDICT: GateVerdict = {
  verdictId: 'v_allow',
  requestId: 'r1',
  effect: 'allow',
  tier: 'low',
  reason: 'ok',
  degraded: false,
  engine: 'ts',
  auditHash: 'a'.repeat(64),
  createdAt: now(),
};

export const DENY_VERDICT: GateVerdict = {
  verdictId: 'v_deny',
  requestId: 'r1',
  effect: 'deny',
  tier: 'high',
  reason: 'blocked by policy',
  degraded: false,
  engine: 'ts',
  createdAt: now(),
};

/** A {@link GovernanceGate} double exposing only the surfaces the chain calls. */
export function fakeGate(opts: FakeGateOpts = {}): GovernanceGate {
  const gate: Pick<GovernanceGate, 'decide' | 'route'> = {
    async decide(_a: GovernanceAction, _p: Principal, _c: GateDecisionContext): Promise<GateVerdict> {
      if (opts.throwOnDecide) throw new Error('gate decide fault');
      return opts.verdict ?? ALLOW_VERDICT;
    },
    async route(_a: GovernanceAction, _p: Principal, _c: GateDecisionContext): Promise<RoutingHint> {
      if (opts.throwOnRoute) throw new Error('gate route fault');
      return opts.routing ?? { routable: true, tier: 'low', reason: 'ok' };
    },
  };
  return gate as unknown as GovernanceGate;
}

export const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;
