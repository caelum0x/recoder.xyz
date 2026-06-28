/**
 * ext-authz.ts — the Recoder side of the Envoy ext_authz HTTP contract.
 *
 * Envoy's HTTP ext_authz filter POSTs the inbound request to our authz endpoint.
 * A 2xx response means ALLOW; any non-2xx (we use 403) means DENY and Envoy
 * returns that status to the client. We delegate the actual allow/deny to the
 * REAL Recoder policy engine (`evaluatePolicy` from @recoder/governance) over a
 * NetworkAuthzRequest mapped into a PolicyInput.
 *
 * HOSTILE-BY-DEFAULT: this is default-deny. Any unconfigured request, any error,
 * any policy result that is not an explicit `allow` results in 403.
 */
import { randomUUID } from 'node:crypto';
import { evaluatePolicy, type PolicyInput } from '@recoder/governance';
import type { AgentProfile } from '@recoder/agent-os';
import type { NetworkAuthzRequest, NetworkAuthzDecision } from './types';

const DENY_STATUS = 403;
const ALLOW_STATUS = 200;

/**
 * The set of request principals the network layer recognizes. A request with a
 * verified mTLS principal in this set is treated as an internal service caller.
 * Configured via env (comma-separated SAN/subject values). Empty by default —
 * which, combined with default-deny, means an unconfigured deployment denies
 * everything until trust is explicitly established.
 */
function trustedPrincipals(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReadonlySet<string> {
  const raw = env.NETWORK_TRUSTED_PRINCIPALS ?? '';
  return new Set(
    raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
  );
}

/**
 * Public path prefixes that may be reached without an mTLS principal (e.g. the
 * customer-facing app surfaces). Still subject to rate limiting + policy; this
 * only governs whether a missing principal is fatal. Default-deny: if no public
 * prefixes are configured AND there is no principal, the request is denied.
 */
function publicPrefixes(
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  const raw = env.NETWORK_PUBLIC_PREFIXES ?? '';
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Build a minimal, locked-down AgentProfile actor for the network principal. */
function actorFor(req: NetworkAuthzRequest): AgentProfile {
  const isTrusted = Boolean(req.principal && trustedPrincipals().has(req.principal));
  const now = new Date().toISOString();
  return {
    agentId: req.principal ?? `anon:${req.sourceIp ?? 'unknown'}`,
    displayName: req.principal ?? 'anonymous-network-caller',
    vendorSurface: 'custom',
    connectorId: 'network.envoy',
    runtimeKind: 'external',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      // A trusted, mTLS-verified principal may traverse the mesh; an anonymous
      // caller may not (network egress disabled => deny-biased).
      allowNetwork: isTrusted,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 0,
      writeLockRequired: true,
    },
    approvalPolicy: { mode: 'manual', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'none',
    cwdPolicy: { mode: 'workspace_root', allowedRoots: [] },
    health: { status: 'unknown', checkedAt: now },
    lastSeenAt: now,
  };
}

/**
 * Map a NetworkAuthzRequest to a PolicyInput. A mutating HTTP method on the mesh
 * is modeled as a `deploy.preview` network action (the policy rule that gates
 * `allowNetwork`); a read is modeled as a `tool.call`. This binds the network
 * decision to the same engine that governs agent actions.
 */
function toPolicyInput(req: NetworkAuthzRequest): PolicyInput {
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  return {
    actor: actorFor(req),
    action: mutating ? 'deploy.preview' : 'tool.call',
    target: {
      toolName: `network:${req.destination ?? 'unknown'}`,
      environment: req.destination,
    },
    now: new Date().toISOString(),
  };
}

function deny(reason: string): NetworkAuthzDecision {
  return { effect: 'deny', status: DENY_STATUS, reason, decisionId: `netauthz_${randomUUID()}` };
}

function allow(reason: string): NetworkAuthzDecision {
  return { effect: 'allow', status: ALLOW_STATUS, reason, decisionId: `netauthz_${randomUUID()}` };
}

/**
 * The core authz decision. Pure (modulo env reads + the policy engine) and
 * synchronous. Default-deny on every uncertain path.
 */
export function decideNetworkAuthz(req: NetworkAuthzRequest): NetworkAuthzDecision {
  // 1) Reject structurally malformed requests outright.
  if (!req.method || !req.path) {
    return deny('Malformed authz request: missing method or path.');
  }

  // 2) An unverified caller is only allowed onto explicitly-public prefixes.
  if (!req.principal) {
    const prefixes = publicPrefixes();
    const isPublic = prefixes.some((p) => req.path.startsWith(p));
    if (!isPublic) {
      return deny('No verified mTLS principal and path is not public.');
    }
  } else {
    // 3) A presented principal MUST be in the trusted set. An unrecognized
    //    principal is hostile until proven otherwise.
    if (!trustedPrincipals().has(req.principal)) {
      return deny(`Unrecognized mTLS principal: ${req.principal}.`);
    }
  }

  // 4) Delegate to the real Recoder policy engine. Any non-`allow` => deny.
  try {
    const verdict = evaluatePolicy(toPolicyInput(req));
    if (verdict.effect === 'allow') {
      return allow(verdict.reason || 'Allowed by Recoder network policy.');
    }
    return deny(verdict.reason || `Policy effect: ${verdict.effect}.`);
  } catch (error: unknown) {
    // Fail closed. Never leak the error detail to the data plane response.
    const message = error instanceof Error ? error.message : 'unknown error';
    return deny(`Policy evaluation failed (fail-closed): ${message}`);
  }
}

/** Header name Envoy reads to learn the decision reason for upstream logging. */
export const DECISION_HEADER = 'x-recoder-decision';

/**
 * Extract a NetworkAuthzRequest from a raw HTTP request (express). Tolerant of
 * the header casing Envoy uses for the ext_authz HTTP service variant.
 */
export function extractAuthzRequest(raw: {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  originalPath?: string;
  ip?: string;
}): NetworkAuthzRequest {
  const h = raw.headers;
  const one = (key: string): string | undefined => {
    const v = h[key.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  // Envoy forwards the original request line via these headers on the HTTP
  // ext_authz check call.
  const method = one('x-envoy-original-method') ?? raw.method ?? 'GET';
  const path = one('x-envoy-original-path') ?? raw.originalPath ?? '/';
  const principal = one('x-forwarded-client-cert-uri') ?? one('x-recoder-principal');
  const sourceIp = one('x-forwarded-for')?.split(',')[0]?.trim() ?? raw.ip;
  const destination = one('x-recoder-destination') ?? one('x-envoy-decorator-operation');

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    headers[k] = Array.isArray(v) ? v.join(',') : (v ?? '');
  }

  return { method, path, headers, sourceIp, principal, destination };
}
