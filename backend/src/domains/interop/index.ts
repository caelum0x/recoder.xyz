/**
 * Interop domain — public factory + the ONE public interface.
 *
 * `createInteropModule(deps)` builds the composer that owns the ONE `InteropChain`
 * (`authorize→risk→policy→audit`, over the governance gate) and the SINGLE set of
 * edge middleware (interop guard, rate-limit, `/internal/*` key gate, ext-authz
 * ingress). The wire surface (A2A envelope / agent-card / JSON-RPC) is scaffolded
 * for the later wire group.
 *
 * Fail-closed by construction: an absent gate → every edge denies; an unwired
 * ingress verifier → hostile ingress is rejected, never admitted.
 */
import type { Router, RequestHandler } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { GovernanceGate } from '../governance/ports/gate.port.js';
import type { InteropChain } from './ports/interop-chain.port.js';
import type { InteropConfigOverrides } from './config.js';
import type { InteropGuardOptions } from './middleware/interop.middleware.js';
import type { SignedIngressGate, IngressVerifier } from './wire/signed-ingress.gate.js';
import type { EnvelopeService } from './wire/a2a-envelope.service.js';
import type { AgentCardService, LocalCardInput } from './wire/agent-card.service.js';
import type { A2AJsonRpcServer } from './wire/a2a-jsonrpc-server.js';

/** The rate-limit surfaces buckets are keyed by. */
export type RateLimitSurface = 'edge' | 'mcp' | 'connector';

/** Dependencies injected by bootstrap (after governance is built). */
export interface InteropModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The governance write/route seam the chain delegates to. Absent → fail-closed. */
  readonly gate?: GovernanceGate;
  /** Not-yet-in-AppConfig interop values (signing secret, rate buckets, runtimes). */
  readonly overrides?: InteropConfigOverrides;
  /** Static inputs for this instance's local A2A agent-card. */
  readonly localCard?: LocalCardInput;
  /** The signed-ingress verifier (wire group); absent → untrusted ingress denied. */
  readonly ingressVerifier?: IngressVerifier;
}

/** The public surface every other domain / the edge consumes. */
export interface InteropModule {
  readonly name: 'interop';
  /** THE edge seam: `authorize→risk→policy→audit` (one impl, over the gate). */
  chain(): InteropChain;
  /** The interop guard the edge/route table wraps around every domain router. */
  guard(options?: InteropGuardOptions): RequestHandler;
  /** The rate-limit gate for a surface (`edge` / `mcp` / `connector`). */
  rateLimit(surface: RateLimitSurface): RequestHandler;
  /** The single `/internal/*` key gate (constant-time; fail-closed). */
  internalKeyGuard(): RequestHandler;
  /** The ext-authz gate for untrusted A2A / connector ingress (fail-closed). */
  extAuthzGuard(): RequestHandler;
  /** The signed-ingress gate (consumed by ext-authz; exposed for the wire group). */
  signedIngress(): SignedIngressGate;
  /** The A2A envelope build/parse/validate surface (wire skeleton). */
  envelope(): EnvelopeService;
  /** The local + remote agent-card surface (wire skeleton). */
  agentCard(): AgentCardService;
  /** The A2A JSON-RPC dispatcher (wire skeleton). */
  jsonRpc(): A2AJsonRpcServer;
  /** The `/api/a2a` router: health + agent-card + the ext-authz-guarded RPC edge. */
  routes(): Router;
  /** Truthful component health. */
  health(): ComponentHealth;
  /** Boot hook (idempotent). */
  start(): Promise<void>;
  /** Shutdown hook (idempotent, degrade-safe). */
  stop(): Promise<void>;
}

// Value import last so the type-only imports above form no runtime cycle.
import { InteropComposer } from './interop-module.js';

/** Build the interop module. */
export function createInteropModule(deps: InteropModuleDeps): InteropModule {
  return new InteropComposer(deps);
}
