/**
 * routes barrel — memory + retrieval HTTP edges (mount under `/api/agent-os`).
 */
export { buildMemoryRouter } from './memory.routes.js';
export type { MemoryRouterDeps } from './memory.routes.js';
export { buildRetrievalRouter } from './retrieval.routes.js';
export type { RetrievalRouterDeps } from './retrieval.routes.js';
