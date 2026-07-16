/**
 * A2A wire routes — the public interop edge:
 *
 *   GET  /health                truthful wire status (503 when fail-closed `down`)
 *   GET  /agent-card            this instance's local capability advertisement
 *   POST /rpc                   the A2A JSON-RPC 2.0 dispatcher (message/send, …)
 *   POST /ingress               admit ONE untrusted signed envelope (fail-closed)
 *
 * The `/rpc` + `/ingress` edges are HOSTILE-BY-DEFAULT: `/ingress` runs the frozen
 * signed-ingress transport (a forged/expired/unsigned-when-required envelope is a
 * truthful non-200, never admitted); `/rpc` returns a spec JSON-RPC error for any
 * not-wired method. Bootstrap MAY additionally front these with the interop
 * domain's ext-authz + rate-limit middleware at mount time.
 */
import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../../../shared/errors.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import type { A2ATransport } from '../ports/a2a-transport.port.js';
import type { AgentCardService } from '../wire/agent-card.service.js';
import type { A2AJsonRpcServer } from '../wire/a2a-jsonrpc-server.js';

export interface A2ARouterDeps {
  readonly transport: A2ATransport;
  readonly agentCard: AgentCardService;
  readonly jsonRpc: A2AJsonRpcServer;
  /** Fresh truthful wire health (the frozen module's `health()`). */
  readonly health: () => ComponentHealth;
}

/** Build the `/api/a2a` wire router. */
export function buildA2ARoutes(deps: A2ARouterDeps): Router {
  const router = Router();
  const { transport, agentCard, jsonRpc, health } = deps;

  // Truthful wire status: a fail-closed posture (signing required, no secret ⇒
  // every ingress rejected) reports `down` at HTTP 503 — never a faked `up`.
  router.get('/health', (_req, res) => {
    const report = health();
    sendSuccess(
      res,
      { health: report, methods: jsonRpc.methods() },
      { statusCode: report.status === 'down' ? 503 : 200 },
    );
  });

  router.get('/agent-card', (_req, res) => {
    sendSuccess(res, { card: agentCard.getLocalAgentCard(), methods: jsonRpc.methods() });
  });

  router.post(
    '/rpc',
    asyncHandler(async (req, res) => {
      const response = await jsonRpc.handleA2ARpc(req.body);
      // JSON-RPC carries its own error object; the envelope stays 200 at the HTTP layer.
      sendSuccess(res, response);
    }),
  );

  router.post(
    '/ingress',
    asyncHandler(async (req, res) => {
      const result = await transport.ingressEnvelope(req.body);
      // Reflect the fail-closed status truthfully (200 only on a verified admit).
      sendSuccess(res, result, { statusCode: result.admitted ? 200 : result.status });
    }),
  );

  return router;
}
