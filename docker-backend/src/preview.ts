/**
 * Preview Proxy - Routes preview URLs to container dev servers
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Express } from 'express';
import http from 'http';
import Docker from 'dockerode';
import { devServerManager } from './dev-server.js';
import { getDaytonaClient } from './daytona-client.js';
import { ensureDaytonaSandboxRunning } from './daytona-file-ops.js';

const docker = new Docker();
const autoStartAttempts = new Map<string, number>();
const autoInstallAttempts = new Map<string, number>();
const AUTO_START_COOLDOWN_MS = 10000;
const AUTO_INSTALL_COOLDOWN_MS = 60000;

async function execInContainer(containerId: string, cmd: string): Promise<string> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['/bin/bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});
  return await new Promise<string>((resolve, reject) => {
    let out = '';
    stream.on('data', (chunk: Buffer) => { out += chunk.slice(8).toString(); });
    stream.on('end', () => resolve(out.trim()));
    stream.on('error', reject);
  });
}

async function detectFramework(containerId: string, isDaytona?: boolean): Promise<string> {
  try {
    let pkgRaw: string;
    if (isDaytona) {
      const dc = getDaytonaClient();
      const result = await dc.execCommand(containerId, 'cat /home/daytona/package.json 2>/dev/null || echo ""', { timeoutSecs: 10 });
      pkgRaw = result.output;
    } else {
      pkgRaw = await execInContainer(containerId, 'cat /workspace/package.json 2>/dev/null || echo ""');
    }
    if (!pkgRaw) return 'vite';
    let pkg: Record<string, any>;
    try {
      pkg = JSON.parse(pkgRaw);
    } catch {
      return 'vite';
    }
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.next || pkg.scripts?.dev?.includes('next')) return 'next';
    if (deps.vite || pkg.scripts?.dev?.includes('vite')) return 'vite';
    if (deps.react) return 'react';
  } catch {
    // ignore
  }
  return 'vite';
}

async function ensureDependencies(containerId: string, projectId: string, isDaytona?: boolean): Promise<void> {
  const now = Date.now();
  const lastInstall = autoInstallAttempts.get(projectId) || 0;
  if (now - lastInstall < AUTO_INSTALL_COOLDOWN_MS) {
    return;
  }

  if (isDaytona) {
    const dc = getDaytonaClient();
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
    await dc.execCommand(
      containerId,
      'cd /home/daytona && npm install --legacy-peer-deps --no-audit --no-fund',
      { timeoutSecs: 120 }
    );
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
  await execInContainer(
    containerId,
    'cd /workspace && npm install --legacy-peer-deps --no-audit --no-fund'
  );
}

// Helper to escape HTML entities
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Try to recover container info from Docker API if not in memory.
 * This helps when the backend restarts but containers are still running.
 */
async function recoverContainerFromDocker(
  projectId: string,
  containers: Map<string, { id: string; lastActive: number; port: number; ptyPort?: number }>
): Promise<{ id: string; lastActive: number; port: number } | undefined> {
  try {
    // Look for containers with our naming pattern
    const allContainers = await docker.listContainers({ all: false }); // only running
    
    for (const containerInfo of allContainers) {
      // Check if this container has bindings for a recoder volume with this projectId
      const names = containerInfo.Names || [];
      const volumes = Object.keys(containerInfo.Mounts?.reduce((acc: any, m: any) => {
        if (m.Name) acc[m.Name] = true;
        return acc;
      }, {}) || {});
      
      // Check if any volume matches our projectId pattern
      const hasProjectVolume = volumes.some(v => v.includes(`recoder-${projectId}`));
      
      if (hasProjectVolume) {
        // Found a matching container! Extract port mappings
        const ports = containerInfo.Ports || [];
        let port3000Host = 0;
        let port5173Host = 0;
        let port8080Host = 0;
        let port9999Host = 0;
        
        for (const p of ports) {
          if (p.PrivatePort === 3000 && p.PublicPort) port3000Host = p.PublicPort;
          if (p.PrivatePort === 5173 && p.PublicPort) port5173Host = p.PublicPort;
          if (p.PrivatePort === 8080 && p.PublicPort) port8080Host = p.PublicPort;
          if (p.PrivatePort === 9999 && p.PublicPort) port9999Host = p.PublicPort;
        }
        
        // The "port" in our schema is the base port (mapped to 3000)
        // Parentheses needed: without them, `port5173Host - 1` evaluates to -1 when port5173Host is 0 (truthy!)
        const basePort = port3000Host || (port5173Host ? port5173Host - 1 : 0) || (port8080Host ? port8080Host - 2 : 0);
        
        if (basePort > 0) {
          const recovered = {
            id: containerInfo.Id,
            lastActive: Date.now(),
            port: basePort,
            ptyPort: port9999Host || basePort + 3
          };
          
          console.log(`🔄 [Preview] Recovered container for ${projectId}: ${containerInfo.Id.slice(0, 12)} (port: ${basePort})`);
          containers.set(projectId, recovered);
          return recovered;
        }
      }
    }
    
    console.log(`❌ [Preview] No running container found for ${projectId} in Docker`);
    return undefined;
  } catch (err) {
    console.error(`❌ [Preview] Error recovering container for ${projectId}:`, err);
    return undefined;
  }
}

/**
 * Recover a Daytona sandbox for a project by querying the Daytona API.
 * Agent-created sandboxes are only in Daytona (not Docker), so we need
 * to look them up separately. Uses the same pattern as the health check.
 */
async function recoverContainerFromDaytona(
  projectId: string,
  containers: Map<string, any>
): Promise<any | undefined> {
  if (process.env.USE_DAYTONA_CONTAINERS !== 'true') return undefined;
  try {
    const dc = getDaytonaClient();
    const sandboxes = await dc.listSandboxes();
    const matches = sandboxes
      .filter((s: any) => s.labels?.projectId === projectId || s.labels?.id === projectId)
      .sort((a: any, b: any) => {
        const aR = a.state === 'started' || a.state === 'running' ? 1 : 0;
        const bR = b.state === 'started' || b.state === 'running' ? 1 : 0;
        if (aR !== bR) return bR - aR;
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
        daytona: true,
        daytonaPreviewUrl: previewUrl,
      } as any;
      containers.set(projectId, entry);
      console.log(`🔄 [Preview] Recovered Daytona sandbox for ${projectId}: ${match.id} (state: ${match.state})`);
      return entry;
    }
    return undefined;
  } catch (err) {
    console.warn(`[Preview] Daytona recovery failed for ${projectId}:`, (err as any).message);
    return undefined;
  }
}

// Friendly preview HTML for build/errors
function friendlyPreviewPage(projectId: string, message: string, options: { showLogs?: boolean; errorDetails?: string[]; canRetry?: boolean } = {}) {
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
  if (h) return h;
  // Auto-detect: if host.docker.internal is resolvable (Docker environment), use it
  // We check at module load time by testing whether we're containerised
  const isDocker = require('fs').existsSync('/.dockerenv');
  return isDocker ? 'host.docker.internal' : '127.0.0.1';
})();

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${PREVIEW_TARGET_HOST}:${port}`, { timeout: 500 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Cache proxy instances to prevent recreation on every request
const proxyCache = new Map<string, any>();

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

export function setupPreviewProxy(app: Express, containers: Map<string, { id: string; lastActive: number; port: number }>) {

  app.use('/preview/:projectId', async (req, res, next) => {
    const { projectId } = req.params;
    let entry = containers.get(projectId);

    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    if (!entry) {
      console.warn(`[Preview] Request for unknown project: ${projectId}`);
      // Try Docker first, then Daytona (agent-created sandboxes)
      entry = await recoverContainerFromDocker(projectId, containers);
      if (!entry) {
        entry = await recoverContainerFromDaytona(projectId, containers);
      }
      if (!entry) {
        return res.status(404).send(friendlyPreviewPage(projectId, 'No running container was found for this project.'));
      }
    } else {
      // Update last active time
      entry.lastActive = Date.now();
    }

    // Daytona preview: if container has a Daytona preview URL, try to reach it
    // If the dev server is running, redirect. If not, auto-start it.
    const daytonaUrl = (entry as any).daytonaPreviewUrl;
    const isDaytona = !!(entry as any).daytona || !!daytonaUrl;
    if (daytonaUrl) {
      // Auto-wake: ensure sandbox is running before any exec/health checks.
      // Daytona sandboxes stop after inactivity; this restarts them transparently.
      try {
        const wakeResult = await ensureDaytonaSandboxRunning(entry.id);
        if (!wakeResult.running) {
          console.warn(`[Preview] Sandbox ${entry.id} could not be started: ${wakeResult.error}`);
          return res.status(503).send(friendlyPreviewPage(
            projectId,
            `Sandbox is stopped and could not be restarted: ${wakeResult.error || 'unknown error'}`,
            { canRetry: true }
          ));
        }
        if (wakeResult.restarted) {
          console.log(`[Preview] Sandbox ${entry.id} was auto-restarted for preview`);
        }
      } catch (wakeErr: any) {
        console.warn(`[Preview] Auto-wake failed for ${entry.id}:`, wakeErr.message);
      }

      // Quick health check via internal curl (avoids OIDC redirect issues)
      let daytonaServerReady = false;
      try {
        const dc = getDaytonaClient();
        const curlResult = await dc.execCommand(
          entry.id,
          'for p in 5173 5174 5175 5176 5177 5178 5179 5180 4173 4174 3000 3001 8080 8081; do curl -sf http://localhost:$p > /dev/null 2>&1 && echo "READY:$p" && exit 0; done; echo "NOTREADY"',
          { timeoutSecs: 8 },
        );
        const readyMatch = curlResult.output.match(/READY:(\d+)/);
        daytonaServerReady = !!readyMatch;
        if (readyMatch) {
          const detectedPort = parseInt(readyMatch[1], 10);
          // Update BOTH the preview URL and the port on the entry
          entry.port = detectedPort;
          const newPreviewUrl = dc.getPreviewUrl(entry.id, detectedPort);
          if (newPreviewUrl !== (entry as any).daytonaPreviewUrl) {
            (entry as any).daytonaPreviewUrl = newPreviewUrl;
            console.log(`[Preview] Updated Daytona preview URL to port ${detectedPort}`);
          }
        }
      } catch {
        // exec failed — sandbox may be stopped or unreachable
      }

      if (daytonaServerReady) {
        // Proxy inline — no redirect to docker.recoder.xyz (avoids X-Frame-Options cross-origin block)
        console.log(`[Preview] Daytona preview ready, proxying inline for ${projectId}`);
        return handleSandboxPreview(req, res, containers, '');
      }

      // Dev server not running — try to auto-start
      console.log(`[Preview] Daytona dev server not ready for ${projectId}, attempting auto-start...`);
      const now = Date.now();
      const lastAttempt = autoStartAttempts.get(projectId) || 0;
      if (now - lastAttempt > AUTO_START_COOLDOWN_MS && !devServerManager.isRunning(projectId)) {
        autoStartAttempts.set(projectId, now);
        try {
          await ensureDependencies(entry.id, projectId, true);
          const framework = await detectFramework(entry.id, true);
          console.log(`[Preview] Auto-starting Daytona dev server for ${projectId} (${framework})`);
          const ports = [5173, 3000, 3001, 3004, 3005, 3002]; // Vite (5173) first, then standard ports
          await devServerManager.start(entry.id, projectId, framework, ports, {
            daytona: true,
            daytonaPreviewUrl: daytonaUrl,
          });
        } catch (err) {
          console.warn(`[Preview] Daytona auto-start failed for ${projectId}:`, err);
        }
      }

      // Show building page — auto-refreshes until server is ready
      const errorInfo = devServerManager.getErrorInfo(projectId);
      return res.status(503).send(friendlyPreviewPage(
        projectId,
        'The preview server is starting. This page will auto-refresh when ready.',
        { showLogs: true, errorDetails: errorInfo.errors, canRetry: true }
      ));
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
      const errorInfo = devServerManager.getErrorInfo(projectId);
      const { retryState } = errorInfo;

      const now = Date.now();
      const lastAttempt = autoStartAttempts.get(projectId) || 0;
      if (now - lastAttempt > AUTO_START_COOLDOWN_MS && !devServerManager.isRunning(projectId)) {
        autoStartAttempts.set(projectId, now);
        try {
          await ensureDependencies(entry.id, projectId, false);
          const framework = await detectFramework(entry.id, false);
          console.log(`[Preview] Auto-starting dev server for ${projectId} (${framework})`);
          await devServerManager.start(entry.id, projectId, framework, basePorts);
        } catch (err) {
          console.warn(`[Preview] Auto-start failed for ${projectId}:`, err);
        }
      }

      // Determine the message based on retry state
      let message = 'The preview server is starting. This page will auto-refresh when ready.';
      if (errorInfo.hasErrors) {
        if (!retryState.canRetry && retryState.errorCount >= retryState.maxRetries) {
          message = `Build failed after ${retryState.maxRetries} attempts. Click "Force Retry" or make a file change to try again.`;
        } else if (retryState.nextRetryIn) {
          message = `Build error detected. Retrying in ${Math.ceil(retryState.nextRetryIn / 1000)}s...`;
        } else {
          message = 'Build error detected. Attempting to recover...';
        }
      }

      // Show a friendly building page with helpful hints - the page auto-refreshes
      return res.status(503).send(friendlyPreviewPage(
        projectId,
        message,
        {
          showLogs: true,
          errorDetails: errorInfo.errors,
          canRetry: retryState.canRetry,
        }
      ));
    }

    // 🔧 FIX: Cache proxy instance per projectId+port to prevent recreation
    const cacheKey = `${projectId}:${targetPort}`;
    let proxy = proxyCache.get(cacheKey);

    if (!proxy) {
      console.log(`📦 Creating new proxy for ${projectId} targeting port ${targetPort} via ${PREVIEW_TARGET_HOST}`);
      proxy = createProxyMiddleware({
        target: `http://${PREVIEW_TARGET_HOST}:${targetPort}`,
        changeOrigin: true,
        pathRewrite: { [`^/preview/${projectId}`]: '' },
        ws: true,
        selfHandleResponse: true, // We'll handle the response to inject <base> tag
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
              } else if (errorBody.includes('ENOENT')) {
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
                             (req as any).url?.endsWith('.js') || (req as any).url?.endsWith('.jsx') ||
                             (req as any).url?.endsWith('.mjs') || (req as any).url?.endsWith('.ts') ||
                             (req as any).url?.endsWith('.tsx');

          if (isHtml || isJavaScript) {
            // Rewrite HTML/JavaScript to fix absolute paths (Vite uses paths like /@vite/client)
            const fileType = isHtml ? 'HTML' : 'JavaScript';
            console.log(`🔧 [${fileType} Rewrite] Intercepting ${fileType} for ${projectId} - URL: ${(req as any).url}`);
            let body = '';
            proxyRes.on('data', (chunk) => {
              body += chunk.toString();
            });

            proxyRes.on('end', () => {
              console.log(`📄 [${fileType} Rewrite] Original length: ${body.length} chars`);

              // Rewrite absolute paths to include preview prefix
              // Vite uses: /@vite/client, /src/main.jsx, /@react-refresh, /node_modules/.vite/deps/*, etc.
              let modifiedBody = body;

              if (isHtml) {
                // HTML-specific rewrites
                modifiedBody = modifiedBody
                  // Rewrite script src: <script src="/path"> -> <script src="/preview/projectId/path">
                  .replace(/(<script[^>]+src=["'])\/(?!preview\/)/gi, `$1/preview/${projectId}/`)
                  // Rewrite link href: <link href="/path"> -> <link href="/preview/projectId/path">
                  .replace(/(<link[^>]+href=["'])\/(?!preview\/)/gi, `$1/preview/${projectId}/`)
                  // Rewrite inline imports in script tags
                  .replace(/(import\s+[^"']*["'])\/(?!preview\/)/gi, `$1/preview/${projectId}/`)
                  // Rewrite import.meta.url references
                  .replace(/(new\s+URL\s*\(\s*["'])\/(?!preview\/)/gi, `$1/preview/${projectId}/`);

                // Inject error capture script right after <head> tag (if present)
                // This captures runtime errors and navigation events and reports them to the parent frame
                if (modifiedBody.includes('<head>') && !modifiedBody.includes('data-recoder-error-handler')) {
                  modifiedBody = modifiedBody.replace('<head>', '<head>' + ERROR_CAPTURE_SCRIPT);
                  console.log('🛡️ [HTML Rewrite] Injected error capture script');
                } else if (modifiedBody.includes('<head ') && !modifiedBody.includes('data-recoder-error-handler')) {
                  // Handle <head ...attributes> case
                  modifiedBody = modifiedBody.replace(/<head[^>]*>/, (match) => match + ERROR_CAPTURE_SCRIPT);
                  console.log('🛡️ [HTML Rewrite] Injected error capture script (with head attributes)');
                }
              }

              if (isJavaScript) {
                // JavaScript-specific rewrites - rewrite ALL import/export paths
                modifiedBody = modifiedBody
                  // Rewrite: import ... from "/path"
                  .replace(/(from\s+["'])\/(?!preview\/)/g, `$1/preview/${projectId}/`)
                  // Rewrite: import "/path"
                  .replace(/(import\s+["'])\/(?!preview\/)/g, `$1/preview/${projectId}/`)
                  // Rewrite: export ... from "/path"
                  .replace(/(export\s+.*from\s+["'])\/(?!preview\/)/g, `$1/preview/${projectId}/`)
                  // Rewrite: import() dynamic imports
                  .replace(/(import\s*\(\s*["'])\/(?!preview\/)/g, `$1/preview/${projectId}/`)
                  // Rewrite: new URL("/path", import.meta.url)
                  .replace(/(new\s+URL\s*\(\s*["'])\/(?!preview\/)/g, `$1/preview/${projectId}/`);
              }

              const changed = body !== modifiedBody;
              console.log(`✅ [${fileType} Rewrite] Modified length: ${modifiedBody.length} chars - Changes: ${changed ? 'YES' : 'NO'}`);
              if (changed && modifiedBody.length < 1000) {
                console.log(`✅ [${fileType} Rewrite] Modified content:`, modifiedBody);
              }

              // Update Content-Length header
              res.setHeader('Content-Length', Buffer.byteLength(modifiedBody));

              // Copy all headers
              Object.keys(proxyRes.headers).forEach((key) => {
                if (key !== 'content-length') {
                  const value = proxyRes.headers[key];
                  if (value) res.setHeader(key, value);
                }
              });

              res.statusCode = proxyRes.statusCode || 200;
              res.end(modifiedBody);
            });
          } else {
            // For non-HTML, just pipe through
            const reqPath = (req as any).path || (req as any).url;
            const contentType = proxyRes.headers['content-type'];
            console.log(`📦 [Asset] Serving ${reqPath} - Content-Type: ${contentType || 'NONE'} - Status: ${proxyRes.statusCode}`);

            Object.keys(proxyRes.headers).forEach((key) => {
              const value = proxyRes.headers[key];
              if (value) res.setHeader(key, value);
            });

            // If upstream returns a 5xx for an asset (rare), show friendly page
            if ((proxyRes.statusCode || 0) >= 500) {
              proxyRes.on('data', () => {});
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
    } else {
      console.log(`♻️ Reusing cached proxy for ${cacheKey}`);
    }

    return proxy(req, res, next);
  });

  // Helper: proxy request to Daytona sandbox dev server port
  async function handleSandboxPreview(
    req: any, res: any,
    containers: Map<string, any>,
    subPath: string
  ) {
    const projectId = req.params.projectId;
    let entry = containers.get(projectId);
    if (!entry) {
      entry = await recoverContainerFromDocker(projectId, containers);
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
      const daytonaProxyHost = process.env.DAYTONA_PROXY_HOST || 'host.docker.internal:4000';
      const forwardUrl = `http://${daytonaProxyHost}/${subPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

      // Use Node http.request instead of fetch — fetch may silently override Host header
      const proxyHost = process.env.DAYTONA_PROXY_HOST || 'host.docker.internal';
      const proxyPort = parseInt(process.env.DAYTONA_PROXY_PORT || '4000', 10);
      const sandboxHost = `${port}-${entry.id}.sandbox.recoder.xyz`;
      const requestPath = `/${subPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
      console.log(`[SandboxPreview] Proxying: ${proxyHost}:${proxyPort}${requestPath} Host: ${sandboxHost}`);

      const http = await import('http');
      const proxyResult = await new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
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
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on('end', () => {
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(proxyRes.headers)) {
              if (typeof v === 'string') headers[k] = v;
            }
            resolve({ status: proxyRes.statusCode || 502, headers, body: Buffer.concat(chunks) });
          });
        });
        proxyReq.on('error', reject);
        proxyReq.setTimeout(15000, () => { proxyReq.destroy(); reject(new Error('Proxy timeout')); });
        proxyReq.end();
      });

      res.status(proxyResult.status);
      if (proxyResult.headers['content-type']) res.setHeader('Content-Type', proxyResult.headers['content-type']);
      res.removeHeader('X-Frame-Options');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(proxyResult.body);
    } catch (e: any) {
      console.error(`[SandboxPreview] Proxy error for ${projectId}:`, e.message);
      res.status(502).send(`<h1>Preview unavailable</h1><p>${e.message}</p>`);
    }
  }

  app.get('/api/preview/:projectId/url', async (req, res) => {
    let entry = containers.get(req.params.projectId);
    if (!entry) {
      entry = await recoverContainerFromDocker(req.params.projectId, containers);
    }
    // For Daytona sandboxes, proxy through docker-backend instead of using
    // the external *.sandbox.recoder.xyz URL — avoids needing wildcard SSL cert
    const daytonaUrl = (entry as any)?.daytonaPreviewUrl;
    if (daytonaUrl) {
      // Return a docker.recoder.xyz proxy URL that we handle internally
      const dockerUrl = process.env.DOCKER_PUBLIC_URL || 'https://docker.recoder.xyz';
      const proxyUrl = `${dockerUrl}/api/sandbox-preview/${req.params.projectId}`;
      return res.json({ url: proxyUrl, port: entry?.port || 3000, daytona: true });
    }
    const port = entry?.port || 0;
    const baseUrl = process.env.PUBLIC_URL || `https://web.recoder.xyz`;
    res.json({ url: `${baseUrl}/preview/${req.params.projectId}`, port });
  });

  // Sandbox preview proxy — forwards requests to Daytona sandbox dev server
  // This avoids needing *.sandbox.recoder.xyz wildcard SSL cert.
  // Uses Daytona port-forward via toolbox API.
  app.all('/api/sandbox-preview/:projectId', async (req, res) => {
    return handleSandboxPreview(req, res, containers, '');
  });
  app.all('/api/sandbox-preview/:projectId/*', async (req, res) => {
    const subPath = req.url.split('/api/sandbox-preview/' + req.params.projectId + '/')[1] || '';
    return handleSandboxPreview(req, res, containers, subPath);
  });

  // Health check - shows which ports are responding
  app.get('/api/preview/:projectId/health', async (req, res) => {
    let entry = containers.get(req.params.projectId);
    if (!entry) {
      // Try Docker recovery first, then Daytona recovery
      entry = await recoverContainerFromDocker(req.params.projectId, containers);
      if (!entry && process.env.USE_DAYTONA_CONTAINERS === 'true') {
        try {
          const dc = getDaytonaClient();
          const sandboxes = await dc.listSandboxes();
          const matches = sandboxes
            .filter((s: any) => s.labels?.projectId === req.params.projectId)
            .sort((a: any, b: any) => {
              const aR = a.state === 'started' || a.state === 'running' ? 1 : 0;
              const bR = b.state === 'started' || b.state === 'running' ? 1 : 0;
              if (aR !== bR) return bR - aR;
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
              daytona: true,
              daytonaPreviewUrl: previewUrl,
            } as any;
            containers.set(req.params.projectId, entry as any);
          }
        } catch (e) {
          // Daytona recovery failed, continue to 404
        }
      }
    }
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // For Daytona sandboxes, ensure sandbox is running before checking ports
    if ((entry as any)?.daytona) {
      try {
        const dc = getDaytonaClient();
        await dc.getOrStartSandbox(entry.id, 15000);
      } catch {
        // Non-fatal — sandbox may already be running or start may timeout
      }
    }

    // For Daytona sandboxes, check multiple common dev server ports via internal curl
    const daytonaUrl = (entry as any)?.daytonaPreviewUrl;
    if (daytonaUrl) {
      // Extract sandboxId from preview URL pattern: https://{port}-{sandboxId}.sandbox.recoder.xyz
      const urlMatch = daytonaUrl.match(/^https?:\/\/\d+-([^.]+)\./);
      const sandboxId = urlMatch?.[1] || entry.id;

      // Check multiple ports using internal curl inside the sandbox (avoids OIDC redirect issues)
      const portsToCheck = [
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

      try {
        const dc = getDaytonaClient();
        // Check all ports with a single exec call for efficiency
        // Each check is in a subshell with ; separator so all checks run
        const curlCmd = portsToCheck.map(({ port }) =>
          `(curl -sf http://localhost:${port} > /dev/null 2>&1 && echo ${port}:HTTPOK || echo ${port}:FAIL)`
        ).join('; ');

        const curlResult = await dc.execCommand(entry.id, curlCmd, { timeoutSecs: 10 });
        const output = curlResult.output.trim();

        const portResults = portsToCheck.map(({ port, type }) => {
          const portUrl = `https://${port}-${sandboxId}.sandbox.recoder.xyz`;
          // Check if port responded successfully (contains HTTPOK marker)
          const responding = output.includes(`${port}:HTTPOK`);
          return { port, responding, type, url: portUrl };
        });

        // Find the first responding port and update stored preview URL if different
        const respondingResult = portResults.find(r => r.responding);
        const effectivePreviewUrl = respondingResult?.url || daytonaUrl;
        if (respondingResult && effectivePreviewUrl !== daytonaUrl) {
          (entry as any).daytonaPreviewUrl = effectivePreviewUrl;
        }

        return res.json({
          projectId: req.params.projectId,
          daytona: true,
          previewUrl: effectivePreviewUrl,
          ports: portResults.map(({ port, responding, type }) => ({ port, responding, type })),
        });
      } catch (_e) {
        return res.json({
          projectId: req.params.projectId,
          daytona: true,
          previewUrl: daytonaUrl,
          ports: [{ port: entry.port || 3000, responding: false, type: 'Daytona preview' }],
        });
      }
    }

    const basePorts = [entry.port + 1, entry.port, entry.port + 4, entry.port + 5, entry.port + 2];
    const portStatus = await Promise.all(
      basePorts.map(async (port) => ({
        port,
        responding: await checkPort(port),
        type: port === entry.port + 1 ? 'Vite (5173)' :
              port === entry.port ? 'Next.js (3000)' :
              port === entry.port + 4 ? 'Expo (8081)' :
              port === entry.port + 5 ? 'Expo Web (19006)' :
              'Other (8080)'
      }))
    );

    res.json({ projectId: req.params.projectId, ports: portStatus });
  });

  // New: Read-only logs endpoint - returns last N lines of the project's container logs
  app.get('/api/preview/:projectId/logs', async (req, res) => {
    // Normalize and validate projectId
    const projectId = String(req.params.projectId || '').trim();

    // Basic validation: non-empty and only allow alphanumeric, dash, underscore
    const validId = /^[a-zA-Z0-9_-]+$/.test(projectId);
    if (!projectId || !validId || projectId === 'undefined' || projectId === 'null') {
      console.warn(`⚠️ [Preview Logs] Invalid projectId received: "${projectId}" from ${req.ip || req.socket?.remoteAddress}`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(400).json({ 
        error: 'Invalid project ID', 
        message: 'Project ID is required and must contain only letters, numbers, dash or underscore.' 
      });
    }

    let entry = containers.get(projectId);
    if (!entry) {
      // Try to recover from Docker
      console.log(`⚠️ [Preview Logs] Container not in memory for ${projectId}, attempting recovery...`);
      entry = await recoverContainerFromDocker(projectId, containers);
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
    if (Number.isNaN(tail) || tail < 0) tail = 200;
    if (tail > MAX_TAIL) tail = MAX_TAIL;

    try {
      const containerId = entry.id;
      if (!containerId) {
        console.warn(`⚠️ [Preview Logs] Missing container id for projectId: ${projectId}`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(404).json({ error: 'Container id missing for project' });
      }

      const container = docker.getContainer(containerId);
      // Request logs without following; dockerode may return Buffer or Stream depending on options/runtime
      const opts = { stdout: true, stderr: true, tail, timestamps: true } as any;
      const logsResult: any = await container.logs(opts);

      let logs = '';
      // If we got a Buffer-like object
      if (Buffer.isBuffer(logsResult)) {
        logs = logsResult.toString('utf8');
      } else if (typeof logsResult === 'string') {
        logs = logsResult;
      } else if (logsResult && typeof logsResult.pipe === 'function') {
        // Collect stream data
        logs = '';
        await new Promise<void>((resolve, reject) => {
          logsResult.on('data', (chunk: any) => { logs += chunk?.toString?.('utf8') ?? String(chunk); });
          logsResult.on('end', () => resolve());
          logsResult.on('error', (err: any) => reject(err));
        });
      } else {
        logs = String(logsResult || '');
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.json({ projectId, containerId, tail, logs });
    } catch (err) {
      console.error(`❌ [Preview Logs] Error fetching container logs for ${projectId}:`, err);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(500).json({ error: 'Failed to fetch logs', details: String(err) });
    }
  });

}
