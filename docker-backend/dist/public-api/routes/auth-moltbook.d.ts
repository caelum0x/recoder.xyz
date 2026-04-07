/**
 * Moltbook Authentication Routes
 *
 * Endpoints for authenticating with Moltbook identity:
 * - POST /v1/auth/moltbook - Authenticate with a Moltbook identity token
 * - GET  /v1/auth/moltbook/status - Check if agent has linked account
 */
declare const router: import("express-ws").Router;
export { router as moltbookAuthRouter };
