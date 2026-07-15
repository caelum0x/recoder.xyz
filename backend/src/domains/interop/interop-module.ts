/**
 * `InteropComposer` — the composer that fuses the A2A wire + edge admission into
 * one module. It:
 *  - builds the ONE `InteropChain` (`authorize→risk→policy→audit`) over the
 *    governance gate injected by bootstrap (conflict #1: interop OWNS the chain
 *    impl, governance owns the gate it calls — no duplicate gate composition),
 *  - exposes the four edge middleware as the SINGLE source (conflict #10): the
 *    interop guard, the rate-limit gate, the `/internal/*` key gate, and the
 *    ext-authz signed-ingress gate,
 *  - scaffolds the wire surface (envelope / agent-card / JSON-RPC) the later wire
 *    group fills with `@recoder/a2a-sdk` + `@recoder/interop`,
 *  - reports truthful health.
 *
 * No `process.env` reads (config is injected). Fail-closed by construction: an
 * absent gate → every edge denies; an unwired ingress verifier → hostile ingress
 * is rejected, never admitted.
 */
import { Router, type RequestHandler } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import { sendSuccess, asyncHandler } from '../../shared/errors.js';
import type { RateLimitConfig } from '../../a2a/rate-limiter.service.js';
import type { InteropConfig } from './config.js';
import { sliceInteropConfig } from './config.js';
import type { InteropChain } from './ports/interop-chain.port.js';
import { createInteropChain } from './gate/interop-chain.service.js';
import { interopGuard, type InteropGuardOptions } from './middleware/interop.middleware.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.middleware.js';
import { internalServiceGuard } from './middleware/internal-key.middleware.js';
import { extAuthzGuard } from './middleware/ext-authz.middleware.js';
import { createSignedIngressGate, type SignedIngressGate } from './wire/signed-ingress.gate.js';
import { createEnvelopeService, type EnvelopeService } from './wire/a2a-envelope.service.js';
import {
  createAgentCardService,
  type AgentCardService,
  type LocalCardInput,
} from './wire/agent-card.service.js';
import { createA2AJsonRpcServer, type A2AJsonRpcServer } from './wire/a2a-jsonrpc-server.js';
import { buildInteropHealth } from './health.js';
import type { InteropModule, InteropModuleDeps, RateLimitSurface } from './index.js';

export class InteropComposer implements InteropModule {
  readonly name = 'interop' as const;

  private readonly log: Logger;
  private readonly cfg: InteropConfig;
  private readonly interopChain: InteropChain;
  private readonly gateWired: boolean;
  private readonly ingressGate: SignedIngressGate;
  private readonly ingressVerifierWired: boolean;
  private readonly envelopeService: EnvelopeService;
  private readonly agentCardService: AgentCardService;
  private readonly jsonRpcServer: A2AJsonRpcServer;

  constructor(deps: InteropModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceInteropConfig(deps.config, deps.overrides ?? {});

    // Conflict #1: ONE chain, calling governance's gate (never a duplicate gate).
    this.gateWired = deps.gate !== undefined;
    this.interopChain = createInteropChain({
      ...(deps.gate ? { gate: deps.gate } : {}),
      logger: this.log,
    });

    // Hostile-by-default ingress gate. Unwired verifier → fail-closed deny.
    this.ingressVerifierWired = deps.ingressVerifier !== undefined;
    this.ingressGate = createSignedIngressGate(
      {
        requireSigned: this.cfg.requireSignedIngress,
        hmacSecret: this.cfg.hmacSecret,
        allowInsecure: this.cfg.allowInsecureIngress,
      },
      deps.ingressVerifier,
    );

    // Wire skeletons (filled by the wire group). Stable surfaces for the composer.
    this.envelopeService = createEnvelopeService();
    const card: LocalCardInput = deps.localCard ?? {
      id: deps.config.runtime.instanceId,
      name: deps.config.runtime.serviceName,
      capabilities: [],
      version: '1',
    };
    this.agentCardService = createAgentCardService(card);
    this.jsonRpcServer = createA2AJsonRpcServer();
  }

  chain(): InteropChain {
    return this.interopChain;
  }

  /** The interop guard the edge/route table wraps around every domain router. */
  guard(options: InteropGuardOptions = {}): RequestHandler {
    return interopGuard(this.interopChain, { logger: this.log, ...options });
  }

  /** The rate-limit gate for a surface (`edge` / `mcp` / `connector`). */
  rateLimit(surface: RateLimitSurface): RequestHandler {
    const bucket = this.cfg.rateLimit[surface];
    const config: RateLimitConfig = {
      maxRequests: bucket.maxRequests,
      windowMs: bucket.windowMs,
      maxConcurrent: bucket.maxConcurrent,
    };
    return createRateLimitMiddleware({ config, logger: this.log });
  }

  /** The single `/internal/*` key gate (constant-time; fail-closed). */
  internalKeyGuard(): RequestHandler {
    return internalServiceGuard({ internalServiceKey: this.cfg.internalServiceKey });
  }

  /** The ext-authz gate for untrusted A2A / connector ingress (fail-closed). */
  extAuthzGuard(): RequestHandler {
    return extAuthzGuard({ gate: this.ingressGate, logger: this.log });
  }

  signedIngress(): SignedIngressGate {
    return this.ingressGate;
  }

  envelope(): EnvelopeService {
    return this.envelopeService;
  }

  agentCard(): AgentCardService {
    return this.agentCardService;
  }

  jsonRpc(): A2AJsonRpcServer {
    return this.jsonRpcServer;
  }

  /** The `/api/a2a` router: health + agent-card + the ext-authz-guarded RPC edge. */
  routes(): Router {
    const router = Router();

    router.get('/health', (_req, res) => sendSuccess(res, this.health()));

    // Public capability advertisement — this instance's local agent-card.
    router.get('/agent-card', (_req, res) =>
      sendSuccess(res, { card: this.agentCardService.getLocalAgentCard() }),
    );

    // A2A JSON-RPC edge. Hostile ingress: guarded by the fail-closed ext-authz
    // gate (denies until a real signed-ingress verifier is wired), then the
    // JSON-RPC dispatcher returns a spec error for any not-yet-wired method.
    router.post(
      '/rpc',
      this.extAuthzGuard(),
      asyncHandler(async (req, res) => {
        const response = await this.jsonRpcServer.handleA2ARpc(req.body);
        sendSuccess(res, response);
      }),
    );

    return router;
  }

  health(): ComponentHealth {
    return buildInteropHealth({
      gateWired: this.gateWired,
      ingressVerifierWired: this.ingressVerifierWired,
      config: this.cfg,
    });
  }

  async start(): Promise<void> {
    this.log.info(
      {
        gateWired: this.gateWired,
        signingMode: this.cfg.signingMode,
        requireSignedIngress: this.cfg.requireSignedIngress,
      },
      'interop module started',
    );
  }

  async stop(): Promise<void> {
    // Idempotent, degrade-safe: nothing owned here to drain.
  }
}
