/**
 * OpenClaw API Keys Route
 *
 * Manages API keys for OpenClaw integration.
 * Each OpenClaw user (identified by channel + userId) gets a unique Recoder API key.
 *
 * This allows OpenClaw agents (WhatsApp, Telegram, Discord bots) to automatically
 * provision API keys for code generation and sandbox management.
 */
declare const router: import("express-ws").Router;
export default router;
