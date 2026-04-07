"use strict";
/**
 * Preview Proxy - Routes preview URLs to container dev servers
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDockerPreviewUpstreamHeaders = buildDockerPreviewUpstreamHeaders;
exports.setupPreviewProxy = setupPreviewProxy;
const http_proxy_middleware_1 = require("http-proxy-middleware");
const http_1 = __importDefault(require("http"));
const dockerode_1 = __importDefault(require("dockerode"));
const ws_1 = __importDefault(require("ws"));
const auth_utils_js_1 = require("./auth-utils.js");
const container_recovery_js_1 = require("./container-recovery.js");
const dev_server_js_1 = require("./dev-server.js");
const daytona_client_js_1 = require("./daytona-client.js");
const daytona_file_ops_js_1 = require("./daytona-file-ops.js");
const preview_rewrite_js_1 = require("./preview-rewrite.js");
const zrok_preview_js_1 = require("./zrok-preview.js");
const docker = new dockerode_1.default();
const autoStartAttempts = new Map();
const autoInstallAttempts = new Map();
const AUTO_START_COOLDOWN_MS = 10000;
const AUTO_INSTALL_COOLDOWN_MS = 60000;
const DAYTONA_PORT_CANDIDATES = [
    { port: 5173, type: 'Vite (5173)' },
    { port: 5174, type: 'Vite (5174)' },
    { port: 5175, type: 'Vite (5175)' },
    { port: 5176, type: 'Vite (5176)' },
    { port: 5177, type: 'Vite (5177)' },
    { port: 5178, type: 'Vite (5178)' },
    { port: 5179, type: 'Vite (5179)' },
    { port: 5180, type: 'Vite (5180)' },
    { port: 4173, type: 'Vite Preview (4173)' },
    { port: 4174, type: 'Vite Preview (4174)' },
    { port: 3000, type: 'Next.js (3000)' },
    { port: 3001, type: 'Dev (3001)' },
    { port: 8080, type: 'Other (8080)' },
    { port: 8081, type: 'Expo (8081)' },
];
async function execInContainer(containerId, cmd) {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', cmd],
        AttachStdout: true,
        AttachStderr: true,
    });
    const stream = await exec.start({});
    return await new Promise((resolve, reject) => {
        let out = '';
        stream.on('data', (chunk) => { out += chunk.slice(8).toString(); });
        stream.on('end', () => resolve(out.trim()));
        stream.on('error', reject);
    });
}
async function detectFramework(containerId, isDaytona) {
    try {
        if (!isDaytona) {
            const detected = await (0, dev_server_js_1.detectFrameworkFromContainer)(containerId);
            return detected === 'unknown' ? 'vite' : detected;
        }
        let pkgRaw;
        const dc = (0, daytona_client_js_1.getDaytonaClient)();
        const result = await dc.execCommand(containerId, 'cat /home/daytona/package.json 2>/dev/null || echo ""', { timeoutSecs: 10 });
        pkgRaw = result.output;
        if (!pkgRaw)
            return 'vite';
        let pkg;
        try {
            pkg = JSON.parse(pkgRaw);
        }
        catch {
            return 'vite';
        }
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.next || pkg.scripts?.dev?.includes('next'))
            return 'next';
        if (deps.expo || deps['react-native'])
            return 'expo';
        if (deps.nuxt)
            return 'nuxt';
        if (deps['@sveltejs/kit'])
            return 'sveltekit';
        if (deps.svelte)
            return 'svelte';
        if (deps['@angular/core'])
            return 'angular';
        if (deps.vue)
            return 'vue';
        if (deps.vite || pkg.scripts?.dev?.includes('vite'))
            return 'vite';
        if (deps.servor || deps.serve)
            return 'static';
        if (pkg.scripts?.start && !pkg.scripts?.dev)
            return 'static';
        if (deps.react)
            return 'react';
        if (deps.express || deps.fastify || deps.koa)
            return 'node-server';
        const indexHtml = await dc.execCommand(containerId, 'test -f /home/daytona/index.html && echo "yes" || echo "no"', { timeoutSecs: 10 });
        if (indexHtml.output.includes('yes'))
            return 'static';
        return 'node';
    }
    catch {
        // ignore
    }
    return 'vite';
}
async function ensureDependencies(containerId, projectId, isDaytona) {
    const now = Date.now();
    const lastInstall = autoInstallAttempts.get(projectId) || 0;
    if (now - lastInstall < AUTO_INSTALL_COOLDOWN_MS) {
        return;
    }
    if (isDaytona) {
        const dc = (0, daytona_client_js_1.getDaytonaClient)();
        const pkgResult = await dc.execCommand(containerId, 'cat /home/daytona/package.json 2>/dev/null || echo ""', { timeoutSecs: 10 });
        if (!pkgResult.output) {
            console.log(`⚠️ [Preview] package.json not found yet for ${projectId} (Daytona), skipping install`);
            return;
        }
        const nmResult = await dc.execCommand(containerId, 'test -d /home/daytona/node_modules && echo "yes" || echo "no"', { timeoutSecs: 10 });
        if (nmResult.output.includes('yes')) {
            return;
        }
        autoInstallAttempts.set(projectId, now);
        console.log(`📦 [Preview] Installing dependencies for ${projectId} (Daytona)...`);
        await dc.execCommand(containerId, 'cd /home/daytona && npm install --legacy-peer-deps --no-audit --no-fund', { timeoutSecs: 120 });
        return;
    }
    const pkgRaw = await execInContainer(containerId, 'cat /workspace/package.json 2>/dev/null || echo ""');
    if (!pkgRaw) {
        console.log(`⚠️ [Preview] package.json not found yet for ${projectId}, skipping install`);
        return;
    }
    const hasNodeModules = await execInContainer(containerId, 'test -d /workspace/node_modules && echo "yes" || echo "no"');
    if (hasNodeModules.includes('yes')) {
        return;
    }
    autoInstallAttempts.set(projectId, now);
    console.log(`📦 [Preview] Installing dependencies for ${projectId}...`);
    await execInContainer(containerId, 'cd /workspace && npm install --legacy-peer-deps --no-audit --no-fund');
}
function getDaytonaProxyHost() {
    const raw = process.env.DAYTONA_PROXY_HOST || 'host.docker.internal:4000';
    return raw.includes(':') ? raw.split(':')[0] : raw;
}
function getDaytonaProxyPort() {
    const raw = process.env.DAYTONA_PROXY_HOST || 'host.docker.internal:4000';
    if (raw.includes(':')) {
        const parsed = parseInt(raw.split(':')[1], 10);
        if (!Number.isNaN(parsed))
            return parsed;
    }
    return parseInt(process.env.DAYTONA_PROXY_PORT || '4000', 10);
}
function getValidatedPreviewProjectId(rawProjectId) {
    const projectId = String(rawProjectId || '').trim();
    return (0, auth_utils_js_1.isLikelySandboxProjectId)(projectId) ? projectId : null;
}
function buildDockerPreviewUpstreamHeaders(targetPort, baseHeaders = {}) {
    const loopbackHost = `127.0.0.1:${targetPort}`;
    const upstreamOrigin = `http://${loopbackHost}`;
    return {
        ...baseHeaders,
        host: loopbackHost,
        origin: upstreamOrigin,
    };
}
async function probeDaytonaPort(entry, port, path = '/') {
    const proxyHost = getDaytonaProxyHost();
    const proxyPort = getDaytonaProxyPort();
    const sandboxHost = `${port}-${entry.id}.sandbox.recoder.xyz`;
    return await new Promise((resolve) => {
        const req = http_1.default.request({
            hostname: proxyHost,
            port: proxyPort,
            path,
            method: 'GET',
            headers: {
                Host: sandboxHost,
                Accept: '*/*',
            },
            timeout: 4000,
        }, (resp) => {
            const status = resp.statusCode || 0;
            resp.resume();
            resolve(status > 0 && status < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}
async function detectDaytonaPortFromLogs(entry) {
    try {
        const logs = await (0, daytona_file_ops_js_1.daytonaGetLogs)(entry.id, 120);
        const matches = [...logs.matchAll(/(?:Local:\s+http:\/\/localhost:|Network:\s+http:\/\/[^\s:]+:)(\d+)/g)];
        for (let i = matches.length - 1; i >= 0; i--) {
            const port = parseInt(matches[i][1], 10);
            if (!DAYTONA_PORT_CANDIDATES.some((candidate) => candidate.port === port)) {
                continue;
            }
            if (await probeDaytonaPort(entry, port, '/@vite/client')) {
                return port;
            }
        }
    }
    catch {
        // Best-effort only.
    }
    return null;
}
async function findReadyDaytonaPort(entry) {
    const preferredPort = await detectDaytonaPortFromLogs(entry);
    const candidatePorts = DAYTONA_PORT_CANDIDATES.map(({ port }) => port);
    const portsToTry = preferredPort
        ? [preferredPort, ...candidatePorts.filter((port) => port !== preferredPort)]
        : candidatePorts;
    for (const port of portsToTry) {
        if (await probeDaytonaPort(entry, port)) {
            return port;
        }
    }
    return null;
}
function getProxySubPath(req) {
    const wildcardPath = req.params?.['0'];
    if (typeof wildcardPath === 'string' && wildcardPath.length > 0) {
        return wildcardPath.replace(/^\/+/, '');
    }
    const requestUrl = typeof req.url === 'string' ? req.url : '';
    const pathOnly = requestUrl.split('?')[0].replace(/^\/+/, '');
    return pathOnly === '/' ? '' : pathOnly;
}
function getQuerySuffix(req) {
    const urlWithQuery = typeof req.originalUrl === 'string' && req.originalUrl.includes('?')
        ? req.originalUrl
        : (typeof req.url === 'string' ? req.url : '');
    const queryStart = urlWithQuery.indexOf('?');
    return queryStart >= 0 ? urlWithQuery.slice(queryStart) : '';
}
// Helper to escape HTML entities
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
/**
 * Recover a Daytona sandbox for a project by querying the Daytona API.
 * Agent-created sandboxes are only in Daytona (not Docker), so we need
 * to look them up separately. Uses the same pattern as the health check.
 */
async function recoverContainerFromDaytona(projectId, containers) {
    if (process.env.USE_DAYTONA_CONTAINERS !== 'true')
        return undefined;
    try {
        const dc = (0, daytona_client_js_1.getDaytonaClient)();
        const sandboxes = await dc.listSandboxes();
        const matches = sandboxes
            .filter((s) => s.labels?.projectId === projectId || s.labels?.id === projectId)
            .sort((a, b) => {
            const aR = a.state === 'started' || a.state === 'running' ? 1 : 0;
            const bR = b.state === 'started' || b.state === 'running' ? 1 : 0;
            if (aR !== bR)
                return bR - aR;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        const match = matches[0];
        if (match) {
            // Default to 8080 (common for file servers in agent sandboxes)
            // The preview route's health check will detect the actual port
            const defaultPort = 8080;
            const previewUrl = dc.getPreviewUrl(match.id, defaultPort);
            const entry = {
                id: match.id,
                port: defaultPort,
                ptyPort: 0,
                lastActive: Date.now(),
                userId: match.labels?.userId,
                daytona: true,
                daytonaPreviewUrl: previewUrl,
            };
            containers.set(projectId, entry);
            console.log(`🔄 [Preview] Recovered Daytona sandbox for ${projectId}: ${match.id} (state: ${match.state})`);
            return entry;
        }
        return undefined;
    }
    catch (err) {
        console.warn(`[Preview] Daytona recovery failed for ${projectId}:`, err.message);
        return undefined;
    }
}
// Friendly preview HTML for build/errors
function friendlyPreviewPage(projectId, message, options = {}) {
    const { showLogs = false, errorDetails = [], canRetry = true } = options;
    const errorSection = errorDetails.length > 0 ? `
    <div class="error-details">
      <p><strong>Error details:</strong></p>
      <pre>${errorDetails.map(e => escapeHtml(e)).join('\n\n')}</pre>
    </div>
  ` : '';
    const logSection = showLogs ? `
    <div class="logs-hint">
      <p><strong>Tip:</strong> Check the terminal/logs for more details.</p>
      <p>Common causes:</p>
      <ul>
        <li>Missing imported files (AI still generating)</li>
        <li>npm install failed</li>
        <li>Build configuration errors</li>
      </ul>
    </div>
  ` : '';
    const retryButton = canRetry ? `<a class="btn" href="#" onclick="window.location.reload();return false">Retry Now</a>` :
        `<a class="btn btn-secondary" href="#" onclick="fetch('/api/dev-server/force-retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: '${projectId}' }) }).then(() => window.location.reload());return false">Force Retry</a>`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Preview Unavailable</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#f7fafc; color:#0f172a; display:flex; align-items:center; justify-content:center; height:100vh; margin:0 }
    .card { max-width:760px; padding:28px; background:white; border-radius:12px; box-shadow:0 8px 24px rgba(15,23,42,0.08) }
    h1 { margin:0 0 8px 0; font-size:20px }
    p { margin:8px 0 0 0; color:#475569 }
    .meta { margin-top:12px; font-size:13px; color:#64748b }
    .btn { margin-top:14px; display:inline-block; padding:8px 12px; background:#0ea5a4; color:white; border-radius:8px; text-decoration:none }
    .logs-hint { margin-top:16px; padding:12px; background:#fef3c7; border-radius:8px; font-size:13px }
    .logs-hint ul { margin:8px 0 0 16px; padding:0; color:#92400e }
    .logs-hint li { margin:4px 0 }
    .spinner { display:inline-block; width:16px; height:16px; border:2px solid #e2e8f0; border-top-color:#0ea5a4; border-radius:50%; animation:spin 1s linear infinite; margin-right:8px; vertical-align:middle }
    @keyframes spin { to { transform:rotate(360deg) } }
    .error-details { margin-top:16px; padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px }
    .error-details pre { margin:8px 0 0 0; font-size:12px; color:#991b1b; white-space:pre-wrap; word-break:break-word; max-height:200px; overflow-y:auto }
    .btn-secondary { background:#64748b }
  </style>
  <script>
    // Auto-refresh every 3 seconds while waiting for dev server
    setTimeout(() => window.location.reload(), 3000);
  </script>
</head>
<body>
  <div class="card">
    <h1><span class="spinner"></span>Preview temporarily unavailable</h1>
    <p>${message}</p>
    ${errorSection}
    ${logSection}
    <div class="meta">Project: <strong>${projectId}</strong></div>
    ${retryButton}
  </div>
</body>
</html>`;
}
// Resolve the host for user project containers.
// When docker-backend runs inside a Docker container, user project containers bind
// their ports to the HOST via docker-proxy (e.g. 0.0.0.0:10001 on the host).
// From inside the container, 127.0.0.1 is the container loopback — NOT the host.
// We must use host.docker.internal to reach the host's docker-proxy port bindings.
// Fall back to 127.0.0.1 for local/non-containerised development.
const PREVIEW_TARGET_HOST = (() => {
    const h = process.env.PREVIEW_TARGET_HOST;
    if (h)
        return h;
    // Auto-detect: if host.docker.internal is resolvable (Docker environment), use it
    // We check at module load time by testing whether we're containerised
    const isDocker = require('fs').existsSync('/.dockerenv');
    return isDocker ? 'host.docker.internal' : '127.0.0.1';
})();
async function checkPort(port) {
    return new Promise((resolve) => {
        const req = http_1.default.get(`http://${PREVIEW_TARGET_HOST}:${port}`, { timeout: 500 }, (res) => {
            resolve(res.statusCode !== undefined);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}
// Cache proxy instances to prevent recreation on every request
const proxyCache = new Map();
// Runtime error capture script to inject into HTML pages
// This captures unhandled errors and sends them to the parent frame
const ERROR_CAPTURE_SCRIPT = `
<script data-recoder-error-handler>
(function() {
  // Send error to parent frame
  function reportError(error) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'recoder:runtime-error',
          message: error.message || String(error),
          stack: error.stack,
          filename: error.filename,
          lineno: error.lineno,
          colno: error.colno
        }, '*');
      }
    } catch (e) {
      console.error('[Recoder] Failed to report error:', e);
    }
  }

  // Capture unhandled errors
  window.onerror = function(message, source, lineno, colno, error) {
    reportError({
      message: message,
      stack: error?.stack,
      filename: source,
      lineno: lineno,
      colno: colno
    });
    // Don't prevent default handling
    return false;
  };

  // Capture unhandled promise rejections
  window.onunhandledrejection = function(event) {
    const error = event.reason;
    reportError({
      message: error?.message || String(error),
      stack: error?.stack
    });
  };

  // Track navigation within the preview
  function reportNavigation() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'recoder:navigate',
          path: window.location.pathname + window.location.search + window.location.hash
        }, window.location.origin);
      }
    } catch (e) {
      console.warn('[Preview] Failed to report navigation:', e);
    }
  }

  // Report initial navigation
  reportNavigation();

  // Listen for popstate (back/forward)
  window.addEventListener('popstate', reportNavigation);

  // Patch history methods to catch programmatic navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    reportNavigation();
  };
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    reportNavigation();
  };
})();
</script>
`;
function setupPreviewProxy(app, containers) {
    app.ws('/preview/:projectId', async (clientWs, req) => {
        const projectId = getValidatedPreviewProjectId(req.params.projectId);
        if (!projectId) {
            clientWs.close(1008, 'Invalid sandbox project ID');
            return;
        }
        let entry = containers.get(projectId);
        if (!entry) {
            entry = await (0, container_recovery_js_1.recoverContainerFromDocker)(docker, projectId, containers);
        }
        if (!entry) {
            entry = await recoverContainerFromDaytona(projectId, containers);
        }
        if (!entry?.id) {
            clientWs.close(1013, 'Preview target not found');
            return;
        }
        const querySuffix = getQuerySuffix(req);
        const upstreamPath = querySuffix ? `/${querySuffix}` : '/';
        const protocolHeader = req.headers['sec-websocket-protocol'];
        const protocols = typeof protocolHeader === 'string'
            ? protocolHeader.split(',').map((value) => value.trim()).filter(Boolean)
            : undefined;
        let upstreamUrl = '';
        let upstreamHeaders;
        if (entry.daytona || entry.daytonaPreviewUrl) {
            try {
                const wakeResult = await (0, daytona_file_ops_js_1.ensureDaytonaSandboxRunning)(entry.id);
                if (!wakeResult.running) {
                    clientWs.close(1013, 'Sandbox is not running');
                    return;
                }
            }
            catch {
                clientWs.close(1013, 'Sandbox wake failed');
                return;
            }
            const targetPort = await findReadyDaytonaPort(entry);
            if (!targetPort) {
                clientWs.close(1013, 'Preview websocket target not ready');
                return;
            }
            entry.port = targetPort;
            const proxyHost = getDaytonaProxyHost();
            const proxyPort = getDaytonaProxyPort();
            const sandboxHost = `${targetPort}-${entry.id}.sandbox.recoder.xyz`;
            upstreamUrl = `ws://${proxyHost}:${proxyPort}${upstreamPath}`;
            upstreamHeaders = { Host: sandboxHost };
        }
        else {
            const basePorts = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
            let targetPort = 0;
            for (const port of basePorts) {
                if (await checkPort(port)) {
                    targetPort = port;
                    break;
                }
            }
            if (!targetPort) {
                clientWs.close(1013, 'Preview websocket target not ready');
                return;
            }
            upstreamUrl = `ws://${PREVIEW_TARGET_HOST}:${targetPort}${upstreamPath}`;
            upstreamHeaders = buildDockerPreviewUpstreamHeaders(targetPort);
        }
        const upstreamWs = protocols?.length
            ? new ws_1.default(upstreamUrl, protocols, { headers: upstreamHeaders })
            : new ws_1.default(upstreamUrl, { headers: upstreamHeaders });
        upstreamWs.on('open', () => {
            console.log(`🔌 [Preview WS] Connected ${projectId} -> ${upstreamUrl}`);
        });
        upstreamWs.on('message', (data, isBinary) => {
            if (clientWs.readyState === ws_1.default.OPEN) {
                clientWs.send(data, { binary: isBinary });
            }
        });
        clientWs.on('message', (data) => {
            if (upstreamWs.readyState === ws_1.default.OPEN) {
                upstreamWs.send(data);
            }
        });
        upstreamWs.on('close', (code, reason) => {
            if (clientWs.readyState === ws_1.default.OPEN || clientWs.readyState === ws_1.default.CONNECTING) {
                clientWs.close(code || 1000, reason.toString() || undefined);
            }
        });
        clientWs.on('close', (code, reason) => {
            if (upstreamWs.readyState === ws_1.default.OPEN || upstreamWs.readyState === ws_1.default.CONNECTING) {
                upstreamWs.close(code || 1000, reason.toString() || undefined);
            }
        });
        upstreamWs.on('error', (error) => {
            console.warn(`[Preview WS] Upstream error for ${projectId}:`, error.message);
            if (clientWs.readyState === ws_1.default.OPEN || clientWs.readyState === ws_1.default.CONNECTING) {
                clientWs.close(1011, 'Preview websocket upstream error');
            }
        });
        clientWs.on('error', (error) => {
            console.warn(`[Preview WS] Client error for ${projectId}:`, error.message);
            if (upstreamWs.readyState === ws_1.default.OPEN || upstreamWs.readyState === ws_1.default.CONNECTING) {
                upstreamWs.close(1001, 'Client disconnected');
            }
        });
    });
    app.use('/preview/:projectId', async (req, res, next) => {
        const projectId = getValidatedPreviewProjectId(req.params.projectId);
        if (!projectId) {
            return res
                .status(404)
                .send(friendlyPreviewPage('invalid-project', 'Invalid preview project ID.'));
        }
        let entry = containers.get(projectId);
        res.removeHeader('Cross-Origin-Embedder-Policy');
        res.removeHeader('Cross-Origin-Opener-Policy');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        if (!entry) {
            console.warn(`[Preview] Request for unknown project: ${projectId}`);
            // Try Docker first, then Daytona (agent-created sandboxes)
            entry = await (0, container_recovery_js_1.recoverContainerFromDocker)(docker, projectId, containers);
            if (!entry) {
                entry = await recoverContainerFromDaytona(projectId, containers);
            }
            if (!entry) {
                return res.status(404).send(friendlyPreviewPage(projectId, 'No running container was found for this project.'));
            }
        }
        else {
            // Update last active time
            entry.lastActive = Date.now();
        }
        // Daytona preview: if container has a Daytona preview URL, try to reach it
        // If the dev server is running, redirect. If not, auto-start it.
        const daytonaUrl = entry.daytonaPreviewUrl;
        const isDaytona = !!entry.daytona || !!daytonaUrl;
        if (daytonaUrl) {
            // Auto-wake: ensure sandbox is running before any exec/health checks.
            // Daytona sandboxes stop after inactivity; this restarts them transparently.
            try {
                const wakeResult = await (0, daytona_file_ops_js_1.ensureDaytonaSandboxRunning)(entry.id);
                if (!wakeResult.running) {
                    console.warn(`[Preview] Sandbox ${entry.id} could not be started: ${wakeResult.error}`);
                    return res.status(503).send(friendlyPreviewPage(projectId, `Sandbox is stopped and could not be restarted: ${wakeResult.error || 'unknown error'}`, { canRetry: true }));
                }
                if (wakeResult.restarted) {
                    console.log(`[Preview] Sandbox ${entry.id} was auto-restarted for preview`);
                }
            }
            catch (wakeErr) {
                console.warn(`[Preview] Auto-wake failed for ${entry.id}:`, wakeErr.message);
            }
            // Quick health check via the internal Daytona proxy.
            // Do not rely on curl existing inside the sandbox.
            const readyPort = await findReadyDaytonaPort(entry);
            const daytonaServerReady = readyPort !== null;
            if (readyPort !== null) {
                const dc = (0, daytona_client_js_1.getDaytonaClient)();
                entry.port = readyPort;
                const daytonaPreviewUrl = dc.getPreviewUrl(entry.id, readyPort);
                let effectivePreviewUrl = daytonaPreviewUrl;
                try {
                    const zrokUpdated = await (0, zrok_preview_js_1.updateShareTarget)(projectId, readyPort);
                    if (zrokUpdated) {
                        effectivePreviewUrl = (0, zrok_preview_js_1.getPreviewUrl)(projectId) ?? daytonaPreviewUrl;
                    }
                }
                catch (zrokErr) {
                    console.warn(`[Preview] Failed to retarget Zrok share for ${projectId}:`, zrokErr?.message || zrokErr);
                }
                if (effectivePreviewUrl !== entry.daytonaPreviewUrl) {
                    entry.daytonaPreviewUrl = effectivePreviewUrl;
                    console.log(`[Preview] Updated preview URL to port ${readyPort}`);
                }
            }
            if (daytonaServerReady) {
                // Proxy inline — no redirect to docker.recoder.xyz (avoids X-Frame-Options cross-origin block)
                console.log(`[Preview] Daytona preview ready, proxying inline for ${projectId}`);
                const subPath = getProxySubPath(req);
                return handleSandboxPreview(req, res, containers, subPath, `/preview/${projectId}`);
            }
            // Dev server not running — try to auto-start
            console.log(`[Preview] Daytona dev server not ready for ${projectId}, attempting auto-start...`);
            const now = Date.now();
            const lastAttempt = autoStartAttempts.get(projectId) || 0;
            if (now - lastAttempt > AUTO_START_COOLDOWN_MS && !dev_server_js_1.devServerManager.isRunning(projectId)) {
                autoStartAttempts.set(projectId, now);
                try {
                    await ensureDependencies(entry.id, projectId, true);
                    const framework = await detectFramework(entry.id, true);
                    console.log(`[Preview] Auto-starting Daytona dev server for ${projectId} (${framework})`);
                    const ports = [5173, 3000, 3001, 3004, 3005, 3002]; // Vite (5173) first, then standard ports
                    await dev_server_js_1.devServerManager.start(entry.id, projectId, framework, ports, {
                        daytona: true,
                        daytonaPreviewUrl: daytonaUrl,
                    });
                }
                catch (err) {
                    console.warn(`[Preview] Daytona auto-start failed for ${projectId}:`, err);
                }
            }
            // Show building page — auto-refreshes until server is ready
            const errorInfo = dev_server_js_1.devServerManager.getErrorInfo(projectId);
            return res.status(503).send(friendlyPreviewPage(projectId, 'The preview server is starting. This page will auto-refresh when ready.', { showLogs: true, errorDetails: errorInfo.errors, canRetry: true }));
        }
        // Check ports in order: Vite (5173), Next.js (3000), Expo (8081), Expo legacy (19006), Other (8080)
        const basePorts = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
        let targetPort = 0;
        console.log(`Checking ports for ${projectId}: ${basePorts.join(', ')}`);
        for (const port of basePorts) {
            if (await checkPort(port)) {
                targetPort = port;
                console.log(`Found dev server on port ${port}`);
                break;
            }
        }
        if (!targetPort) {
            console.log(`No dev server found on any port for ${projectId}`);
            // Get error info from dev server manager
            const errorInfo = dev_server_js_1.devServerManager.getErrorInfo(projectId);
            const { retryState } = errorInfo;
            const now = Date.now();
            const lastAttempt = autoStartAttempts.get(projectId) || 0;
            if (now - lastAttempt > AUTO_START_COOLDOWN_MS && !dev_server_js_1.devServerManager.isRunning(projectId)) {
                autoStartAttempts.set(projectId, now);
                try {
                    await ensureDependencies(entry.id, projectId, false);
                    const framework = await detectFramework(entry.id, false);
                    console.log(`[Preview] Auto-starting dev server for ${projectId} (${framework})`);
                    await dev_server_js_1.devServerManager.start(entry.id, projectId, framework, basePorts);
                }
                catch (err) {
                    console.warn(`[Preview] Auto-start failed for ${projectId}:`, err);
                }
            }
            // Determine the message based on retry state
            let message = 'The preview server is starting. This page will auto-refresh when ready.';
            if (errorInfo.hasErrors) {
                if (!retryState.canRetry && retryState.errorCount >= retryState.maxRetries) {
                    message = `Build failed after ${retryState.maxRetries} attempts. Click "Force Retry" or make a file change to try again.`;
                }
                else if (retryState.nextRetryIn) {
                    message = `Build error detected. Retrying in ${Math.ceil(retryState.nextRetryIn / 1000)}s...`;
                }
                else {
                    message = 'Build error detected. Attempting to recover...';
                }
            }
            // Show a friendly building page with helpful hints - the page auto-refreshes
            return res.status(503).send(friendlyPreviewPage(projectId, message, {
                showLogs: true,
                errorDetails: errorInfo.errors,
                canRetry: retryState.canRetry,
            }));
        }
        // 🔧 FIX: Cache proxy instance per projectId+port to prevent recreation
        const cacheKey = `${projectId}:${targetPort}`;
        let proxy = proxyCache.get(cacheKey);
        if (!proxy) {
            console.log(`📦 Creating new proxy for ${projectId} targeting port ${targetPort} via ${PREVIEW_TARGET_HOST}`);
            proxy = (0, http_proxy_middleware_1.createProxyMiddleware)({
                target: `http://${PREVIEW_TARGET_HOST}:${targetPort}`,
                changeOrigin: true,
                pathRewrite: { [`^/preview/${projectId}`]: '' },
                // ws: false — WebSocket upgrades for /preview/ are handled by the dedicated
                // app.ws('/preview/:projectId') handler above. Enabling ws:true here causes
                // http-proxy-middleware to hook into the server-level 'upgrade' event and
                // intercept unrelated WebSocket paths (/watch/, /build-errors/, /terminal/),
                // producing "Invalid frame header" errors when the proxy target is undefined.
                ws: false,
                selfHandleResponse: true, // We'll handle the response to inject <base> tag
                onProxyReq: (proxyReq) => {
                    const upstreamHeaders = buildDockerPreviewUpstreamHeaders(targetPort);
                    for (const [key, value] of Object.entries(upstreamHeaders)) {
                        proxyReq.setHeader(key, value);
                    }
                },
                onProxyRes: (proxyRes, req, res) => {
                    delete proxyRes.headers['cross-origin-embedder-policy'];
                    delete proxyRes.headers['cross-origin-opener-policy'];
                    proxyRes.headers['cross-origin-resource-policy'] = 'cross-origin';
                    proxyRes.headers['x-frame-options'] = 'ALLOWALL';
                    // If upstream returned a 5xx, respond with a friendly page instead of leaking stack traces
                    const upstreamStatus = proxyRes.statusCode || 0;
                    if (upstreamStatus >= 500) {
                        console.log(`⚠️ Upstream returned ${upstreamStatus} for ${projectId}. Serving friendly error page.`);
                        // Drain upstream body and send friendly HTML
                        let errorBody = '';
                        proxyRes.on('data', (chunk) => { errorBody += chunk.toString(); });
                        proxyRes.on('end', () => {
                            // Check for common Vite errors
                            let errorMessage = 'The application failed to build or crashed during startup.';
                            if (errorBody.includes('Failed to resolve import')) {
                                const importMatch = errorBody.match(/Failed to resolve import "([^"]+)"/);
                                const importPath = importMatch ? importMatch[1] : 'unknown';
                                errorMessage = `Missing file: ${importPath}. The AI may still be generating files. Wait a moment and retry.`;
                                console.log(`❌ [Preview] Vite error - missing import: ${importPath}`);
                            }
                            else if (errorBody.includes('ENOENT')) {
                                errorMessage = 'Some files are missing. The AI may still be generating the project.';
                            }
                            const html = friendlyPreviewPage(projectId, errorMessage, { showLogs: true });
                            res.setHeader('Content-Type', 'text/html; charset=utf-8');
                            res.setHeader('Content-Length', Buffer.byteLength(html));
                            res.statusCode = 502;
                            res.end(html);
                        });
                        return;
                    }
                    // Check if this is an HTML or JavaScript response that needs rewriting
                    const contentType = proxyRes.headers['content-type'] || '';
                    const isHtml = contentType.includes('text/html');
                    const isJavaScript = contentType.includes('javascript') || contentType.includes('ecmascript') ||
                        req.url?.endsWith('.js') || req.url?.endsWith('.jsx') ||
                        req.url?.endsWith('.mjs') || req.url?.endsWith('.ts') ||
                        req.url?.endsWith('.tsx');
                    if (isHtml || isJavaScript) {
                        // Rewrite HTML/JavaScript to fix absolute paths (Vite uses paths like /@vite/client)
                        const fileType = isHtml ? 'HTML' : 'JavaScript';
                        console.log(`🔧 [${fileType} Rewrite] Intercepting ${fileType} for ${projectId} - URL: ${req.url}`);
                        let body = '';
                        proxyRes.on('data', (chunk) => {
                            body += chunk.toString();
                        });
                        proxyRes.on('end', () => {
                            console.log(`📄 [${fileType} Rewrite] Original length: ${body.length} chars`);
                            const requestPath = typeof req.url === 'string'
                                ? req.url.split('?')[0].replace(/^\/+/, '')
                                : '';
                            const modifiedBody = (0, preview_rewrite_js_1.rewritePreviewBody)(body, {
                                proxyPrefix: `/preview/${projectId}`,
                                contentType,
                                requestPath,
                                errorCaptureScript: ERROR_CAPTURE_SCRIPT,
                            });
                            const changed = body !== modifiedBody;
                            console.log(`✅ [${fileType} Rewrite] Modified length: ${modifiedBody.length} chars - Changes: ${changed ? 'YES' : 'NO'}`);
                            if (isHtml && changed && modifiedBody.includes('<base ')) {
                                console.log(`🧭 [HTML Rewrite] Injected preview base tag for ${projectId}`);
                            }
                            if (changed && modifiedBody.length < 1000) {
                                console.log(`✅ [${fileType} Rewrite] Modified content:`, modifiedBody);
                            }
                            // Update Content-Length header
                            res.setHeader('Content-Length', Buffer.byteLength(modifiedBody));
                            // Copy all headers
                            Object.keys(proxyRes.headers).forEach((key) => {
                                if (key !== 'content-length') {
                                    const value = proxyRes.headers[key];
                                    if (value)
                                        res.setHeader(key, value);
                                }
                            });
                            res.statusCode = proxyRes.statusCode || 200;
                            res.end(modifiedBody);
                        });
                    }
                    else {
                        // For non-HTML, just pipe through
                        const reqPath = req.path || req.url;
                        const contentType = proxyRes.headers['content-type'];
                        console.log(`📦 [Asset] Serving ${reqPath} - Content-Type: ${contentType || 'NONE'} - Status: ${proxyRes.statusCode}`);
                        Object.keys(proxyRes.headers).forEach((key) => {
                            const value = proxyRes.headers[key];
                            if (value)
                                res.setHeader(key, value);
                        });
                        // If upstream returns a 5xx for an asset (rare), show friendly page
                        if ((proxyRes.statusCode || 0) >= 500) {
                            proxyRes.on('data', () => { });
                            proxyRes.on('end', () => {
                                const html = friendlyPreviewPage(projectId, 'The application returned an error while serving an asset.');
                                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                                res.setHeader('Content-Length', Buffer.byteLength(html));
                                res.statusCode = 502;
                                res.end(html);
                            });
                            return;
                        }
                        res.statusCode = proxyRes.statusCode || 200;
                        proxyRes.pipe(res);
                    }
                },
                onError: () => res.status(204).end(),
            });
            // Store proxy in cache
            proxyCache.set(cacheKey, proxy);
            console.log(`✅ Proxy cached for ${cacheKey}`);
        }
        else {
            console.log(`♻️ Reusing cached proxy for ${cacheKey}`);
        }
        return proxy(req, res, next);
    });
    // Helper: proxy request to Daytona sandbox dev server port
    async function handleSandboxPreview(req, res, containers, subPath, proxyPrefix) {
        const projectId = req.params.projectId;
        let entry = containers.get(projectId);
        if (!entry) {
            entry = await (0, container_recovery_js_1.recoverContainerFromDocker)(docker, projectId, containers);
        }
        if (!entry) {
            entry = await recoverContainerFromDaytona(projectId, containers);
        }
        if (!entry?.id) {
            return res.status(404).send('<h1>Sandbox not found</h1><p>The preview container is not running.</p>');
        }
        try {
            const port = entry.port || 5173;
            // Use internal Daytona proxy (port 4000) for sandbox preview — avoids going through public internet
            // The Daytona proxy handles {port}-{sandboxId} routing internally, same as *.sandbox.recoder.xyz
            // Use Node http.request instead of fetch — fetch may silently override Host header
            const proxyHost = getDaytonaProxyHost();
            const proxyPort = getDaytonaProxyPort();
            const sandboxHost = `${port}-${entry.id}.sandbox.recoder.xyz`;
            const querySuffix = getQuerySuffix(req);
            const normalizedSubPath = (subPath || '').replace(/^\/+/, '');
            const requestPath = normalizedSubPath ? `/${normalizedSubPath}${querySuffix}` : `/${querySuffix}`;
            console.log(`[SandboxPreview] Proxying: ${proxyHost}:${proxyPort}${requestPath} Host: ${sandboxHost}`);
            const http = await Promise.resolve().then(() => __importStar(require('http')));
            const proxyResult = await new Promise((resolve, reject) => {
                const proxyReq = http.request({
                    hostname: proxyHost,
                    port: proxyPort,
                    path: requestPath,
                    method: req.method,
                    headers: {
                        'Host': sandboxHost,
                        'Accept': req.headers.accept || '*/*',
                    },
                }, (proxyRes) => {
                    const chunks = [];
                    proxyRes.on('data', (chunk) => chunks.push(chunk));
                    proxyRes.on('end', () => {
                        const headers = {};
                        for (const [k, v] of Object.entries(proxyRes.headers)) {
                            if (typeof v === 'string')
                                headers[k] = v;
                        }
                        resolve({ status: proxyRes.statusCode || 502, headers, body: Buffer.concat(chunks) });
                    });
                });
                proxyReq.on('error', reject);
                proxyReq.setTimeout(15000, () => { proxyReq.destroy(); reject(new Error('Proxy timeout')); });
                proxyReq.end();
            });
            res.status(proxyResult.status);
            const contentType = proxyResult.headers['content-type'] || '';
            const responseBody = (0, preview_rewrite_js_1.shouldRewritePreviewBody)(contentType, normalizedSubPath)
                ? Buffer.from((0, preview_rewrite_js_1.rewritePreviewBody)(proxyResult.body.toString('utf8'), {
                    proxyPrefix,
                    contentType,
                    requestPath: normalizedSubPath,
                    errorCaptureScript: ERROR_CAPTURE_SCRIPT,
                }), 'utf8')
                : proxyResult.body;
            for (const [key, value] of Object.entries(proxyResult.headers)) {
                if (!value)
                    continue;
                if (['content-length', 'x-frame-options', 'content-security-policy', 'cross-origin-embedder-policy', 'cross-origin-opener-policy'].includes(key)) {
                    continue;
                }
                res.setHeader(key, value);
            }
            if (contentType)
                res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', Buffer.byteLength(responseBody));
            res.removeHeader('X-Frame-Options');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(responseBody);
        }
        catch (e) {
            console.error(`[SandboxPreview] Proxy error for ${projectId}:`, e.message);
            res.status(502).send(`<h1>Preview unavailable</h1><p>${e.message}</p>`);
        }
    }
    app.get('/api/preview/:projectId/url', async (req, res) => {
        const projectId = getValidatedPreviewProjectId(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ error: 'Invalid sandbox project ID' });
        }
        let entry = containers.get(projectId);
        if (!entry) {
            entry = await (0, container_recovery_js_1.recoverContainerFromDocker)(docker, projectId, containers);
        }
        // For Daytona sandboxes, proxy through docker-backend instead of using
        // the external *.sandbox.recoder.xyz URL — avoids needing wildcard SSL cert
        const daytonaUrl = entry?.daytonaPreviewUrl;
        if (daytonaUrl) {
            // Return a docker.recoder.xyz proxy URL that we handle internally
            const dockerUrl = process.env.DOCKER_PUBLIC_URL || 'https://docker.recoder.xyz';
            const proxyUrl = `${dockerUrl}/api/sandbox-preview/${projectId}`;
            return res.json({ url: proxyUrl, port: entry?.port || 3000, daytona: true });
        }
        const port = entry?.port || 0;
        const baseUrl = process.env.PUBLIC_URL || `https://web.recoder.xyz`;
        res.json({ url: `${baseUrl}/preview/${projectId}`, port });
    });
    // Sandbox preview proxy — forwards requests to Daytona sandbox dev server
    // This avoids needing *.sandbox.recoder.xyz wildcard SSL cert.
    // Uses Daytona port-forward via toolbox API.
    app.all('/api/sandbox-preview/:projectId', async (req, res) => {
        const projectId = getValidatedPreviewProjectId(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ error: 'Invalid sandbox project ID' });
        }
        return handleSandboxPreview(req, res, containers, '', `/api/sandbox-preview/${projectId}`);
    });
    app.all('/api/sandbox-preview/:projectId/*', async (req, res) => {
        const projectId = getValidatedPreviewProjectId(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ error: 'Invalid sandbox project ID' });
        }
        const subPath = getProxySubPath(req);
        return handleSandboxPreview(req, res, containers, subPath, `/api/sandbox-preview/${projectId}`);
    });
    // Health check - shows which ports are responding
    app.get('/api/preview/:projectId/health', async (req, res) => {
        const projectId = getValidatedPreviewProjectId(req.params.projectId);
        if (!projectId) {
            return res.status(400).json({ error: 'Invalid sandbox project ID' });
        }
        let entry = containers.get(projectId);
        if (!entry) {
            // Try Docker recovery first, then Daytona recovery
            entry = await (0, container_recovery_js_1.recoverContainerFromDocker)(docker, projectId, containers);
            if (!entry && process.env.USE_DAYTONA_CONTAINERS === 'true') {
                try {
                    const dc = (0, daytona_client_js_1.getDaytonaClient)();
                    const sandboxes = await dc.listSandboxes();
                    const matches = sandboxes
                        .filter((s) => s.labels?.projectId === projectId)
                        .sort((a, b) => {
                        const aR = a.state === 'started' || a.state === 'running' ? 1 : 0;
                        const bR = b.state === 'started' || b.state === 'running' ? 1 : 0;
                        if (aR !== bR)
                            return bR - aR;
                        return (b.createdAt || '').localeCompare(a.createdAt || '');
                    });
                    const match = matches[0];
                    if (match) {
                        const previewUrl = dc.getPreviewUrl(match.id, 5173);
                        entry = {
                            id: match.id,
                            port: 5173,
                            ptyPort: 0,
                            lastActive: Date.now(),
                            userId: match.labels?.userId,
                            daytona: true,
                            daytonaPreviewUrl: previewUrl,
                        };
                        containers.set(projectId, entry);
                    }
                }
                catch (e) {
                    // Daytona recovery failed, continue to 404
                }
            }
        }
        if (!entry) {
            return res.status(404).json({ error: 'Container not found' });
        }
        // For Daytona sandboxes, ensure sandbox is running before checking ports
        if (entry?.daytona) {
            try {
                const dc = (0, daytona_client_js_1.getDaytonaClient)();
                await dc.getOrStartSandbox(entry.id, 15000);
            }
            catch {
                // Non-fatal — sandbox may already be running or start may timeout
            }
        }
        // For Daytona sandboxes, check multiple common dev server ports via internal curl
        // Probe through the Daytona proxy instead of relying on curl inside the sandbox.
        const daytonaUrl = entry?.daytonaPreviewUrl;
        if (daytonaUrl) {
            // Extract sandboxId from preview URL pattern: https://{port}-{sandboxId}.sandbox.recoder.xyz
            const urlMatch = daytonaUrl.match(/^https?:\/\/\d+-([^.]+)\./);
            const sandboxId = urlMatch?.[1] || entry.id;
            const portResults = await Promise.all(DAYTONA_PORT_CANDIDATES.map(async ({ port, type }) => {
                const responding = await probeDaytonaPort(entry, port);
                return { port, responding, type, url: `https://${port}-${sandboxId}.sandbox.recoder.xyz` };
            }));
            const preferredPort = await detectDaytonaPortFromLogs(entry);
            const respondingResult = (preferredPort !== null
                ? portResults.find((result) => result.port === preferredPort && result.responding)
                : undefined) || portResults.find((result) => result.responding);
            const effectivePreviewUrl = respondingResult?.url || daytonaUrl;
            if (respondingResult) {
                entry.port = respondingResult.port;
            }
            if (respondingResult && effectivePreviewUrl !== daytonaUrl) {
                entry.daytonaPreviewUrl = effectivePreviewUrl;
            }
            return res.json({
                projectId,
                daytona: true,
                previewUrl: effectivePreviewUrl,
                ports: portResults.map(({ port, responding, type }) => ({ port, responding, type })),
            });
        }
        const basePorts = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
        const portStatus = await Promise.all(basePorts.map(async (port) => ({
            port,
            responding: await checkPort(port),
            type: port === entry.port + 1 ? 'Vite (5173)' :
                port === entry.port ? 'Next.js (3000)' :
                    port === entry.port + 4 ? 'Expo (8081)' :
                        port === entry.port + 5 ? 'Expo Web (19006)' :
                            'Other (8080)'
        })));
        res.json({ projectId, ports: portStatus });
    });
    // New: Read-only logs endpoint - returns last N lines of the project's container logs
    app.get('/api/preview/:projectId/logs', async (req, res) => {
        const projectId = getValidatedPreviewProjectId(req.params.projectId);
        if (!projectId) {
            console.warn(`⚠️ [Preview Logs] Invalid projectId received: "${req.params.projectId}" from ${req.ip || req.socket?.remoteAddress}`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.status(400).json({
                error: 'Invalid project ID',
                message: 'Project ID must be a sandbox project ID.'
            });
        }
        let entry = containers.get(projectId);
        if (!entry) {
            // Try to recover from Docker
            console.log(`⚠️ [Preview Logs] Container not in memory for ${projectId}, attempting recovery...`);
            entry = await (0, container_recovery_js_1.recoverContainerFromDocker)(docker, projectId, containers);
        }
        if (!entry) {
            console.warn(`⚠️ [Preview Logs] No container entry for projectId: ${projectId}`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.status(404).json({
                error: 'Container not found',
                message: `No container found for project: ${projectId}`
            });
        }
        // Parse and bound the tail parameter
        const MAX_TAIL = 5000;
        let tail = parseInt(String(req.query.tail || '200'), 10);
        if (Number.isNaN(tail) || tail < 0)
            tail = 200;
        if (tail > MAX_TAIL)
            tail = MAX_TAIL;
        try {
            const containerId = entry.id;
            if (!containerId) {
                console.warn(`⚠️ [Preview Logs] Missing container id for projectId: ${projectId}`);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return res.status(404).json({ error: 'Container id missing for project' });
            }
            const container = docker.getContainer(containerId);
            // Request logs without following; dockerode may return Buffer or Stream depending on options/runtime
            const opts = { stdout: true, stderr: true, tail, timestamps: true };
            const logsResult = await container.logs(opts);
            let logs = '';
            // If we got a Buffer-like object
            if (Buffer.isBuffer(logsResult)) {
                logs = logsResult.toString('utf8');
            }
            else if (typeof logsResult === 'string') {
                logs = logsResult;
            }
            else if (logsResult && typeof logsResult.pipe === 'function') {
                // Collect stream data
                logs = '';
                await new Promise((resolve, reject) => {
                    logsResult.on('data', (chunk) => { logs += chunk?.toString?.('utf8') ?? String(chunk); });
                    logsResult.on('end', () => resolve());
                    logsResult.on('error', (err) => reject(err));
                });
            }
            else {
                logs = String(logsResult || '');
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.json({ projectId, containerId, tail, logs });
        }
        catch (err) {
            console.error(`❌ [Preview Logs] Error fetching container logs for ${projectId}:`, err);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.status(500).json({ error: 'Failed to fetch logs', details: String(err) });
        }
    });
}
