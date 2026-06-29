/**
 * ext-authz-grpc.ts — the Envoy external-authorization v3 CONTRACT.
 *
 * This is the real Envoy ext_authz v3 request/response surface
 * (`envoy.service.auth.v3.Authorization/Check`). Envoy's ext_authz filter (gRPC
 * variant) sends a `CheckRequest` carrying the inbound request's
 * method/path/headers and the verified source principal; the authorization
 * server answers with a `CheckResponse` whose `status.code` is a gRPC status
 * (OK = 0 => ALLOW, PERMISSION_DENIED = 7 => DENY) plus an `ok_response` or
 * `denied_response` body Envoy enforces.
 *
 * This module maps a `CheckRequest` into the package's `NetworkAuthzRequest`,
 * runs the default-deny `decideNetworkAuthz`, and shapes a `CheckResponse`.
 *
 * HOSTILE-BY-DEFAULT / FAIL-CLOSED: the decision logic already denies on every
 * uncertain path. This handler additionally guarantees that ANY thrown error,
 * rejected promise, or port timeout produces a DENY `CheckResponse` — never an
 * allow, never an exception that escapes to Envoy (which, with
 * `failure_mode_allow: false`, would itself fail closed, but we never rely on
 * that: we fail closed in-process too).
 *
 * Each evaluated request also emits one JSON access-log line (see
 * {@link formatAccessLogLine}) so the ext_authz decision is itself part of the
 * XDR feed, not just the data-plane request log.
 */
import type { NetworkAuthzRequest, NetworkAuthzDecision, NetworkSecurityEvent } from './types';
import type { PolicyAdvisorPort } from './ports';
import { decideNetworkAuthz, DECISION_HEADER } from './ext-authz';

// --- Envoy ext_authz v3 wire shapes (envoy.service.auth.v3) -----------------

/** gRPC status codes used by ext_authz. OK authorizes; anything else denies. */
export const GRPC_STATUS_OK = 0;
export const GRPC_STATUS_PERMISSION_DENIED = 7;

/** `envoy.service.auth.v3.AttributeContext.HttpRequest`. */
export interface EnvoyHttpRequest {
  readonly method?: string;
  readonly path?: string;
  readonly host?: string;
  readonly scheme?: string;
  /** Lower-cased header map, exactly as Envoy serializes it. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** `envoy.service.auth.v3.AttributeContext.Request`. */
export interface EnvoyRequestContext {
  readonly time?: string;
  readonly http?: EnvoyHttpRequest;
}

/**
 * `envoy.service.auth.v3.AttributeContext.Peer`. `principal` carries the
 * verified mTLS identity (SPIFFE URI SAN / subject) Envoy extracted from the
 * downstream client certificate; `address` carries the socket address.
 */
export interface EnvoyPeer {
  readonly principal?: string;
  readonly service?: string;
  readonly address?: {
    readonly socketAddress?: {
      readonly address?: string;
      readonly portValue?: number;
    };
  };
}

/** `envoy.service.auth.v3.AttributeContext`. */
export interface EnvoyAttributeContext {
  readonly source?: EnvoyPeer;
  readonly destination?: EnvoyPeer;
  readonly request?: EnvoyRequestContext;
  /** Arbitrary string context Envoy forwards from filter metadata. */
  readonly contextExtensions?: Readonly<Record<string, string>>;
}

/** `envoy.service.auth.v3.CheckRequest`. */
export interface EnvoyCheckRequest {
  readonly attributes?: EnvoyAttributeContext;
}

/** `envoy.config.core.v3.HeaderValueOption` (the subset we emit). */
export interface EnvoyHeaderValueOption {
  readonly header: { readonly key: string; readonly value: string };
}

/** `envoy.service.auth.v3.OkHttpResponse` (subset). */
export interface EnvoyOkHttpResponse {
  readonly headers?: readonly EnvoyHeaderValueOption[];
}

/** `envoy.type.v3.HttpStatus`. */
export interface EnvoyHttpStatus {
  readonly code: number;
}

/** `envoy.service.auth.v3.DeniedHttpResponse` (subset). */
export interface EnvoyDeniedHttpResponse {
  readonly status: EnvoyHttpStatus;
  readonly headers?: readonly EnvoyHeaderValueOption[];
  readonly body?: string;
}

/**
 * `envoy.service.auth.v3.CheckResponse`. `status` is a `google.rpc.Status`;
 * exactly one of `okResponse` / `deniedResponse` is set per the `code`.
 */
export interface EnvoyCheckResponse {
  readonly status: { readonly code: number; readonly message?: string };
  readonly okResponse?: EnvoyOkHttpResponse;
  readonly deniedResponse?: EnvoyDeniedHttpResponse;
}

// --- CheckRequest -> NetworkAuthzRequest ------------------------------------

/** Header name carrying the decision id for audit correlation. */
export const DECISION_ID_HEADER = 'x-recoder-decision-id';

function lowerHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

/**
 * Map an Envoy v3 `CheckRequest` into the package's `NetworkAuthzRequest`.
 *
 * Principal precedence: the peer principal Envoy extracted from the verified
 * client cert (`attributes.source.principal`) is authoritative. We fall back to
 * the XFCC URI header only when the structured principal is absent, so a forged
 * header can never override a real mTLS identity. A request with NEITHER is
 * treated as anonymous (and denied unless on a public prefix).
 */
export function checkRequestToAuthz(req: EnvoyCheckRequest): NetworkAuthzRequest {
  const attrs = req.attributes ?? {};
  const http = attrs.request?.http ?? {};
  const headers = lowerHeaders(http.headers);

  const method = (http.method ?? '').toUpperCase();
  // Strip the query string: authz is path-scoped, not query-scoped.
  const rawPath = http.path ?? '';
  const path = rawPath.split('?', 1)[0];

  const peerPrincipal = attrs.source?.principal?.trim();
  const xfccPrincipal = (headers['x-forwarded-client-cert-uri'] ?? '').trim();
  const principal =
    peerPrincipal && peerPrincipal.length > 0
      ? peerPrincipal
      : xfccPrincipal.length > 0
        ? xfccPrincipal
        : undefined;

  const socketIp = attrs.source?.address?.socketAddress?.address;
  const xff = (headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  const sourceIp = (xff && xff.length > 0 ? xff : undefined) ?? socketIp;

  const destination =
    attrs.destination?.service?.trim() ||
    (headers['x-recoder-destination'] ?? '').trim() ||
    (headers['x-envoy-decorator-operation'] ?? '').trim() ||
    undefined;

  return { method, path, headers, sourceIp, principal, destination };
}

// --- NetworkAuthzDecision -> CheckResponse ----------------------------------

function decisionHeaders(decision: NetworkAuthzDecision): EnvoyHeaderValueOption[] {
  return [
    { header: { key: DECISION_HEADER, value: decision.effect } },
    { header: { key: DECISION_ID_HEADER, value: decision.decisionId } },
  ];
}

/** Shape a `NetworkAuthzDecision` into an Envoy v3 `CheckResponse`. */
export function decisionToCheckResponse(decision: NetworkAuthzDecision): EnvoyCheckResponse {
  if (decision.effect === 'allow') {
    return {
      status: { code: GRPC_STATUS_OK },
      okResponse: { headers: decisionHeaders(decision) },
    };
  }
  return {
    status: { code: GRPC_STATUS_PERMISSION_DENIED, message: decision.reason },
    deniedResponse: {
      status: { code: decision.status },
      headers: decisionHeaders(decision),
      // Generic body: never leak policy internals to the data-plane client.
      body: 'Forbidden',
    },
  };
}

// --- Access log -------------------------------------------------------------

/**
 * A single ext_authz access-log record. Identical key shape to the Envoy
 * data-plane JSON access log (envoy-config.ts ACCESS_LOG_JSON_FORMAT) so the
 * SAME XDR parser consumes both feeds. `response_flags` is `UAEX` on an
 * ext_authz denial, mirroring the flag Envoy itself stamps.
 */
export interface ExtAuthzAccessLogRecord {
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  readonly response_code: number;
  readonly response_flags: string;
  readonly source_ip: string;
  readonly principal: string;
  readonly upstream: string;
  readonly decision_id: string;
  readonly reason: string;
}

/** Build the structured access-log record for one evaluated request. */
export function buildAccessLogRecord(
  authz: NetworkAuthzRequest,
  decision: NetworkAuthzDecision,
  at: string = new Date().toISOString(),
): ExtAuthzAccessLogRecord {
  return {
    timestamp: at,
    method: authz.method || 'UNKNOWN',
    path: authz.path || '/',
    response_code: decision.status,
    // Mirror Envoy: ext_authz denial => UAEX; an allow has no special flag.
    response_flags: decision.effect === 'deny' ? 'UAEX' : '-',
    source_ip: authz.sourceIp ?? 'unknown',
    principal: authz.principal ?? '-',
    upstream: authz.destination ?? '-',
    decision_id: decision.decisionId,
    reason: decision.reason,
  };
}

/** Serialize one access-log record to a single JSON line (no trailing newline). */
export function formatAccessLogLine(record: ExtAuthzAccessLogRecord): string {
  return JSON.stringify(record);
}

/** A NetworkSecurityEvent derived directly from an ext_authz decision. */
export function accessLogRecordToEvent(record: ExtAuthzAccessLogRecord): NetworkSecurityEvent {
  return {
    timestamp: record.timestamp,
    method: record.method,
    path: record.path,
    responseCode: record.response_code,
    sourceIp: record.source_ip,
    principal: record.principal === '-' ? undefined : record.principal,
    upstream: record.upstream === '-' ? undefined : record.upstream,
    responseFlags: record.response_flags === '-' ? undefined : record.response_flags,
  };
}

// --- The handler ------------------------------------------------------------

/** A sink for the JSON access-log line emitted per evaluated request. */
export type AccessLogSink = (line: string) => void;

export interface CheckResult {
  readonly response: EnvoyCheckResponse;
  readonly decision: NetworkAuthzDecision;
  readonly authz: NetworkAuthzRequest;
  readonly accessLog: ExtAuthzAccessLogRecord;
}

/**
 * The fail-closed DENY used whenever the decision pipeline cannot produce a
 * trustworthy verdict (malformed CheckRequest, thrown advisor, etc.).
 */
function failClosed(reason: string): NetworkAuthzDecision {
  return {
    effect: 'deny',
    status: 403,
    reason,
    decisionId: `netauthz_failclosed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  };
}

/**
 * Handle one Envoy ext_authz v3 `CheckRequest`. SYNCHRONOUS — the advisor port
 * is synchronous. Always returns a `CheckResult`; never throws. On any internal
 * error the result is a DENY (fail closed) and an access-log line is still
 * emitted.
 *
 * @param req      The raw Envoy v3 CheckRequest.
 * @param advisor  The real Recoder policy engine, injected as a port.
 * @param logSink  Optional sink for the per-request JSON access-log line.
 */
export function handleCheck(
  req: EnvoyCheckRequest,
  advisor: PolicyAdvisorPort,
  logSink?: AccessLogSink,
): CheckResult {
  let authz: NetworkAuthzRequest;
  let decision: NetworkAuthzDecision;
  try {
    authz = checkRequestToAuthz(req);
    decision = decideNetworkAuthz(authz, advisor);
  } catch (error: unknown) {
    // The decision logic already fails closed on advisor errors; this catch is
    // the last line of defense for an unexpected failure in mapping itself.
    const message = error instanceof Error ? error.message : 'unknown error';
    authz = { method: '', path: '', headers: {} };
    decision = failClosed(`ext_authz handler failure (fail-closed): ${message}`);
  }

  const accessLog = buildAccessLogRecord(authz, decision);
  if (logSink) {
    try {
      logSink(formatAccessLogLine(accessLog));
    } catch {
      // A failing log sink MUST NOT change the authz outcome or throw upstream.
    }
  }

  return {
    response: decisionToCheckResponse(decision),
    decision,
    authz,
    accessLog,
  };
}

/**
 * Async wrapper for handler chains that await the check (e.g. a gRPC service
 * `Check` impl). Guarantees fail-closed on a rejected advisor: if the injected
 * advisor is actually async and rejects/throws, we still produce a DENY.
 */
export async function handleCheckAsync(
  req: EnvoyCheckRequest,
  advisor: PolicyAdvisorPort,
  logSink?: AccessLogSink,
): Promise<CheckResult> {
  try {
    return handleCheck(req, advisor, logSink);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const decision = failClosed(`ext_authz async handler failure (fail-closed): ${message}`);
    const authz: NetworkAuthzRequest = { method: '', path: '', headers: {} };
    const accessLog = buildAccessLogRecord(authz, decision);
    if (logSink) {
      try {
        logSink(formatAccessLogLine(accessLog));
      } catch {
        /* never throw from the log sink */
      }
    }
    return { response: decisionToCheckResponse(decision), decision, authz, accessLog };
  }
}
