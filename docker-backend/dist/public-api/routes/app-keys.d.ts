/**
 * App Key Management Routes
 *
 * Endpoints for third-party developers to manage their app keys:
 * - POST   /v1/app-keys     - Create an app key
 * - GET    /v1/app-keys     - List app keys
 * - GET    /v1/app-keys/:id - Get app key details
 * - DELETE /v1/app-keys/:id - Revoke an app key
 * - PATCH  /v1/app-keys/:id - Update app key
 */
declare const router: import("express-ws").Router;
export { router as appKeysRouter };
