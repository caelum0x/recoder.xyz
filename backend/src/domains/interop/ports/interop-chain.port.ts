/**
 * `InteropChain` — the EDGE seam: `authorize → risk → policy → audit`. Every
 * HTTP route + MCP tool call passes this before the handler runs. Fail-closed.
 *
 * CONFLICT #1 RESOLUTION: the contract is DECLARED once in the governance domain
 * (`domains/governance/ports/interop.port.ts`, since the chain calls the gate +
 * audit chain), and IMPLEMENTED once here in the interop domain
 * (`gate/interop-chain.service.ts`). This port file re-exports the frozen
 * governance contract so interop-domain consumers (wire, middleware, routes,
 * MCP) import it from their own domain without reaching into governance — there
 * is exactly ONE `InteropChain` type and ONE impl.
 */
export type {
  InteropChain,
  InteropContext,
  InteropDecision,
  InteropRejectionStage,
} from '../../governance/ports/interop.port.js';
