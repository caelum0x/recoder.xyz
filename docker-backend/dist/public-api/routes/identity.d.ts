/**
 * Identity API Routes
 *
 * Endpoints for identity token management:
 * - POST /v1/identity/token  - Generate an identity token (requires API key)
 * - POST /v1/identity/verify - Verify an identity token (requires app key)
 * - GET  /v1/identity/tokens - List active identity tokens (requires API key)
 * - DELETE /v1/identity/tokens/:id - Revoke an identity token (requires API key)
 */
import type { VerifiedAgentInfo } from '../types.js';
/**
 * Set the user info provider function
 */
export declare function setUserInfoProvider(provider: (userId: string) => Promise<VerifiedAgentInfo | null>): void;
declare const router: import("express-ws").Router;
export { router as identityRouter };
