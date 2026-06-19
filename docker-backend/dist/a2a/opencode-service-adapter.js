"use strict";
/**
 * @module opencode-service-adapter
 *
 * Adapter that connects docker-backend to an opencode HTTP service.
 *
 * Two modes:
 *   1. Centralized: opencode runs as a shared service (e.g. docker container
 *      alongside docker-backend). All projects share one server, each gets
 *      its own session. Set OPENCODE_SERVICE_URL env var.
 *
 *   2. Per-sandbox: opencode runs inside each Daytona sandbox. docker-backend
 *      starts it on demand and talks to it through the sandbox exec proxy.
 *      This is the legacy path (opencode-connector.service.ts).
 *
 * This file implements mode 1 — the "opencode as a backend service" path
 * that Recoder Spaces, recoder-agents, and the A2A layer all converge on.
 *
 * Uses the shared @recoder/shared/opencode-client for the HTTP transport
 * so the implementation stays in sync across packages.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetClient = resetClient;
exports.getOrCreateSession = getOrCreateSession;
exports.promptProject = promptProject;
exports.abortProject = abortProject;
exports.getProjectDiff = getProjectDiff;
exports.getProjectMessages = getProjectMessages;
exports.shellInProject = shellInProject;
exports.setProviderKey = setProviderKey;
exports.disposeProjectSession = disposeProjectSession;
exports.isServiceHealthy = isServiceHealthy;
exports.getActiveProjects = getActiveProjects;
exports.clearProjectSessions = clearProjectSessions;
const opencode_client_1 = require("@recoder/shared/opencode-client");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('opencode-service');
// ── Shared client singleton ─────────────────────────────────────────
let _client;
function getServiceUrl() {
    return process.env.OPENCODE_SERVICE_URL || 'http://localhost:4096';
}
function getClient() {
    if (!_client) {
        _client = (0, opencode_client_1.createRecoderOpencodeClient)({
            baseUrl: getServiceUrl(),
            password: process.env.OPENCODE_SERVER_PASSWORD,
            username: process.env.OPENCODE_SERVER_USERNAME,
        });
    }
    return _client;
}
/** Reset client (for tests or config changes). */
function resetClient() {
    _client = undefined;
}
// ── Session management (per projectId) ──────────────────────────────
/** Map projectId → opencode sessionID */
const projectSessions = new Map();
/**
 * Get or create an opencode session for a project.
 */
async function getOrCreateSession(projectId, opts) {
    const client = getClient();
    const existingId = projectSessions.get(projectId);
    if (existingId) {
        try {
            return await client.getSession(existingId, opts?.directory);
        }
        catch {
            projectSessions.delete(projectId);
        }
    }
    const session = await client.createSession({
        directory: opts?.directory ?? '/workspace',
        title: opts?.title ?? `Recoder project ${projectId}`,
    });
    projectSessions.set(projectId, session.id);
    logger.info({ projectId, sessionId: session.id }, 'Created opencode session');
    return session;
}
/**
 * Send a prompt to the project's opencode session.
 */
async function promptProject(projectId, input, opts) {
    const session = await getOrCreateSession(projectId, { directory: opts?.directory });
    const client = getClient();
    logger.info({ projectId, sessionId: session.id, agent: input.agent }, 'Sending prompt');
    const result = await client.prompt(session.id, input, opts?.directory);
    logger.info({ projectId, sessionId: session.id, messageId: result.info.id }, 'Prompt completed');
    return result;
}
/**
 * Abort the project's active session.
 */
async function abortProject(projectId) {
    const sessionId = projectSessions.get(projectId);
    if (!sessionId)
        return false;
    return getClient().abortSession(sessionId);
}
/**
 * Get file diff from a specific message.
 */
async function getProjectDiff(projectId, messageID) {
    const sessionId = projectSessions.get(projectId);
    if (!sessionId)
        return [];
    return getClient().getDiff(sessionId, messageID);
}
/**
 * Get messages from the project session.
 */
async function getProjectMessages(projectId) {
    const sessionId = projectSessions.get(projectId);
    if (!sessionId)
        return [];
    return getClient().getMessages(sessionId);
}
/**
 * Run shell command in the session context.
 */
async function shellInProject(projectId, command) {
    const sessionId = projectSessions.get(projectId);
    if (!sessionId)
        throw new Error(`No opencode session for project ${projectId}`);
    return getClient().shell(sessionId, { command });
}
/**
 * Set BYOK provider credentials.
 */
async function setProviderKey(providerID, token) {
    return getClient().setAuth(providerID, { type: 'api_key', token });
}
/**
 * Dispose a project session.
 */
async function disposeProjectSession(projectId) {
    const sessionId = projectSessions.get(projectId);
    if (!sessionId)
        return;
    try {
        await getClient().deleteSession(sessionId);
    }
    catch { /* best effort */ }
    projectSessions.delete(projectId);
    logger.info({ projectId }, 'Disposed opencode session');
}
/**
 * Check if the opencode service is reachable.
 */
async function isServiceHealthy() {
    return getClient().ping();
}
/**
 * Get all active project → session mappings.
 */
function getActiveProjects() {
    return Array.from(projectSessions.entries()).map(([projectId, sessionId]) => ({ projectId, sessionId }));
}
/**
 * Clear the project → session map (for tests).
 */
function clearProjectSessions() {
    projectSessions.clear();
}
