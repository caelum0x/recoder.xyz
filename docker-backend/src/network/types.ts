/**
 * Recoder Network + XDR — shared domain types.
 *
 * This module realizes the Recoder network subsystem as an Envoy CONTROL PLANE:
 * we generate a real, deployable Envoy bootstrap config (envoy-config.ts), serve
 * the ext_authz decision the data plane calls back into (ext-authz.ts), and turn
 * the data plane's access logs into security events + detections (xdr/).
 *
 * Hostile-by-default: authz is default-deny. Anything we cannot positively
 * authorize is denied.
 */

/** A single upstream service the Envoy data plane can route to. */
export interface NetworkUpstream {
  /** Cluster name in the Envoy config (DNS-1123-ish, used as the route target). */
  readonly name: string;
  /** Upstream host (docker service name or DNS name). */
  readonly host: string;
  /** Upstream port. */
  readonly port: number;
  /** Optional host header / SNI to present when routing (defaults to host). */
  readonly hostHeader?: string;
  /** When true, Envoy speaks TLS to the upstream (transport_socket on cluster). */
  readonly tlsUpstream?: boolean;
}

/** TLS material for the downstream (client-facing) HTTPS listener. */
export interface NetworkTls {
  /** Path inside the Envoy container to the server certificate chain (PEM). */
  readonly certPath: string;
  /** Path inside the Envoy container to the server private key (PEM). */
  readonly keyPath: string;
  /**
   * When set, require + verify client certificates (mTLS). Path to a trusted CA
   * bundle inside the Envoy container. The verified principal (SAN/subject) is
   * forwarded to ext_authz and used by the authz decision.
   */
  readonly clientCaPath?: string;
  /** Minimum TLS version. Defaults to TLSv1_2. */
  readonly minVersion?: 'TLSv1_2' | 'TLSv1_3';
}

/** Token-bucket rate limit applied at the listener (local rate limiting). */
export interface NetworkRateLimit {
  /** Max tokens (burst). */
  readonly maxTokens: number;
  /** Tokens refilled per fill interval. */
  readonly tokensPerFill: number;
  /** Fill interval in milliseconds. */
  readonly fillIntervalMs: number;
}

/** Where Envoy writes access logs (the XDR feed). */
export interface NetworkAccessLog {
  /** Path inside the Envoy container for the JSON access-log file. */
  readonly path: string;
}

/** The full input from which a deployable Envoy config is generated. */
export interface NetworkConfig {
  /** Admin interface bind address (Envoy admin). */
  readonly adminAddress: string;
  /** Admin interface port. */
  readonly adminPort: number;
  /** Downstream HTTPS listener bind address. */
  readonly listenAddress: string;
  /** Downstream HTTPS listener port. */
  readonly listenPort: number;
  /** TLS material for the downstream listener. */
  readonly tls: NetworkTls;
  /** Upstream clusters (recoder services). */
  readonly upstreams: readonly NetworkUpstream[];
  /**
   * The ext_authz target: where the data plane asks "allow or deny?".
   * This points at this very backend's /internal/network/authz route.
   */
  readonly extAuthz: {
    /** Cluster name for the authz service. */
    readonly cluster: string;
    /** Authz service host. */
    readonly host: string;
    /** Authz service port. */
    readonly port: number;
    /** HTTP path prefix the data plane POSTs the check to. */
    readonly path: string;
    /** ext_authz request timeout (ms). */
    readonly timeoutMs: number;
    /**
     * When true (default), a failure to reach ext_authz DENIES the request
     * (fail-closed / hostile-by-default). Never set false in production.
     */
    readonly failureModeAllow?: boolean;
  };
  /** Local rate limit applied at the HTTPS listener. */
  readonly rateLimit: NetworkRateLimit;
  /** Access-log sink config. */
  readonly accessLog: NetworkAccessLog;
}

/**
 * The authz question the data plane asks. Derived from the Envoy ext_authz
 * CheckRequest (HTTP variant) attributes.
 */
export interface NetworkAuthzRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Source IP of the downstream client. */
  readonly sourceIp?: string;
  /** Verified mTLS principal (SAN URI/DNS or subject), if client cert present. */
  readonly principal?: string;
  /** Destination cluster/service the request targets, if resolvable. */
  readonly destination?: string;
}

export type NetworkAuthzEffect = 'allow' | 'deny';

/** The authz answer the data plane enforces. */
export interface NetworkAuthzDecision {
  readonly effect: NetworkAuthzEffect;
  /** HTTP status the data plane returns to the client on this decision. */
  readonly status: number;
  /** Human/machine-readable reason. Safe to log; MUST NOT carry secrets. */
  readonly reason: string;
  /** Stable decision id for audit correlation. */
  readonly decisionId: string;
}

/** One parsed line of the Envoy JSON access log, normalized for XDR. */
export interface NetworkSecurityEvent {
  /** ISO timestamp of the request start. */
  readonly timestamp: string;
  readonly method: string;
  readonly path: string;
  /** Final HTTP response code Envoy returned to the client. */
  readonly responseCode: number;
  /** Source/client IP. */
  readonly sourceIp: string;
  /** mTLS principal if present. */
  readonly principal?: string;
  /** Upstream cluster the request was routed to (or attempted). */
  readonly upstream?: string;
  /** Bytes sent to the client. */
  readonly bytesSent?: number;
  /** Total request duration in ms. */
  readonly durationMs?: number;
  /**
   * Envoy response flags (e.g. "UAEX" ext_authz denied, "URX", "NR" no route).
   * These are the load-bearing security signal in the access log.
   */
  readonly responseFlags?: string;
}

export type XdrSeverity = 'low' | 'medium' | 'high' | 'critical';

export type XdrRuleId =
  | 'authz_denial_burst'
  | 'repeated_auth_failure'
  | 'denied_egress'
  | 'anomalous_rate';

/** A detection emitted by an XDR rule over a window of security events. */
export interface XdrDetection {
  readonly detectionId: string;
  readonly ruleId: XdrRuleId;
  readonly severity: XdrSeverity;
  /** The source IP (or principal) the detection is attributed to. */
  readonly subject: string;
  /** Human-readable summary. Safe to log. */
  readonly summary: string;
  /** ISO timestamp the detection was raised. */
  readonly detectedAt: string;
  /** Count of events that triggered the rule. */
  readonly eventCount: number;
  /** A bounded sample of the offending events (for evidence). */
  readonly sampleEvents: readonly NetworkSecurityEvent[];
  /** Audit chain hash this detection was sealed under (set on emit). */
  readonly auditHash?: string;
}
