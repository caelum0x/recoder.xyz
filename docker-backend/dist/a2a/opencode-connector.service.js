"use strict";
/**
 * @module opencode-connector
 *
 * Sandbox-local OpenCode runtime modeled after Daytona's official examples:
 * - install and run OpenCode inside the Daytona sandbox
 * - wait for "opencode server listening" in session logs
 * - attach over the sandbox preview URL
 * - keep one durable OpenCode session per Recoder project
 *
 * This avoids the unstable shared recoder-opencode service and removes the
 * need to mirror file changes back into Daytona, because OpenCode edits the
 * same sandbox workspace the preview is already serving from.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSession = startSession;
exports.sendPrompt = sendPrompt;
exports.getSession = getSession;
exports.disposeSession = disposeSession;
exports.listSessions = listSessions;
const opencode_client_1 = require("@recoder/shared/opencode-client");
const logger_1 = require("../logger");
const daytona_client_js_1 = require("../daytona-client.js");
const daytona_preview_js_1 = require("../daytona-preview.js");
const logger = (0, logger_1.createLogger)('opencode-connector');
const SERVER_PORT = 4096;
const SERVER_HOSTNAME = '0.0.0.0';
const SERVER_READY_LINE = 'opencode server listening';
const OPENCODE_PACKAGE = 'opencode-ai@1.1.1';
const USER_NPM_PREFIX = '$HOME/.npm-global';
const activeSessions = new Map();
function injectEnvVar(name, content) {
    const base64 = Buffer.from(content, 'utf8').toString('base64');
    return `${name}=$(echo '${base64}' | base64 -d)`;
}
function buildProviderEnv(providerKeys) {
    if (!providerKeys) {
        return '';
    }
    const envs = [];
    if (providerKeys.openrouter)
        envs.push(`OPENROUTER_API_KEY=${JSON.stringify(providerKeys.openrouter)}`);
    if (providerKeys.openai)
        envs.push(`OPENAI_API_KEY=${JSON.stringify(providerKeys.openai)}`);
    if (providerKeys.anthropic)
        envs.push(`ANTHROPIC_API_KEY=${JSON.stringify(providerKeys.anthropic)}`);
    const google = providerKeys.google || providerKeys.gemini;
    if (google) {
        envs.push(`GOOGLE_API_KEY=${JSON.stringify(google)}`);
        envs.push(`GEMINI_API_KEY=${JSON.stringify(google)}`);
    }
    return envs.join('; ');
}
function buildUserNpmBootstrap() {
    return [
        `export NPM_CONFIG_PREFIX=${USER_NPM_PREFIX}`,
        'export PATH="$HOME/.npm-global/bin:$PATH"',
        'mkdir -p "$HOME/.npm-global/bin"',
    ].join('; ');
}
function inferProviderFromModel(model) {
    const normalized = model?.trim().toLowerCase();
    if (!normalized)
        return undefined;
    if (normalized.startsWith('openrouter/'))
        return 'openrouter';
    if (normalized.startsWith('openai/'))
        return 'openai';
    if (normalized.startsWith('anthropic/'))
        return 'anthropic';
    if (normalized.startsWith('google/') || normalized.startsWith('gemini/'))
        return 'google';
    return undefined;
}
function buildProviderKeys(params) {
    if (!params.apiKey)
        return undefined;
    const provider = params.provider?.trim().toLowerCase() || inferProviderFromModel(params.model);
    if (!provider)
        return undefined;
    if (provider === 'gemini') {
        return { google: params.apiKey };
    }
    return { [provider]: params.apiKey };
}
function buildSandboxAwareConfig(workDir, previewUrlPattern) {
    const prompt = [
        'You are running in a Daytona sandbox.',
        `Use the ${workDir} directory for file operations.`,
        'You are working inside an existing project workspace, not a blank folder.',
        'Before creating new files, inspect the existing project structure and prefer editing existing entry files.',
        'If a Vite or React app already exists, update src/App.tsx, src/main.tsx, src/index.css, and package.json as needed instead of creating a standalone HTML file.',
        'Do not create /home/daytona/index.html or other parallel one-off app files when the project already has framework entrypoints.',
        `When running services on localhost, they will be accessible as: ${previewUrlPattern}`,
        'When starting a server, always give the user the preview URL to access it.',
        'When starting a server, start it in the background with & so the command does not block further instructions.',
    ].join(' ');
    return JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        default_agent: 'daytona',
        agent: {
            daytona: {
                description: 'Daytona sandbox-aware coding agent',
                mode: 'primary',
                prompt,
            },
        },
    });
}
async function refreshPreviewAccess(session, force = false) {
    if (!force && session.previewAccess) {
        return session.previewAccess;
    }
    const preview = await (0, daytona_preview_js_1.getDaytonaPreviewAccess)(session.sandboxId, SERVER_PORT, { preferSigned: false });
    session.previewAccess = preview;
    session.serverUrl = preview.url.replace(/\/$/, '');
    return preview;
}
function createPreviewFetch(session) {
    return async (input, init) => {
        const runFetch = async (forceRefresh = false) => {
            const headers = new Headers(init?.headers || {});
            headers.set('X-Daytona-Skip-Preview-Warning', 'true');
            headers.set('X-Daytona-Disable-CORS', 'true');
            const preview = await refreshPreviewAccess(session, forceRefresh);
            if (preview.token) {
                headers.set('X-Daytona-Preview-Token', preview.token);
            }
            return fetch(input, {
                ...init,
                headers,
            });
        };
        const response = await runFetch(false);
        if (response.status !== 401 && response.status !== 403) {
            return response;
        }
        return runFetch(true);
    };
}
async function waitForServerReady(session, maxWaitMs = 180_000) {
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const startedAt = Date.now();
    const previewFetch = createPreviewFetch(session);
    const healthUrl = `${session.serverUrl.replace(/\/$/, '')}/path`;
    while (Date.now() - startedAt < maxWaitMs) {
        const logs = await dc.getSessionLogs(session.sandboxId, session.serverSessionId, session.serverCommandId);
        if (logs.includes(SERVER_READY_LINE)) {
            return;
        }
        if (/Unexpected error|panic|segmentation fault/i.test(logs)) {
            throw new Error(`Sandbox-local OpenCode server crashed during startup: ${logs.slice(-500)}`);
        }
        try {
            const response = await previewFetch(healthUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(5_000),
            });
            if (response.ok) {
                return;
            }
        }
        catch {
            // Ignore until the server is listening.
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Sandbox-local OpenCode server failed to start within ${Math.ceil(maxWaitMs / 1000)}s`);
}
async function createDurableOpencodeSession(session) {
    const client = (0, opencode_client_1.createRecoderOpencodeClient)({
        baseUrl: session.serverUrl,
        timeout: 120_000,
        fetchFn: createPreviewFetch(session),
    });
    const created = await client.createSession({
        directory: session.workDir,
        title: `Recoder project ${session.projectId}`,
    });
    session.opencodeSessionId = created.id;
}
function shouldRecreateOpencodeSession(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /failed \((401|403|404|502)\)|Unauthorized|Forbidden|session.*not found|Bad Gateway|ECONNRESET|ECONNREFUSED/i.test(message);
}
async function startSession(params) {
    const existing = activeSessions.get(params.projectId);
    if (existing?.status === 'ready') {
        return existing;
    }
    const dc = (0, daytona_client_js_1.getDaytonaClient)();
    const workDir = await dc.getWorkDir(params.sandboxId);
    const previewPattern = dc.getPreviewUrl(params.sandboxId, 1234).replace('1234-', '{PORT}-');
    const configJson = buildSandboxAwareConfig(workDir, previewPattern);
    const serverSessionId = `opencode-serve-${params.projectId}`;
    const providerKeys = buildProviderKeys(params);
    const session = {
        id: `oc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        projectId: params.projectId,
        sandboxId: params.sandboxId,
        serverUrl: '',
        createdAt: new Date().toISOString(),
        status: 'starting',
        workDir,
        serverSessionId,
        model: params.model,
        providerKeys,
    };
    activeSessions.set(params.projectId, session);
    try {
        const installResult = await dc.execCommand(params.sandboxId, `${buildUserNpmBootstrap()}; command -v opencode >/dev/null 2>&1 || npm install -g ${OPENCODE_PACKAGE}`, { cwd: workDir, timeoutSecs: 180 });
        if (installResult.exitCode !== 0) {
            throw new Error(`OpenCode install failed: ${installResult.output.slice(-1000)}`);
        }
        await dc.deleteSession(params.sandboxId, serverSessionId);
        await dc.createSession(params.sandboxId, serverSessionId);
        const envVar = injectEnvVar('OPENCODE_CONFIG_CONTENT', configJson);
        const providerEnv = buildProviderEnv(providerKeys);
        const serverCommand = await dc.execInSession(params.sandboxId, serverSessionId, `${buildUserNpmBootstrap()}; ${providerEnv ? `${providerEnv}; ` : ''}${envVar} opencode serve --port ${SERVER_PORT} --hostname ${SERVER_HOSTNAME}`, { runAsync: true });
        session.serverCommandId = serverCommand.cmdId;
        await refreshPreviewAccess(session, true);
        await waitForServerReady(session);
        await createDurableOpencodeSession(session);
        session.status = 'ready';
        activeSessions.set(params.projectId, session);
        logger.info({ projectId: params.projectId, sandboxId: params.sandboxId, serverUrl: session.serverUrl, opencodeSessionId: session.opencodeSessionId }, 'Sandbox-local OpenCode session started');
        return session;
    }
    catch (err) {
        session.status = 'disposed';
        activeSessions.delete(params.projectId);
        logger.error({ err, projectId: params.projectId }, 'Failed to start sandbox-local OpenCode session');
        throw err;
    }
}
async function sendPrompt(params) {
    const session = activeSessions.get(params.projectId);
    if (!session || session.status !== 'ready' || !session.opencodeSessionId) {
        throw new Error(`No ready OpenCode session for project ${params.projectId}`);
    }
    session.status = 'busy';
    session.lastPromptAt = new Date().toISOString();
    try {
        const promptInput = {
            content: params.prompt,
            ...(params.agent ? { agent: params.agent } : {}),
            ...(session.model?.includes('/') ? {
                providerID: session.model.slice(0, session.model.indexOf('/')),
                modelID: session.model.slice(session.model.indexOf('/') + 1),
            } : {}),
        };
        const runPrompt = async () => {
            const client = (0, opencode_client_1.createRecoderOpencodeClient)({
                baseUrl: session.serverUrl,
                timeout: 300_000,
                fetchFn: createPreviewFetch(session),
            });
            return client.prompt(session.opencodeSessionId, promptInput, session.workDir);
        };
        let response;
        try {
            response = await runPrompt();
        }
        catch (err) {
            if (!shouldRecreateOpencodeSession(err)) {
                throw err;
            }
            logger.warn({ err, projectId: params.projectId }, 'Sandbox-local OpenCode prompt failed; recreating session and retrying once');
            await refreshPreviewAccess(session, true);
            await createDurableOpencodeSession(session);
            response = await runPrompt();
        }
        const parts = (response.parts ?? []).map((part) => {
            const record = part;
            return {
                type: part.type || 'text',
                content: String(record.text ?? record.output ?? record.content ?? ''),
                metadata: record,
            };
        });
        session.status = 'ready';
        return {
            messageId: response.info?.id ?? `msg_${Date.now()}`,
            parts,
        };
    }
    catch (err) {
        session.status = 'ready';
        logger.error({ err, projectId: params.projectId }, 'Sandbox-local OpenCode prompt failed');
        throw err;
    }
}
function getSession(projectId) {
    return activeSessions.get(projectId);
}
async function disposeSession(params) {
    const session = activeSessions.get(params.projectId);
    if (!session)
        return;
    try {
        if (session.opencodeSessionId) {
            const client = (0, opencode_client_1.createRecoderOpencodeClient)({
                baseUrl: session.serverUrl,
                timeout: 30_000,
                fetchFn: createPreviewFetch(session),
            });
            await client.deleteSession(session.opencodeSessionId).catch(() => { });
        }
    }
    catch {
        // best effort
    }
    try {
        const dc = (0, daytona_client_js_1.getDaytonaClient)();
        await dc.deleteSession(session.sandboxId, session.serverSessionId);
    }
    catch {
        // best effort
    }
    activeSessions.delete(params.projectId);
    logger.info({ projectId: params.projectId }, 'Sandbox-local OpenCode session disposed');
}
function listSessions() {
    return Array.from(activeSessions.values());
}
