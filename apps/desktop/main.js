const { app, BrowserWindow, clipboard, nativeImage, Menu, Tray, ipcMain, dialog, shell, globalShortcut, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ============================================================================
// IPC Rate Limiter — token-bucket per channel
// ============================================================================
const ipcRateBuckets = new Map();

const IPC_RATE_LIMITS = {
  'fs:readFile': { rate: 30, interval: 1000 },
  'fs:writeFile': { rate: 30, interval: 1000 },
  'fs:readDir': { rate: 30, interval: 1000 },
  'fs:exists': { rate: 30, interval: 1000 },
  'fs:stat': { rate: 30, interval: 1000 },
  'dialog:openFile': { rate: 5, interval: 1000 },
  'dialog:openFolder': { rate: 5, interval: 1000 },
  'dialog:saveFile': { rate: 5, interval: 1000 },
  'terminal:spawn': { rate: 5, interval: 1000 },
  'terminal:write': { rate: 60, interval: 1000 },
  'terminal:resize': { rate: 10, interval: 1000 },
  'terminal:kill': { rate: 10, interval: 1000 },
  'agent:delegateTask': { rate: 5, interval: 1000 },
  'a2a:createTask': { rate: 5, interval: 1000 },
};

function checkIpcRateLimit(channel) {
  const limit = IPC_RATE_LIMITS[channel];
  if (!limit) return true; // no limit configured — allow
  const now = Date.now();
  let bucket = ipcRateBuckets.get(channel);
  if (!bucket) {
    bucket = { tokens: limit.rate, lastRefill: now };
    ipcRateBuckets.set(channel, bucket);
  }
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= limit.interval) {
    bucket.tokens = limit.rate;
    bucket.lastRefill = now;
  }
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }
  return false;
}

// Wrap ipcMain.handle with rate limiting
const originalIpcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function rateLimitedHandle(channel, handler) {
  return originalIpcHandle(channel, async (event, ...args) => {
    if (!checkIpcRateLimit(channel)) {
      const msg = `IPC rate limit exceeded for channel: ${channel}`;
      console.warn(`[rate-limit] ${msg}`);
      appendDesktopLog('rate-limit.log', `${new Date().toISOString()} ${msg}`);
      throw new Error(msg);
    }
    return handler(event, ...args);
  });
};

// ============================================================================
// Path Traversal Protection — restrict IPC file ops to safe directories
// ============================================================================
const ALLOWED_FS_BASES = [
  os.homedir(),                                      // user home
  os.tmpdir(),                                       // temp dir
  app.getPath('userData'),                            // app data
];

/**
 * Validate that a file path resolves to within an allowed base directory.
 * Prevents path traversal attacks from the renderer process.
 */
function validateFsPath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Invalid file path');
  }
  const resolved = path.resolve(filePath);
  const isAllowed = ALLOWED_FS_BASES.some(base => resolved.startsWith(base + path.sep) || resolved === base);
  if (!isAllowed) {
    const msg = `Path access denied: ${resolved} is outside allowed directories`;
    console.warn(`[fs-guard] ${msg}`);
    throw new Error('Access denied: path is outside allowed directories');
  }
  return resolved;
}

// Custom protocol scheme for deep linking
const PROTOCOL_SCHEME = 'recoder';

// Get URL from environment variable or default to production
const APP_URL = process.env.APP_URL || 'https://recoder.xyz/';

// Simple dev check without ES module dependency
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Normalize URL - ensure localhost uses http, not https
function normalizeUrl(url) {
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return url.replace(/^https:\/\//, 'http://');
  }
  return url;
}

// Check if URL is localhost
function isLocalhost(url) {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

const normalizedUrl = normalizeUrl(APP_URL);
const isLocal = isLocalhost(normalizedUrl);
const autoUpdateEnabled = process.env.DESKTOP_AUTO_UPDATE !== 'false';
const crashWebhookUrl = process.env.DESKTOP_CRASH_WEBHOOK_URL || '';
const dockerWorkflowApiUrl = process.env.DOCKER_BACKEND_URL || 'http://localhost:3100';
// Cockpit mode: load the bundled conductor cockpit renderer instead of the web app.
// Triggered by RECODER_COCKPIT=1 (env) or the "Open Cockpit" menu/tray item.
const cockpitModeEnabledByEnv = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECODER_COCKPIT || '').trim().toLowerCase(),
);
const cockpitIndexPath = path.join(__dirname, 'cockpit', 'dist', 'index.html');
const desktopWorkflowRetryRaw = process.env.RECODER_WORKFLOW_FETCH_RETRIES || process.env.OPENCLAW_WORKFLOW_FETCH_RETRIES || '2';
const desktopWorkflowMaxAttempts = Number.isFinite(Number.parseInt(desktopWorkflowRetryRaw, 10))
  && Number.parseInt(desktopWorkflowRetryRaw, 10) > 0
  ? Number.parseInt(desktopWorkflowRetryRaw, 10)
  : 2;
const desktopStrictWorkflowContract = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RECODER_WORKFLOW_STRICT_CONTRACT || process.env.OPENCLAW_WORKFLOW_STRICT_CONTRACT || '')
    .trim()
    .toLowerCase(),
);
const WORKFLOW_CONTRACT_VERSION = 'internal-agent-workflow-v1';
const PUBLIC_WORKFLOW_CONTRACT_VERSION = 'public-agent-workflow-v1';
const RECODER_A2A_PROTOCOL_VERSION = '0.3.0';
const RECODER_A2A_ENVELOPE_VERSION = '2026-02-14';
const desktopA2AAdminToken =
  process.env.RECODER_A2A_ADMIN_TOKEN
  || process.env.OPENCLAW_A2A_ADMIN_TOKEN
  || '';
const desktopA2ABridgeId =
  process.env.RECODER_A2A_BRIDGE_ID
  || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID
  || 'desktop-default';
const desktopA2AAgentId =
  process.env.RECODER_DESKTOP_AGENT_ID
  || 'recoder-desktop';

const desktopSubagentWorkflowLanes = [
  { laneId: 'A1', title: 'Core app and web runtime', paths: ['/Users/arhansubasi/recoder.xyz/app', '/Users/arhansubasi/recoder.xyz/recoder-web'] },
  { laneId: 'A2', title: 'Desktop productization', paths: ['/Users/arhansubasi/recoder.xyz/apps/desktop'] },
  { laneId: 'A3', title: 'Frontend and mobile', paths: ['/Users/arhansubasi/recoder.xyz/apps/frontend', '/Users/arhansubasi/recoder.xyz/apps/mobile'] },
  { laneId: 'A4', title: 'Studio and ui.recoder.xyz', paths: ['/Users/arhansubasi/recoder.xyz/recoder-studio', '/Users/arhansubasi/recoder.xyz/apps/ui.giselles.ai'] },
  { laneId: 'A5', title: 'Python backend', paths: ['/Users/arhansubasi/recoder.xyz/backend'] },
  { laneId: 'A6', title: 'Docker backend', paths: ['/Users/arhansubasi/recoder.xyz/docker-backend'] },
  { laneId: 'A7', title: 'OpenClaw ecosystem', paths: ['/Users/arhansubasi/recoder.xyz/openclaw'] },
  { laneId: 'A8', title: 'Shared packages', paths: ['/Users/arhansubasi/recoder.xyz/packages'] },
  { laneId: 'A9', title: 'Agency product', paths: ['/Users/arhansubasi/recoder.xyz/recoder-agency'] },
  { laneId: 'A10', title: 'PM product', paths: ['/Users/arhansubasi/recoder.xyz/recoder-pm'] },
  { laneId: 'A11', title: 'Skill system', paths: ['/Users/arhansubasi/recoder.xyz/recoder-skill'] },
  { laneId: 'A12', title: 'Tools and evals', paths: ['/Users/arhansubasi/recoder.xyz/tools'] },
];

function appendDesktopLog(fileName, line) {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, fileName), `${line}${os.EOL}`, 'utf-8');
  } catch (error) {
    console.error('Failed to write desktop log:', error);
  }
}

async function notifyCrashWebhook(payload) {
  if (!crashWebhookUrl) {
    return;
  }
  const maxRetries = 3;
  const backoffMs = [1000, 3000, 9000]; // exponential: 1s, 3s, 9s
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(crashWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return; // success
      // Server error — retry if attempts remain
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
    } catch (error) {
      if (attempt === maxRetries) {
        appendDesktopLog('errors.log', `[webhook-error] ${new Date().toISOString()} ${String(error)} (failed after ${maxRetries} retries)`);
      } else {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
    }
  }
}

function logRuntimeError(kind, error, extra = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack || '' : '';
  const payload = {
    timestamp: new Date().toISOString(),
    kind,
    message,
    stack,
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    appUrl: normalizedUrl,
    ...extra,
  };
  appendDesktopLog('errors.log', JSON.stringify(payload));
  void notifyCrashWebhook(payload);
}

function buildDesktopWorkflowFallback(payload = {}) {
  const task = typeof payload.task === 'string' && payload.task.trim().length > 0
    ? payload.task.trim()
    : 'continuous subagent development';
  const continuous = payload.continuous !== false;
  const requestedPaths = Array.isArray(payload.paths)
    ? payload.paths.filter((repoPath) => typeof repoPath === 'string' && repoPath.trim().length > 0)
    : null;

  const lanes = requestedPaths
    ? desktopSubagentWorkflowLanes.filter((lane) =>
        lane.paths.some((lanePath) =>
          requestedPaths.some((requestedPath) =>
            lanePath === requestedPath || lanePath.startsWith(`${requestedPath}/`),
          ),
        ),
      )
    : desktopSubagentWorkflowLanes;

  return {
    mode: continuous ? 'continuous' : 'single-task',
    summary: `Task: ${task} | Active lanes: ${lanes.length}`,
    lanes,
    nextActions: [
      'Run lane tasks in parallel and keep ownership strict by repo path.',
      'Run lane validation commands after implementation batches.',
      'Record evidence in plan.md after every cycle.',
    ],
  };
}

async function getCookieHeaderForUrl(targetUrl) {
  try {
    const session = BrowserWindow.getAllWindows()[0]?.webContents?.session || null;
    if (!session) {
      return '';
    }
    const cookies = await session.cookies.get({ url: targetUrl });
    if (!cookies.length) {
      return '';
    }
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  } catch {
    return '';
  }
}

function resolveDesktopRecoderApiKeyFromCache() {
  const storePath = path.join(os.homedir(), '.openclaw', 'credentials', 'recoder-api-keys.json');
  try {
    if (!fs.existsSync(storePath)) {
      return '';
    }
    const raw = fs.readFileSync(storePath, 'utf-8');

    // Try to decrypt if safeStorage is available and data looks encrypted (base64 envelope)
    let parsed;
    try {
      const envelope = JSON.parse(raw);
      if (envelope && envelope._encrypted && typeof envelope._data === 'string' && safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(envelope._data, 'base64'));
        parsed = JSON.parse(decrypted);
      } else {
        parsed = envelope;
      }
    } catch {
      parsed = JSON.parse(raw);
    }

    const keys = parsed && parsed.keys && typeof parsed.keys === 'object'
      ? Object.values(parsed.keys)
      : [];
    for (const entry of keys) {
      if (entry && typeof entry.apiKey === 'string' && entry.apiKey.trim()) {
        return entry.apiKey.trim();
      }
    }
  } catch {
    // ignore cache read errors; caller handles fallback
  }
  return '';
}

/**
 * Write API keys to disk, encrypting with safeStorage if available.
 * Falls back to plaintext if OS keychain is unavailable (e.g. headless CI).
 */
function writeDesktopRecoderApiKeyCache(keysObj) {
  const storePath = path.join(os.homedir(), '.openclaw', 'credentials', 'recoder-api-keys.json');
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const jsonStr = JSON.stringify(keysObj, null, 2);
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(jsonStr);
      const envelope = JSON.stringify({ _encrypted: true, _data: encrypted.toString('base64') });
      fs.writeFileSync(storePath, envelope, 'utf-8');
      return;
    }
  } catch (err) {
    console.warn('[safeStorage] Encryption unavailable, falling back to plaintext:', err.message);
  }
  // Fallback: plaintext
  fs.writeFileSync(storePath, jsonStr, 'utf-8');
}

function resolveDesktopRecoderApiKeyDetailed() {
  const envKey = process.env.RECODER_API_KEY || process.env.OPENCLAW_RECODER_API_KEY || '';
  if (envKey.trim()) {
    return { value: envKey.trim(), source: 'env' };
  }
  const cacheKey = resolveDesktopRecoderApiKeyFromCache();
  if (cacheKey.trim()) {
    return { value: cacheKey.trim(), source: 'cache' };
  }
  return { value: '', source: 'none' };
}

/**
 * Resolve the Better Auth session token the same way the workflow client does,
 * checking the standard desktop env vars (no new auth scheme invented).
 * @returns {{ value: string, source: 'env' | 'none' }}
 */
function resolveDesktopSessionTokenDetailed() {
  const token =
    process.env.RECODER_SESSION_TOKEN
    || process.env.OPENCLAW_RECODER_SESSION_TOKEN
    || process.env.SESSION_TOKEN
    || '';
  if (token.trim()) {
    return { value: token.trim(), source: 'env' };
  }
  return { value: '', source: 'none' };
}

/**
 * The Better Auth session-token cookie names the backend accepts, in priority
 * order. This mirrors getSessionTokenFromRequest() in
 * docker-backend/src/server.ts so the cockpit reuses the SAME session the web
 * app established — no new auth scheme is invented here.
 */
const BETTER_AUTH_SESSION_COOKIE_NAMES = [
  '__Secure-recoder.session_token',
  'recoder.session_token',
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Secure-session_token',
  'recoder_session_token',
  'session_token',
];

/**
 * Resolve the Better Auth session token from the Electron session cookies for
 * the recoder.xyz origin. After the user signs in through the existing web auth
 * flow, Better Auth sets this cookie; the backend accepts its value as a Bearer
 * token. This is how a logged-in web session is handed to the cockpit.
 * @returns {Promise<{ value: string, source: 'cookie' | 'none' }>}
 */
async function resolveDesktopSessionTokenFromCookies() {
  try {
    const session = BrowserWindow.getAllWindows()[0]?.webContents?.session || null;
    if (!session) {
      return { value: '', source: 'none' };
    }
    const cookies = await session.cookies.get({ url: normalizedUrl });
    for (const name of BETTER_AUTH_SESSION_COOKIE_NAMES) {
      const match = cookies.find((cookie) => cookie.name === name && cookie.value && cookie.value.trim());
      if (match) {
        return { value: match.value.trim(), source: 'cookie' };
      }
    }
  } catch {
    // Cookie store unavailable (e.g. window not ready) — fall through to none.
  }
  return { value: '', source: 'none' };
}

/**
 * Build the config object injected into the cockpit renderer as
 * window.__RECODER_COCKPIT__. The renderer sends `Authorization: Bearer <token>`
 * to ${backendUrl}/api/conductor/*, which the backend's authenticateRequest
 * accepts as a Better Auth session token (header path in getSessionTokenFromRequest).
 *
 * Token precedence matches the desktop workflow client: session token first,
 * then the resolved Recoder API key as a fallback. This synchronous variant is
 * used for the initial preload argument (cookies require an async read).
 * @returns {{ backendUrl: string, token: string, tokenSource: string }}
 */
function resolveCockpitConfig() {
  const backendUrl = dockerWorkflowApiUrl.replace(/\/+$/, '');
  const sessionToken = resolveDesktopSessionTokenDetailed();
  if (sessionToken.value) {
    return { backendUrl, token: sessionToken.value, tokenSource: 'session-token' };
  }
  const apiKey = resolveDesktopRecoderApiKeyDetailed();
  if (apiKey.value) {
    return { backendUrl, token: apiKey.value, tokenSource: `api-key:${apiKey.source}` };
  }
  return { backendUrl, token: '', tokenSource: 'none' };
}

/**
 * Async cockpit config resolver that ALSO consults the live web session cookie
 * (the result of the existing recoder.xyz auth flow). Precedence:
 *   1. env session token (RECODER_SESSION_TOKEN, ...)
 *   2. Better Auth session cookie from the logged-in web session
 *   3. resolved Recoder API key
 * Used after a login completes so the cockpit picks up the freshly-set session.
 * @returns {Promise<{ backendUrl: string, token: string, tokenSource: string }>}
 */
async function resolveCockpitConfigAsync() {
  const backendUrl = dockerWorkflowApiUrl.replace(/\/+$/, '');
  const envSession = resolveDesktopSessionTokenDetailed();
  if (envSession.value) {
    return { backendUrl, token: envSession.value, tokenSource: 'session-token' };
  }
  const cookieSession = await resolveDesktopSessionTokenFromCookies();
  if (cookieSession.value) {
    return { backendUrl, token: cookieSession.value, tokenSource: 'session-cookie' };
  }
  const apiKey = resolveDesktopRecoderApiKeyDetailed();
  if (apiKey.value) {
    return { backendUrl, token: apiKey.value, tokenSource: `api-key:${apiKey.source}` };
  }
  return { backendUrl, token: '', tokenSource: 'none' };
}

function resolveDesktopWorkflowAuthContext(params) {
  const sessionToken = (params.sessionToken || '').trim();
  if (sessionToken) {
    return {
      mode: 'session-token',
      source: 'env',
      token: sessionToken,
      endpointPath: '/api/agent/workflow',
      contract: WORKFLOW_CONTRACT_VERSION,
      headers: { Authorization: `Bearer ${sessionToken}` },
    };
  }
  const apiKey = (params.apiKey || '').trim();
  if (apiKey) {
    return {
      mode: 'api-key',
      source: params.apiKeySource === 'none' ? 'env' : params.apiKeySource,
      token: apiKey,
      endpointPath: '/api/v1/agent/workflow',
      contract: PUBLIC_WORKFLOW_CONTRACT_VERSION,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  }
  const cookie = (params.cookieHeader || '').trim();
  if (cookie) {
    return {
      mode: 'cookie-session',
      source: 'cookie',
      token: '',
      endpointPath: '/api/agent/workflow',
      contract: WORKFLOW_CONTRACT_VERSION,
      headers: { Cookie: cookie },
    };
  }
  return {
    mode: 'none',
    source: 'none',
    token: '',
    endpointPath: '/api/v1/agent/workflow',
    contract: PUBLIC_WORKFLOW_CONTRACT_VERSION,
    headers: {},
  };
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDesktopWorkflowFromBackend(payload = {}) {
  const baseUrl = dockerWorkflowApiUrl.replace(/\/+$/, '');
  const sessionToken =
    process.env.RECODER_SESSION_TOKEN
    || process.env.OPENCLAW_RECODER_SESSION_TOKEN
    || process.env.SESSION_TOKEN
    || '';
  const cookieHeader = await getCookieHeaderForUrl(normalizedUrl);
  const apiKey = resolveDesktopRecoderApiKeyDetailed();
  const auth = resolveDesktopWorkflowAuthContext({
    sessionToken,
    apiKey: apiKey.value,
    apiKeySource: apiKey.source,
    cookieHeader,
  });
  const strictContract = payload && payload.strict === true
    ? true
    : desktopStrictWorkflowContract;
  const endpoint = `${baseUrl}${auth.endpointPath}`;
  const warnings = [];
  if (auth.mode === 'none') {
    warnings.push('No session token, API key, or desktop cookie session found; backend may reject request.');
  }

  let attempts = 0;
  let lastError = null;

  for (let attempt = 1; attempt <= desktopWorkflowMaxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.headers,
        },
        body: JSON.stringify({
          task: payload.task,
          paths: Array.isArray(payload.paths) ? payload.paths : undefined,
          continuous: payload.continuous !== false,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const transient = response.status >= 500 || response.status === 429;
        const message = `workflow request failed: ${response.status}${text ? ` ${text.trim()}` : ''}`.trim();
        if (attempt < desktopWorkflowMaxAttempts && transient) {
          warnings.push(`attempt ${attempt}/${desktopWorkflowMaxAttempts} failed (${response.status}); retrying`);
          await sleepMs(attempt * 250);
          continue;
        }
        throw new Error(message);
      }

      const result = await response.json();
      const workflow = result?.workflow || result?.data?.workflow;
      const responseContract = typeof result?.contract === 'string'
        ? result.contract
        : typeof result?.data?.contract === 'string'
          ? result.data.contract
          : null;
      const contractStatus = responseContract
        ? responseContract === auth.contract
          ? 'match'
          : 'mismatch'
        : 'missing';
      if (!workflow) {
        throw new Error('workflow response missing payload');
      }
      if (!responseContract) {
        warnings.push(`response contract marker missing (expected ${auth.contract})`);
      } else if (responseContract !== auth.contract) {
        warnings.push(`response contract mismatch: expected ${auth.contract}, got ${responseContract}`);
      }
      if (strictContract && contractStatus !== 'match') {
        throw new Error(`strict contract check failed: expected ${auth.contract}, got ${responseContract || 'missing'}`);
      }

      return {
        workflow,
        meta: {
          endpoint,
          contract: auth.contract,
          responseContract,
          contractStatus,
          strictContract,
          authMode: auth.mode,
          authSource: auth.source,
          attempts,
          maxAttempts: desktopWorkflowMaxAttempts,
          warnings,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.startsWith('strict contract check failed')) {
        break;
      }
      if (attempt < desktopWorkflowMaxAttempts) {
        warnings.push(`attempt ${attempt}/${desktopWorkflowMaxAttempts} failed (${lastError.message}); retrying`);
        await sleepMs(attempt * 250);
        continue;
      }
    }
  }

  const finalError = new Error(
    `workflow backend unavailable after ${attempts}/${desktopWorkflowMaxAttempts} attempts (${lastError?.message || 'unknown'})`,
  );
  finalError.backendMeta = {
    endpoint,
    contract: auth.contract,
    responseContract: null,
    contractStatus: 'missing',
    strictContract,
    authMode: auth.mode,
    authSource: auth.source,
    attempts,
    maxAttempts: desktopWorkflowMaxAttempts,
    warnings,
  };
  throw finalError;
}

function buildA2AAdminHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (desktopA2AAdminToken.trim()) {
    headers.Authorization = `Bearer ${desktopA2AAdminToken.trim()}`;
  }
  return headers;
}

function toIsoNow() {
  return new Date().toISOString();
}

function generateLocalMessageId() {
  return `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDefaultDelegatedEnvelope(payload = {}) {
  const threadId = String(payload.threadId || payload.sessionId || 'desktop-thread').trim();
  const traceId = String(payload.traceId || `trace-${Date.now()}`).trim();
  const taskText = typeof payload.task === 'string' && payload.task.trim().length > 0
    ? payload.task.trim()
    : 'Run delegated task';
  const intent = typeof payload.intent === 'string' && payload.intent.trim().length > 0
    ? payload.intent.trim()
    : 'execute';

  return {
    envelopeVersion: RECODER_A2A_ENVELOPE_VERSION,
    protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
    messageId: generateLocalMessageId(),
    threadId,
    createdAt: toIsoNow(),
    from: {
      id: desktopA2AAgentId,
      name: 'Recoder Desktop',
      platform: 'recoder_desktop',
    },
    to: {
      id: String(payload.agentId || 'recoder-web').trim(),
      name: String(payload.targetName || payload.agentId || 'Recoder Agent').trim(),
      platform: String(payload.targetPlatform || 'recoder_web').trim(),
    },
    intent,
    payload: [{ kind: 'text', text: taskText }],
    metadata: {
      sourceSurface: 'desktop',
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
    },
    trace: {
      traceId,
      ...(payload.parentMessageId ? { parentMessageId: String(payload.parentMessageId) } : {}),
    },
  };
}

async function enqueueDelegatedTask(payload = {}) {
  const baseUrl = dockerWorkflowApiUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/a2a/bridge/jobs`;
  const envelope =
    payload.envelope && typeof payload.envelope === 'object'
      ? payload.envelope
      : buildDefaultDelegatedEnvelope(payload);
  const bridgeId = String(payload.bridgeId || desktopA2ABridgeId).trim() || 'desktop-default';
  const agentId = String(payload.agentId || envelope?.to?.id || 'recoder-web').trim();
  const traceId =
    String(payload.traceId || envelope?.trace?.traceId || envelope?.metadata?.traceId || '').trim()
    || undefined;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildA2AAdminHeaders(),
    body: JSON.stringify({
      bridgeId,
      agentId,
      envelope,
      ...(traceId ? { traceId } : {}),
    }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body && typeof body.error === 'string'
      ? body.error
      : `bridge enqueue failed with status ${response.status}`;
    throw new Error(message);
  }

  return {
    bridgeId,
    jobId: body?.jobId || null,
    traceId,
    envelope,
    raw: body,
  };
}

async function fetchDelegatedTaskStatus(jobId) {
  const baseUrl = dockerWorkflowApiUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/a2a/bridge/jobs/${encodeURIComponent(jobId)}/result`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: buildA2AAdminHeaders(),
  });

  if (response.status === 404) {
    return { complete: false, status: 'pending', result: null, raw: null };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body && typeof body.error === 'string'
      ? body.error
      : `bridge result lookup failed with status ${response.status}`;
    throw new Error(message);
  }

  const result = body?.result || null;
  const statusCandidate =
    (result && typeof result.status === 'string' && result.status)
    || (result && typeof result.state === 'string' && result.state)
    || (result && typeof result.ok === 'boolean' ? (result.ok ? 'completed' : 'failed') : '')
    || 'completed';
  const status = String(statusCandidate).trim().toLowerCase();
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'stopped', 'error', 'rejected']);

  return {
    complete: terminalStatuses.has(status),
    status,
    result,
    raw: body,
  };
}

async function pollDelegatedTaskStatus(payload = {}) {
  const jobId = String(payload.jobId || '').trim();
  if (!jobId) {
    throw new Error('jobId is required');
  }

  const timeoutMsRaw = Number.parseInt(String(payload.timeoutMs || '60000'), 10);
  const intervalMsRaw = Number.parseInt(String(payload.intervalMs || '2000'), 10);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 60000;
  const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw > 0 ? intervalMsRaw : 2000;

  const startedAt = Date.now();
  let attempts = 0;
  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    const status = await fetchDelegatedTaskStatus(jobId);
    if (status.complete) {
      return {
        ...status,
        jobId,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    }
    await sleepMs(intervalMs);
  }

  return {
    complete: false,
    status: 'timeout',
    result: null,
    raw: null,
    jobId,
    attempts,
    elapsedMs: Date.now() - startedAt,
  };
}

// ============================================================================
// A2A Task Visibility API (SFA-020)
// ============================================================================

const a2aTaskApiUrl =
  process.env.RECODER_A2A_TASK_API_URL
  || process.env.A2A_API_URL
  || dockerWorkflowApiUrl;

/**
 * Fetch the list of delegated A2A tasks.
 * GET /api/a2a/tasks
 */
async function fetchA2ATaskList(params = {}) {
  const baseUrl = a2aTaskApiUrl.replace(/\/+$/, '');
  const query = new URLSearchParams();
  if (params.page) query.append('page', String(params.page));
  if (params.limit) query.append('limit', String(params.limit));
  if (params.state) query.append('state', String(params.state));
  const qs = query.toString();
  const endpoint = `${baseUrl}/api/a2a/tasks${qs ? `?${qs}` : ''}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: buildA2AAdminHeaders(),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body && typeof body.error === 'string'
      ? body.error
      : `task list fetch failed with status ${response.status}`;
    throw new Error(message);
  }

  // Normalise: accept both { tasks: [...] } and raw arrays
  const tasks = Array.isArray(body)
    ? body
    : Array.isArray(body?.tasks)
      ? body.tasks
      : [];

  return {
    tasks,
    total: body?.total ?? tasks.length,
    page: body?.page ?? params.page,
    limit: body?.limit ?? params.limit,
  };
}

/**
 * Fetch a single A2A task by ID.
 * GET /api/a2a/tasks/:taskId
 */
async function fetchA2ATaskDetail(taskId) {
  const baseUrl = a2aTaskApiUrl.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/a2a/tasks/${encodeURIComponent(taskId)}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: buildA2AAdminHeaders(),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body && typeof body.error === 'string'
      ? body.error
      : `task detail fetch failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
}

/**
 * Poll a task until it reaches a terminal state or the timeout is reached.
 * Emits desktop_task_status_polled events on each poll.
 */
async function pollA2ATaskUntilDone(payload = {}) {
  const taskId = String(payload.taskId || '').trim();
  if (!taskId) {
    throw new Error('taskId is required');
  }

  const timeoutMsRaw = Number.parseInt(String(payload.timeoutMs || '120000'), 10);
  const intervalMsRaw = Number.parseInt(String(payload.intervalMs || '3000'), 10);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 120000;
  const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw > 0 ? intervalMsRaw : 3000;

  const terminalStates = new Set(['completed', 'failed', 'cancelled', 'stopped', 'error', 'rejected']);
  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    const task = await fetchA2ATaskDetail(taskId);

    const state = String(task?.state || task?.status || 'submitted').trim().toLowerCase();

    // Emit activation event
    emitDesktopActivationEvent('desktop_task_status_polled', { taskId, state, attempt: attempts });

    if (terminalStates.has(state)) {
      return {
        complete: true,
        state,
        task,
        taskId,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    }

    await sleepMs(intervalMs);
  }

  return {
    complete: false,
    state: 'timeout',
    task: null,
    taskId,
    attempts,
    elapsedMs: Date.now() - startedAt,
  };
}

/**
 * Emit a desktop activation event.
 * Logs to the structured desktop log; sends to the main window via IPC if available.
 */
function emitDesktopActivationEvent(event, data = {}) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  appendDesktopLog('activation-events.log',
    `${payload.timestamp} [${event}] ${JSON.stringify(data)}`
  );

  // Forward to renderer if a window is open
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop:activationEvent', payload);
    }
  } catch {
    // Ignore: window may not exist yet
  }
}

process.on('uncaughtException', (error) => {
  logRuntimeError('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  logRuntimeError('unhandledRejection', reason);
});

// Set app name for macOS menu bar
if (process.platform === 'darwin') {
  app.setName('Recoder');
}

// Register as default protocol handler for recoder://
// This allows magic links to open in the desktop app
if (process.defaultApp) {
  // Development mode - register with path to electron executable
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  // Production mode
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

// Store pending deep link URL (received before window is ready)
let pendingDeepLinkUrl = null;

// Handle deep link URL
function handleDeepLink(url) {
  console.log('📱 Received deep link:', url);
  
  if (!url || !url.startsWith(`${PROTOCOL_SCHEME}://`)) {
    return;
  }
  
  // Convert recoder://auth/callback?code=xxx to https://recoder.xyz/auth/callback?code=xxx
  const deepLinkPath = url.replace(`${PROTOCOL_SCHEME}://`, '');
  const webUrl = normalizedUrl.endsWith('/') 
    ? normalizedUrl + deepLinkPath 
    : normalizedUrl + '/' + deepLinkPath;
  
  console.log('🔗 Converted to web URL:', webUrl);
  
  // Get the main window
  const mainWindow = BrowserWindow.getAllWindows()[0];
  
  if (mainWindow) {
    // Load the auth callback URL
    mainWindow.loadURL(webUrl);
    
    // Focus the window
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  } else {
    // Window not ready yet, store for later
    pendingDeepLinkUrl = webUrl;
  }
}

// macOS: Handle protocol when app is already running
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: Handle protocol from command line args
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is running, quit this one
  app.quit();
} else {
  // Handle second instance (Windows/Linux deep link)
  app.on('second-instance', (event, commandLine) => {
    // Find the deep link URL in command line args
    const deepLinkUrl = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
    
    // Focus the main window
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Ignore certificate errors for localhost (dev server) - must be called before app.whenReady()
if (isLocal) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.commandLine.appendSwitch('ignore-ssl-errors');
}

// Circular loading animation HTML
const loadingHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Recoder</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: #000000;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .loader-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    
    .circular-loader {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    .loader-text {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="loader-container">
    <div class="circular-loader"></div>
    <div class="loader-text">Loading...</div>
  </div>
</body>
</html>
`;

function createWindow() {
  // Use .icns for macOS (proper styling), PNG for other platforms
  const iconPath = process.platform === 'darwin' 
    ? path.resolve(__dirname, 'assets', 'icon.icns')
    : path.resolve(__dirname, 'assets', 'icon.png');
    
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    backgroundColor: '#000000',
    // Use default frame with native controls
    titleBarStyle: 'default',
    frame: true,
    transparent: false,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: !isLocal,
      preload: path.join(__dirname, 'preload.js'),
      // Pass the cockpit config to preload before any page script runs, so the
      // renderer can read window.__RECODER_COCKPIT__ synchronously at module load.
      additionalArguments: [
        `--recoder-cockpit-config=${Buffer.from(JSON.stringify(resolveCockpitConfig())).toString('base64')}`,
      ],
    },
  });

  const { webContents } = mainWindow;

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logRuntimeError('render-process-gone', new Error(details.reason), {
      exitCode: details.exitCode,
    });
  });

  // Show loading animation immediately
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Set custom user agent to identify Electron app
  webContents.setUserAgent(webContents.getUserAgent() + ' Electron/Recoder-Desktop');

  // Create menu with back/forward navigation
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'Recoder',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { 
          label: 'Back',
          accelerator: 'CmdOrCtrl+Left',
          click: () => {
            if (webContents.navigationHistory.canGoBack()) {
              webContents.navigationHistory.goBack();
            }
          }
        },
        { 
          label: 'Forward',
          accelerator: 'CmdOrCtrl+Right',
          click: () => {
            if (webContents.navigationHistory.canGoForward()) {
              webContents.navigationHistory.goForward();
            }
          }
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => webContents.reload()
        },
        { type: 'separator' },
        {
          label: 'Open Cockpit',
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => {
            if (typeof mainWindow.loadCockpit === 'function') {
              mainWindow.loadCockpit();
              mainWindow.show();
              mainWindow.focus();
            }
          },
        },
        {
          label: 'Open dmux Console',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            // Discoverable launcher for the dmux operator console: opens the
            // cockpit directly on its dmux view (or navigates there live if the
            // cockpit is already open).
            if (typeof mainWindow.openCockpitView === 'function') {
              mainWindow.openCockpitView('dmux');
            } else if (typeof mainWindow.loadCockpit === 'function') {
              mainWindow.loadCockpit();
              mainWindow.show();
              mainWindow.focus();
            }
          },
        },
        {
          label: 'Open Web App',
          click: () => {
            mainWindow.loadURL(authUrl);
            mainWindow.show();
            mainWindow.focus();
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Tasks',
      submenu: [
        {
          label: 'Open Delegated Tasks',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            emitDesktopActivationEvent('desktop_task_panel_opened');
            // Send IPC to renderer to open the tasks panel
            webContents.send('a2a:openTasksPanel');
          },
        },
        { type: 'separator' },
        {
          label: 'Refresh Tasks',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            webContents.send('a2a:refreshTasks');
          },
        },
        {
          label: 'Create Task...',
          click: () => {
            emitDesktopActivationEvent('desktop_task_created_menu');
            webContents.send('a2a:createTaskDialog');
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' }
        ] : [
          { role: 'close' }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Handle certificate errors for localhost
  if (isLocal) {
    webContents.on('certificate-error', (event, url, error, certificate, callback) => {
      if (isLocalhost(url)) {
        event.preventDefault();
        callback(true);
      } else {
        callback(false);
      }
    });
  }

  // Always load auth page directly for desktop app
  const authUrl = normalizedUrl.endsWith('/')
    ? normalizedUrl + 'auth'
    : normalizedUrl + '/auth';

  // Load the bundled conductor cockpit renderer (real local file, not the web app).
  // The renderer reads window.__RECODER_COCKPIT__ (injected via preload) for
  // { backendUrl, token } and authenticates /api/conductor calls with it.
  function loadCockpit(configOverride) {
    if (!fs.existsSync(cockpitIndexPath)) {
      const message = `Cockpit bundle not found at ${cockpitIndexPath}; falling back to web app.`;
      console.warn(`[cockpit] ${message}`);
      appendDesktopLog('cockpit.log', `${new Date().toISOString()} ${message}`);
      mainWindow.loadURL(authUrl);
      return;
    }
    // The preload --recoder-cockpit-config argument is fixed at window-creation
    // time and cannot change on reload. When we reload the cockpit after a fresh
    // login (cookie-derived token), pass the resolved config here so we can
    // re-inject the live token into the reloaded page via executeJavaScript.
    const cfg = configOverride || resolveCockpitConfig();
    emitDesktopActivationEvent('desktop_cockpit_opened', {
      backendUrl: cfg.backendUrl,
      tokenSource: cfg.tokenSource,
      view: cfg.view,
    });
    const injectRuntimeConfig = () => {
      // Set a plain (non-contextBridge) runtime override the renderer reads as a
      // higher-priority source than the frozen preload-injected config. We inject
      // it whenever there is a token OR an initial-view deep link to honor (e.g.
      // "Open dmux Console" passes { view: 'dmux' } so the cockpit opens there).
      if (!cfg.token && !cfg.view) return;
      const runtime = {
        backendUrl: cfg.backendUrl,
        tokenSource: cfg.tokenSource,
      };
      if (cfg.token) runtime.token = cfg.token;
      if (cfg.view) runtime.view = cfg.view;
      const payload = JSON.stringify(runtime);
      mainWindow.webContents
        .executeJavaScript(`window.__RECODER_COCKPIT_RUNTIME__ = ${payload}; true;`)
        .catch((error) => logRuntimeError('cockpit-runtime-inject-failed', error));
    };
    mainWindow.webContents.once('did-finish-load', injectRuntimeConfig);
    mainWindow.loadFile(cockpitIndexPath).catch((error) => {
      logRuntimeError('cockpit-load-failed', error, { cockpitIndexPath });
      mainWindow.loadURL(authUrl);
    });
  }

  // Expose for menu/tray triggers
  mainWindow.loadCockpit = loadCockpit;

  /** True when the main window is currently showing the bundled cockpit page. */
  function isCockpitLoaded() {
    try {
      const url = mainWindow.webContents.getURL() || '';
      return url.startsWith('file://') && url.includes('/cockpit/dist/index.html');
    } catch {
      return false;
    }
  }

  /**
   * Open the cockpit on a specific discoverable view (e.g. 'dmux'). If the
   * cockpit is already showing, navigate it live via the COCKPIT_NAVIGATE_EVENT
   * (no reload, no lost auth state). Otherwise load the cockpit with a view
   * deep-link so it opens directly on that surface.
   */
  function openCockpitView(view) {
    mainWindow.show();
    mainWindow.focus();
    if (isCockpitLoaded()) {
      const detail = JSON.stringify({ view });
      mainWindow.webContents
        .executeJavaScript(
          `window.dispatchEvent(new CustomEvent('recoder-cockpit:navigate', { detail: ${detail} })); true;`,
        )
        .catch((error) => logRuntimeError('cockpit-navigate-failed', error, { view }));
      emitDesktopActivationEvent('desktop_cockpit_view_navigated', { view });
      return;
    }
    loadCockpit({ ...resolveCockpitConfig(), view });
  }
  mainWindow.openCockpitView = openCockpitView;

  // Tracks the live cockpit auth popup so a second login() reuses it.
  let cockpitAuthWindow = null;

  /**
   * Drive the EXISTING recoder.xyz web auth flow for the cockpit. This does not
   * invent a new auth scheme: it opens the same `/auth` URL the web app uses in
   * a popup window that SHARES the default session (so its cookies are visible
   * to the main process), lets the user sign in via the existing OAuth/callback
   * machinery, waits for Better Auth to set its session cookie, then resolves
   * with the freshly-resolved token.
   *
   * Crucially, the cockpit renderer stays alive in the main window the whole
   * time, so the login() IPC promise resolves back into the SAME renderer, which
   * stores the token in-memory and retries /api/conductor — no reload, no lost
   * React state, and never a fabricated token.
   * @returns {Promise<{ ok: boolean, token: string, tokenSource: string, backendUrl: string, reason?: string }>}
   */
  async function startCockpitLogin() {
    // If we already have a usable token (env/cookie/api-key), don't force a
    // re-login — just hand it back. This keeps the flow idempotent.
    const existing = await resolveCockpitConfigAsync();
    if (existing.token) {
      return { ok: true, ...existing };
    }

    emitDesktopActivationEvent('desktop_cockpit_login_started', { backendUrl: existing.backendUrl });

    // Open (or focus) the auth popup. It shares the default session partition,
    // so the Better Auth cookie it sets is readable via the same cookie store
    // the cockpit token resolver uses.
    if (!cockpitAuthWindow || cockpitAuthWindow.isDestroyed()) {
      cockpitAuthWindow = new BrowserWindow({
        width: 600,
        height: 800,
        parent: mainWindow,
        modal: false,
        autoHideMenuBar: true,
        title: 'Sign in to Recoder',
        backgroundColor: '#000000',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      cockpitAuthWindow.on('closed', () => {
        cockpitAuthWindow = null;
      });
      cockpitAuthWindow.loadURL(authUrl);
    } else {
      cockpitAuthWindow.show();
      cockpitAuthWindow.focus();
    }

    // Poll for the Better Auth session cookie to appear (set once the existing
    // auth flow completes). Bounded so a cancelled login resolves truthfully.
    const deadline = Date.now() + 5 * 60 * 1000; // 5 minutes
    const pollMs = 1000;
    while (Date.now() < deadline) {
      await sleepMs(pollMs);

      if (mainWindow.isDestroyed()) {
        return { ok: false, token: '', tokenSource: 'none', backendUrl: existing.backendUrl, reason: 'window-closed' };
      }

      const resolved = await resolveCockpitConfigAsync();
      if (resolved.token) {
        emitDesktopActivationEvent('desktop_cockpit_login_succeeded', {
          tokenSource: resolved.tokenSource,
        });
        // Close the auth popup and return the real token to the live cockpit
        // renderer, which applies it in-memory and retries /api/conductor.
        if (cockpitAuthWindow && !cockpitAuthWindow.isDestroyed()) {
          cockpitAuthWindow.close();
          cockpitAuthWindow = null;
        }
        mainWindow.show();
        mainWindow.focus();
        return { ok: true, ...resolved };
      }

      // The user closed the popup without completing sign-in.
      if (!cockpitAuthWindow || cockpitAuthWindow.isDestroyed()) {
        return {
          ok: false,
          token: '',
          tokenSource: 'none',
          backendUrl: existing.backendUrl,
          reason: 'cancelled',
        };
      }
    }

    emitDesktopActivationEvent('desktop_cockpit_login_timeout', {});
    if (cockpitAuthWindow && !cockpitAuthWindow.isDestroyed()) {
      cockpitAuthWindow.close();
      cockpitAuthWindow = null;
    }
    return {
      ok: false,
      token: '',
      tokenSource: 'none',
      backendUrl: existing.backendUrl,
      reason: 'timeout',
    };
  }

  // Expose for the IPC bridge (cockpit "Sign in" button).
  mainWindow.startCockpitLogin = startCockpitLogin;

  // Load the actual surface after the loading screen is shown
  setTimeout(() => {
    if (cockpitModeEnabledByEnv) {
      loadCockpit();
    } else {
      mainWindow.loadURL(authUrl);
    }
  }, 100);

  // Intercept navigation to prevent going to homepage and handle OAuth
  webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const url = new URL(navigationUrl);
      
      // Check if this is an OAuth URL
      const isOAuthUrl = navigationUrl.includes('accounts.google.com') ||
                         navigationUrl.includes('github.com/login/oauth') ||
                         navigationUrl.includes('api.github.com') ||
                         navigationUrl.includes('/auth/callback') ||
                         navigationUrl.includes('oauth') ||
                         navigationUrl.includes('authorize');
      
      if (isOAuthUrl) {
        console.log('🚫 Preventing OAuth navigation in main window');
        console.log('✅ Opening OAuth in popup instead:', navigationUrl);
        event.preventDefault();
        
        // Create OAuth popup window with loading animation
        const oauthWindow = new BrowserWindow({
          width: 600,
          height: 800,
          parent: mainWindow,
          modal: false,
          autoHideMenuBar: true,
          title: 'Sign In',
          backgroundColor: '#000000',
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        
        // Show loading animation first, then load OAuth URL
        oauthWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
        oauthWindow.once('ready-to-show', () => {
          oauthWindow.show();
          oauthWindow.loadURL(navigationUrl);
        });
        
        // Handle OAuth callback - close popup and load callback in main window
        oauthWindow.webContents.on('will-navigate', (e, callbackUrl) => {
          if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
            console.log('✅ OAuth callback detected, closing popup');
            e.preventDefault();
            oauthWindow.close();
            mainWindow.loadURL(callbackUrl);
          }
        });
        
        oauthWindow.webContents.on('will-redirect', (e, callbackUrl) => {
          if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
            console.log('✅ OAuth redirect detected, closing popup');
            e.preventDefault();
            oauthWindow.close();
            mainWindow.loadURL(callbackUrl);
          }
        });
        
        return;
      }
      
      // Redirect homepage to auth
      if (url.pathname === '/' || url.pathname === '') {
        event.preventDefault();
        mainWindow.loadURL(authUrl);
        return;
      }
    } catch (e) {
      console.error('Navigation error:', e);
    }
  });

  // Inject homepage redirect protection on page load
  webContents.on('did-finish-load', () => {
    // Skip web-app-specific redirect/OAuth injection when showing the local cockpit file.
    if (webContents.getURL().startsWith('file://')) {
      return;
    }

    // Inject homepage redirect protection
    webContents.executeJavaScript(`
      (function() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function() {
          const url = arguments[2];
          if (url === '/' || url === '') {
            window.location.href = '/auth';
            return;
          }
          return originalPushState.apply(history, arguments);
        };
        
        history.replaceState = function() {
          const url = arguments[2];
          if (url === '/' || url === '') {
            window.location.href = '/auth';
            return;
          }
          return originalReplaceState.apply(history, arguments);
        };
        
        if (window.location.pathname === '/' || window.location.pathname === '') {
          window.location.href = '/auth';
        }
        
        window.addEventListener('popstate', function() {
          if (window.location.pathname === '/' || window.location.pathname === '') {
            window.location.href = '/auth';
          }
        });
        
        // Intercept links with target="_blank" to ensure they open in popups
        document.addEventListener('click', function(e) {
          const link = e.target.closest('a[target="_blank"]');
          if (link && link.href) {
            const href = link.href;
            // OAuth URLs should open via window.open() to trigger popup handler
            const isOAuthUrl = href.includes('accounts.google.com') ||
                               href.includes('github.com/login/oauth') ||
                               href.includes('api.github.com') ||
                               href.includes('/auth/callback') ||
                               href.includes('oauth') ||
                               href.includes('authorize');
            
            if (isOAuthUrl) {
              e.preventDefault();
              window.open(href, '_blank', 'width=500,height=700');
            }
          }
        }, true);
      })();
    `).catch(() => {});
  });

  webContents.on('did-navigate', (event, url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname === '/' || urlObj.pathname === '') {
        mainWindow.loadURL(authUrl);
        return;
      }
    } catch (e) {}
  });

  webContents.on('did-navigate-in-page', (event, url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname === '/' || urlObj.pathname === '') {
        mainWindow.loadURL(authUrl);
        return;
      }
    } catch (e) {}
  });

  // Handle all window.open() calls - OAuth and external links
  webContents.setWindowOpenHandler(({ url }) => {
    console.log('🔗 Window open requested:', url);
    
    // OAuth URLs that should open in a popup window
    const isOAuthUrl = url.includes('accounts.google.com') ||
                       url.includes('github.com/login/oauth') ||
                       url.includes('api.github.com') ||
                       url.includes('/auth/callback') ||
                       url.includes('oauth') ||
                       url.includes('authorize');
    
    if (isOAuthUrl) {
      console.log('✅ Opening OAuth in popup window');
      // Open OAuth in a popup window - Electron will create it
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 800,
          parent: mainWindow,
          modal: false,
          autoHideMenuBar: true,
          title: 'Sign In',
          backgroundColor: '#000000',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    
    console.log('🌐 Opening in system browser');
    // External links open in system browser
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  
  // Handle OAuth callback redirects from popup windows
  app.on('web-contents-created', (event, contents) => {
    // Only handle popup windows (not main window)
    if (contents !== webContents) {
      contents.on('will-navigate', (e, callbackUrl) => {
        if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
          e.preventDefault();
          // Close the popup
          const popupWindow = BrowserWindow.fromWebContents(contents);
          if (popupWindow) {
            popupWindow.close();
          }
          // Load callback in main window
          mainWindow.loadURL(callbackUrl);
        }
      });
      
      contents.on('will-redirect', (e, callbackUrl) => {
        if (callbackUrl.includes('/auth/callback') || callbackUrl.includes(normalizedUrl)) {
          e.preventDefault();
          // Close the popup
          const popupWindow = BrowserWindow.fromWebContents(contents);
          if (popupWindow) {
            popupWindow.close();
          }
          // Load callback in main window
          mainWindow.loadURL(callbackUrl);
        }
      });
    }
  });

  // Handle OAuth redirects back to the app in main window
  webContents.on('will-navigate', (event, url) => {
    // If navigating to our auth callback from OAuth, allow it
    if (url.includes('/auth/callback')) {
      // Re-inject nav bar after OAuth completes
      setTimeout(() => injectNavBar(), 500);
    }
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    // Use .icns for macOS dock icon - ensures proper styling with rounded corners
    const iconPath = path.resolve(__dirname, 'assets', 'icon.icns');
    console.log('🎨 Setting dock icon from:', iconPath);
    try {
      const icon = nativeImage.createFromPath(iconPath);
      console.log('🎨 Icon loaded, isEmpty:', icon.isEmpty(), 'size:', icon.getSize());
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
        console.log('✅ Dock icon set successfully');
      } else {
        console.error('❌ Icon is empty');
      }
    } catch (err) {
      console.error('❌ Error setting dock icon:', err);
    }
  }

  createWindow();

  // Handle pending deep link (received before window was ready)
  if (pendingDeepLinkUrl) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.loadURL(pendingDeepLinkUrl);
    }
    pendingDeepLinkUrl = null;
  }

  // Check command line args for deep link on startup (Windows/Linux)
  if (process.platform !== 'darwin') {
    const deepLinkUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC Handlers - File System
// ============================================================================

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Code', extensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'go', 'rs'] },
    ],
  });
  if (canceled || filePaths.length === 0) return null;
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { path: filePaths[0], content };
});

ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, { defaultPath, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  try {
    const safePath = validateFsPath(filePath);
    return fs.readFileSync(safePath, 'utf-8');
  } catch (e) {
    return null;
  }
});

ipcMain.handle('fs:writeFile', async (_event, { filePath, content }) => {
  try {
    const safePath = validateFsPath(filePath);
    fs.writeFileSync(safePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('fs:readDir', async (_event, dirPath) => {
  try {
    const safePath = validateFsPath(dirPath);
    const entries = fs.readdirSync(safePath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      path: path.join(safePath, e.name),
    }));
  } catch {
    return [];
  }
});

ipcMain.handle('fs:exists', async (_event, filePath) => {
  try {
    const safePath = validateFsPath(filePath);
    return fs.existsSync(safePath);
  } catch {
    return false;
  }
});

ipcMain.handle('fs:stat', async (_event, filePath) => {
  try {
    const safePath = validateFsPath(filePath);
    const stats = fs.statSync(safePath);
    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
    };
  } catch {
    return null;
  }
});

// ============================================================================
// IPC Handlers - Terminal (using node-pty when available)
// ============================================================================

const terminals = new Map();

ipcMain.handle('terminal:spawn', async (_event, options = {}) => {
  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

  try {
    // Try to use node-pty for native terminal
    const pty = require('node-pty');
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.env.HOME,
      env: { ...process.env, ...options.env },
    });

    term.onData((data) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:data', { id, data });
      }
    });

    term.onExit(({ exitCode }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:exit', { id, exitCode });
      }
      terminals.delete(id);
    });

    terminals.set(id, term);
    return { id, success: true };
  } catch {
    // node-pty not available - fall back to child_process
    const { spawn } = require('child_process');
    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';

    const proc = spawn(shell, [], {
      cwd: options.cwd || process.env.HOME,
      env: { ...process.env, ...options.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:data', { id, data: data.toString() });
      }
    });

    proc.stderr.on('data', (data) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:data', { id, data: data.toString() });
      }
    });

    proc.on('exit', (exitCode) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('terminal:exit', { id, exitCode });
      }
      terminals.delete(id);
    });

    terminals.set(id, proc);
    return { id, success: true, fallback: true };
  }
});

ipcMain.handle('terminal:write', async (_event, { id, data }) => {
  const term = terminals.get(id);
  if (!term) return false;
  if (term.write) {
    term.write(data); // node-pty
  } else if (term.stdin) {
    term.stdin.write(data); // child_process
  }
  return true;
});

ipcMain.handle('terminal:resize', async (_event, { id, cols, rows }) => {
  const term = terminals.get(id);
  if (term && term.resize) {
    term.resize(cols, rows); // node-pty only
  }
  return true;
});

ipcMain.handle('terminal:kill', async (_event, id) => {
  const term = terminals.get(id);
  if (term) {
    if (term.kill) term.kill();
    else if (term.destroy) term.destroy();
    terminals.delete(id);
  }
  return true;
});

// ============================================================================
// IPC Handlers - Clipboard
// ============================================================================

ipcMain.handle('clipboard:write', async (_event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('clipboard:read', async () => {
  return clipboard.readText();
});

// ============================================================================
// IPC Handlers - Window
// ============================================================================

ipcMain.handle('window:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});

ipcMain.handle('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});

ipcMain.handle('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});

ipcMain.handle('window:toggleFullscreen', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.setFullScreen(!win.isFullScreen());
});

// ============================================================================
// IPC Handlers - App
// ============================================================================

ipcMain.handle('app:version', () => app.getVersion());

// ============== Cockpit auth (Sign in to Recoder) ==============
// The cockpit renderer calls these when it gets a 401/403 (unauthenticated)
// from /api/conductor. They reuse the EXISTING recoder.xyz web auth flow — no
// new auth scheme, no fabricated token.

/** Re-resolve the cockpit auth token (env -> web session cookie -> API key). */
ipcMain.handle('cockpit:resolveToken', async (event) => {
  const cfg = await resolveCockpitConfigAsync();
  return { ok: Boolean(cfg.token), ...cfg };
});

/**
 * Run the existing web auth flow and hand back the resolved session token.
 * Delegates to mainWindow.startCockpitLogin (defined in createWindow), which
 * navigates to /auth, lets the existing OAuth/callback handlers complete, waits
 * for the Better Auth session cookie, then reloads the cockpit with the token.
 */
ipcMain.handle('cockpit:login', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
    || BrowserWindow.getAllWindows()[0]
    || null;
  if (!win || typeof win.startCockpitLogin !== 'function') {
    return { ok: false, token: '', tokenSource: 'none', reason: 'no-window' };
  }
  try {
    return await win.startCockpitLogin();
  } catch (error) {
    logRuntimeError('cockpit-login-failed', error);
    return {
      ok: false,
      token: '',
      tokenSource: 'none',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle('agent:getWorkflowPlan', async (_event, payload = {}) => {
  try {
    const remote = await fetchDesktopWorkflowFromBackend(payload);
    return { success: true, source: 'docker-backend', workflow: remote.workflow, backend: remote.meta, fallbackReason: null };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error);
    const backend = error && error.backendMeta ? error.backendMeta : null;
    logRuntimeError('desktopWorkflowFallback', error, { endpoint: dockerWorkflowApiUrl, backend, fallbackReason });
    return {
      success: true,
      source: 'local-fallback',
      workflow: buildDesktopWorkflowFallback(payload),
      backend,
      fallbackReason,
    };
  }
});

ipcMain.handle('agent:delegateTask', async (_event, payload = {}) => {
  try {
    const delegated = await enqueueDelegatedTask(payload);
    return {
      success: true,
      ...delegated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logRuntimeError('desktopDelegateTaskFailed', error, {
      endpoint: `${dockerWorkflowApiUrl.replace(/\/+$/, '')}/api/a2a/bridge/jobs`,
    });
    return {
      success: false,
      error: message,
    };
  }
});

ipcMain.handle('agent:getDelegatedTaskStatus', async (_event, payload = {}) => {
  try {
    const jobId = String(payload.jobId || '').trim();
    if (!jobId) {
      return { success: false, error: 'jobId is required' };
    }
    const status = await fetchDelegatedTaskStatus(jobId);
    return {
      success: true,
      jobId,
      ...status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle('agent:pollDelegatedTaskStatus', async (_event, payload = {}) => {
  try {
    const result = await pollDelegatedTaskStatus(payload);
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// ── SFA-020: A2A Task Visibility IPC Handlers ──────────────────────────────

ipcMain.handle('a2a:listTasks', async (_event, payload = {}) => {
  try {
    emitDesktopActivationEvent('desktop_task_list_requested', {
      page: payload.page,
      state: payload.state,
    });
    const data = await fetchA2ATaskList(payload);
    return { success: true, ...data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      tasks: [],
    };
  }
});

ipcMain.handle('a2a:getTask', async (_event, payload = {}) => {
  try {
    const taskId = String(payload.taskId || '').trim();
    if (!taskId) {
      return { success: false, error: 'taskId is required' };
    }
    const task = await fetchA2ATaskDetail(taskId);
    return { success: true, task };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle('a2a:pollTask', async (_event, payload = {}) => {
  try {
    const result = await pollA2ATaskUntilDone(payload);
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle('a2a:createTask', async (_event, payload = {}) => {
  try {
    emitDesktopActivationEvent('desktop_task_created', {
      agentId: payload.agentId,
      intent: payload.intent,
    });
    const delegated = await enqueueDelegatedTask(payload);
    return { success: true, ...delegated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logRuntimeError('desktopA2ACreateTaskFailed', error);
    return { success: false, error: message };
  }
});

// ── End SFA-020 IPC Handlers ───────────────────────────────────────────────

ipcMain.handle('app:openExternal', async (_event, url) => {
  try {
    const parsed = new URL(url);
    const allowedProtocols = ['http:', 'https:', 'mailto:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('app:showInFolder', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

// ============================================================================
// Auto-Updater
// ============================================================================

let autoUpdater;

try {
  if (!autoUpdateEnabled) {
    throw new Error('Auto-update disabled by DESKTOP_AUTO_UPDATE=false');
  }
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => {
    logRuntimeError('auto-updater-error', error);
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('update:downloaded', {
        version: info.version,
      });
    }
  });

  ipcMain.handle('app:checkForUpdates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result?.updateInfo };
    } catch {
      return { available: false };
    }
  });

  ipcMain.handle('app:installUpdate', () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates 10 seconds after launch
  app.whenReady().then(() => {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        logRuntimeError('auto-updater-check-failed', error);
      });
    }, 10000);
  });
} catch {
  // electron-updater not available (dev mode)
  ipcMain.handle('app:checkForUpdates', () => ({ available: false }));
  ipcMain.handle('app:installUpdate', () => {});
}

// ============================================================================
// System Tray
// ============================================================================

let tray = null;

app.whenReady().then(() => {
  // Create tray icon (use small version)
  const trayIconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'assets', 'icon.png')
    : path.join(__dirname, 'assets', 'icon.png');

  try {
    const trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Recoder',
        click: () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.show();
            win.focus();
          } else {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'New Project',
        click: () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.loadURL(normalizedUrl + 'new');
            win.show();
            win.focus();
          }
        },
      },
      {
        label: 'Delegated Tasks',
        click: () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            emitDesktopActivationEvent('desktop_task_panel_opened', { source: 'tray' });
            win.webContents.send('a2a:openTasksPanel');
            win.show();
            win.focus();
          }
        },
      },
      {
        label: 'Open Cockpit',
        click: () => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win && typeof win.loadCockpit === 'function') {
            win.loadCockpit();
            win.show();
            win.focus();
          } else if (!win) {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);

    tray.setToolTip('Recoder');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.show();
        win.focus();
      }
    });
  } catch (e) {
    console.warn('Failed to create tray:', e.message);
  }

  // Register global shortcut
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
    } else {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Kill all terminal processes
  for (const [id, term] of terminals) {
    if (term.kill) term.kill();
    else if (term.destroy) term.destroy();
  }
  terminals.clear();
});
