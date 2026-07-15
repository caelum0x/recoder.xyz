/**
 * Interop domain-internal types — the shapes not owned by `packages/*` or the
 * governance domain. Kept deliberately small: the CROSS-domain edge vocabulary
 * (the chain decision) is re-exported from `domains/governance` (conflict #1 —
 * ONE `InteropChain` contract), so this file only carries the wire + runtime +
 * middleware shapes local to this domain.
 *
 * The runtime/registry/dispatch shapes (`AgentRow`, `DispatchPlan`,
 * `ConnectorSpec`, `RuntimeSelection`, `SloWindow`) are declared here as the
 * shared domain vocabulary the later interop groups (runtimes, dispatch,
 * registry) extend; the chain + middleware group only depends on the wire +
 * ingress shapes.
 */
import type { GovernanceEffect, RiskTier } from '../governance/types.js';

// --- Chain / edge (re-exported contract lives in governance) -----------------

/** The four ordered stages every edge passes: `authorize → risk → policy → audit`. */
export type ChainStage = 'authorize' | 'risk' | 'policy' | 'audit';

/** Whether an edge is a read or a write (writes flow through the gate `decide`). */
export type EdgeKind = 'read' | 'write';

// --- Wire (A2A envelope / agent-card) ----------------------------------------

/**
 * The minimal envelope projection the wire skeletons operate on. The canonical
 * signed-envelope shape is owned by `@recoder/a2a-sdk`; the wire group binds to
 * it. This is the domain-facing view (no signing internals).
 */
export interface A2AEnvelope<TPayload = unknown> {
  readonly id: string;
  readonly from: string;
  readonly to?: string;
  readonly kind: string;
  readonly payload: TPayload;
  readonly correlationId?: string;
  readonly createdAt: string;
}

/** Result of admitting an untrusted inbound envelope at the edge (fail-closed). */
export interface IngressResult<TPayload = unknown> {
  readonly admitted: boolean;
  /** HTTP-ish status for the edge to surface (200/400/401/403/503). */
  readonly status: number;
  /** Stable rejection/admission code (mirrors `@recoder/interop` codes). */
  readonly code: string;
  readonly reason: string;
  /** The verified payload — present only when `admitted === true`. */
  readonly payload?: TPayload;
}

/** An outbound sealed + signed envelope this instance publishes. */
export interface EgressEnvelope<TPayload = unknown> {
  readonly envelope: A2AEnvelope<TPayload>;
  /** Opaque signature material produced by the wire signer (base64). */
  readonly signature?: string;
}

/** This instance's (or a remote's) A2A agent-card — capability advertisement. */
export interface AgentCard {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly url?: string;
  readonly capabilities: readonly string[];
  /** ed25519 public key advertised for envelope verification. */
  readonly publicKey?: string;
  readonly version?: string;
}

// --- Runtime / registry vocabulary (extended by later interop groups) --------

/** A registered agent / runtime endpoint row (projection of `interop_agents`). */
export interface AgentRow {
  readonly id: string;
  readonly userId: string;
  readonly kind: 'runtime' | 'remote_a2a' | 'connector';
  readonly runtimeId?: string;
  readonly card: AgentCard;
  readonly publicKey?: string;
  readonly status: 'up' | 'down' | 'degraded' | 'unknown';
}

/** A resolved runtime selection for a dispatch. */
export interface RuntimeSelection {
  readonly runtimeId: string;
  readonly reason: string;
  /** Truthful: the selected runtime's connector key/binary is present. */
  readonly available: boolean;
}

/** A single connector process spec (CLI coding agent). */
export interface ConnectorSpec {
  readonly runtimeId: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  /** Whether the connector's auth preflight passed (key present). */
  readonly authReady: boolean;
}

/** A fan-out dispatch plan across N runtimes (squad pattern). */
export interface DispatchPlan {
  readonly taskId: string;
  readonly selections: readonly RuntimeSelection[];
  readonly strategy: 'first' | 'quorum' | 'all';
}

/** A heartbeat/SLO window snapshot for a runtime. */
export interface SloWindow {
  readonly runtimeId: string;
  readonly lastSeenAt?: string;
  readonly liveness: 'live' | 'stale' | 'down';
  readonly p50DispatchMs?: number;
  readonly p95DispatchMs?: number;
}

// --- Shared aliases (kept local so consumers don't reach into governance) -----

export type { GovernanceEffect, RiskTier };
