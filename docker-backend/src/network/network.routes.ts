/**
 * network.routes.ts — the Recoder Envoy control-plane HTTP surface (IO adapter).
 *
 * The pure subsystem (config generation, the authz decision, the XDR pipeline)
 * lives in @recoder/network. This file is the thin docker-backend adapter that
 * exposes it over Express and injects the concrete governance-backed ports.
 *
 * Two router groups are exported (signatures unchanged so server.ts is untouched):
 *
 *  1. createNetworkRouter()      -> mounted at /api/network
 *       GET  /envoy-config       : the generated, deployable Envoy bootstrap
 *       GET  /detections         : recent XDR detections
 *       GET  /health             : subsystem health (config valid + chain intact)
 *
 *  2. createNetworkInternalRouter() -> mounted at /internal/network
 *       POST /authz              : the Envoy ext_authz HTTP contract endpoint.
 *                                  200 => allow, 403 => deny. Default-deny.
 *
 * The internal router speaks the raw ext_authz status contract (NOT the JSON
 * envelope) because Envoy enforces on HTTP status. The public router uses the
 * standard {success,data} envelope.
 */
import { Router, type Request, type Response } from 'express';
import {
  generateEnvoyConfig,
  emitYaml,
  emitJson,
  defaultNetworkConfig,
  decideNetworkAuthz,
  extractAuthzRequest,
  DECISION_HEADER,
  type NetworkConfig,
} from '@recoder/network';
import { governancePolicyAdvisor } from './governance-ports.js';
import { getXdrSink } from './xdr-sink.js';

export interface NetworkRouterOptions {
  /** Override the config used by /envoy-config + /health (defaults to env). */
  readonly config?: NetworkConfig;
}

function resolveConfig(options?: NetworkRouterOptions): NetworkConfig {
  return options?.config ?? defaultNetworkConfig();
}

/** Public, authenticated control-plane router for /api/network. */
export function createNetworkRouter(options?: NetworkRouterOptions): Router {
  const router = Router();

  router.get('/envoy-config', (req: Request, res: Response) => {
    const config = resolveConfig(options);
    const bootstrap = generateEnvoyConfig(config);
    const format = String(req.query.format ?? 'json').toLowerCase();

    if (format === 'yaml') {
      res.type('text/yaml').send(emitYaml(bootstrap));
      return;
    }

    res.json({
      success: true,
      data: {
        format: 'json',
        bootstrap,
        yaml: emitYaml(bootstrap),
        raw: emitJson(bootstrap),
      },
    });
  });

  router.get('/detections', (req: Request, res: Response) => {
    const limitRaw = Number(req.query.limit ?? '100');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 100;
    const sink = getXdrSink();
    res.json({
      success: true,
      data: {
        detections: sink.recent(limit),
        auditTip: sink.auditTip(),
        chain: sink.verifyChain(),
      },
    });
  });

  router.get('/health', (_req: Request, res: Response) => {
    const config = resolveConfig(options);
    let configOk = false;
    let configError: string | undefined;
    try {
      const bootstrap = generateEnvoyConfig(config);
      // A valid config has a TLS listener, the ext_authz filter, and clusters.
      const json = emitJson(bootstrap);
      configOk =
        json.includes('ext_authz') &&
        json.includes('DownstreamTlsContext') &&
        config.upstreams.length > 0;
    } catch (error: unknown) {
      configError = error instanceof Error ? error.message : 'unknown error';
    }

    const sink = getXdrSink();
    const chain = sink.verifyChain();

    res.json({
      success: true,
      data: {
        status: configOk && chain.ok ? 'healthy' : 'degraded',
        envoyConfig: { ok: configOk, error: configError, upstreams: config.upstreams.length },
        xdr: {
          chainIntact: chain.ok,
          auditTip: sink.auditTip(),
          retainedDetections: sink.all().length,
        },
        failClosed: config.extAuthz.failureModeAllow === false,
      },
    });
  });

  return router;
}

/**
 * Internal router for the Envoy ext_authz callback. Mounted under
 * /internal/network. The data plane POSTs the inbound request here and enforces
 * the returned HTTP status (200 allow / 403 deny).
 */
export function createNetworkInternalRouter(): Router {
  const router = Router();

  router.post('/authz', (req: Request, res: Response) => {
    const authzReq = extractAuthzRequest({
      method: req.method,
      headers: req.headers as Record<string, string | string[] | undefined>,
      originalPath: req.originalUrl,
      ip: req.ip,
    });

    const decision = decideNetworkAuthz(authzReq, governancePolicyAdvisor);

    res.setHeader(DECISION_HEADER, decision.decisionId);
    // The ext_authz HTTP contract enforces on status code. We also return a tiny
    // body for human debugging; Envoy ignores it on allow and may forward it on
    // deny depending on filter config.
    res.status(decision.status).json({
      effect: decision.effect,
      reason: decision.reason,
      decisionId: decision.decisionId,
    });
  });

  return router;
}
