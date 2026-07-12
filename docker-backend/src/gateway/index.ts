/**
 * @module gateway
 *
 * Public surface of the BYOK LLM Gateway skin over `crates/tensorzero`
 * (RECODER-ENGINES E15). All model + embedding calls route through the
 * `LlmGatewayPort`; when no gateway endpoint is configured the client degrades
 * safely so callers fall back to a direct BYOK provider / pi-ai.
 */

export {
  createTensorzeroGatewayClient,
  resolveGatewayEndpoint,
  TENSORZERO_URL_ENV,
  TENSORZERO_GATEWAY_URL_ENV,
  TENSORZERO_GATEWAY_API_KEY_ENV,
} from './tensorzero-client.js';

export type {
  LlmGatewayPort,
  GatewayClientOptions,
  GatewayCompletionRequest,
  GatewayCompletionResult,
  GatewayEmbeddingRequest,
  GatewayEmbeddingResult,
  GatewayMessage,
  GatewayHealth,
  FetchLike,
} from './tensorzero-client.js';

export { createGatewayRouter } from './gateway.routes.js';
export type { GatewayRouterDeps } from './gateway.routes.js';
