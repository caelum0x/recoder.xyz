/**
 * Preview Proxy - Routes preview URLs to container dev servers
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Express } from 'express';
import http from 'http';
import Docker from 'dockerode';

const docker = new Docker();

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
        const basePort = port3000Host || port5173Host - 1 || port8080Host - 2;
        
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

// Friendly preview HTML for build/errors
function friendlyPreviewPage(projectId: string, message: string, showLogs = false) {
  const logSection = showLogs ? `
    <div class="logs-hint">
      <p><strong>💡 Tip:</strong> Check the terminal/logs for error details.</p>
      <p>Common causes:</p>
      <ul>
        <li>Missing imported files (AI still generating)</li>
        <li>npm install failed</li>
        <li>Build configuration errors</li>
      </ul>
    </div>
  ` : '';
  
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
    ${logSection}
    <div class="meta">Project: <strong>${projectId}</strong></div>
    <a class="btn" href="#" onclick="window.location.reload();return false">Retry Now</a>
  </div>
</body>
</html>`;
}

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 500 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Cache proxy instances to prevent recreation on every request
const proxyCache = new Map<string, any>();

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
      console.log(`⚠️ Preview request for unknown project: ${projectId}`);
      // Try to recover container info from Docker API
      entry = await recoverContainerFromDocker(projectId, containers);
      
      if (!entry) {
        // Return a friendly 404/placeholder so the iframe shows a clear message
        return res.status(404).send(friendlyPreviewPage(projectId, 'No running container was found for this project.')); 
      }
    } else {
      // Update last active time
      entry.lastActive = Date.now();
    }

    // Check ports in order: Vite (5173), Next.js (3000), Other (8080)
    const basePorts = [entry.port + 1, entry.port, entry.port + 2];
    let targetPort = 0;

    console.log(`🔍 Checking ports for ${projectId}: ${basePorts.join(', ')}`);

    for (const port of basePorts) {
      if (await checkPort(port)) {
        targetPort = port;
        console.log(`✅ Found dev server on port ${port}`);
        break;
      }
    }

    if (!targetPort) {
      console.log(`❌ No dev server found on any port for ${projectId}`);
      // Show a friendly building page with helpful hints - the page auto-refreshes
      return res.status(503).send(friendlyPreviewPage(
        projectId, 
        'The preview server is starting. This page will auto-refresh when ready.',
        true  // Show logs hint
      ));
    }

    // 🔧 FIX: Cache proxy instance per projectId+port to prevent recreation
    const cacheKey = `${projectId}:${targetPort}`;
    let proxy = proxyCache.get(cacheKey);

    if (!proxy) {
      console.log(`📦 Creating new proxy for ${projectId} targeting port ${targetPort}`);
      proxy = createProxyMiddleware({
        target: `http://127.0.0.1:${targetPort}`,
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
              
              const html = friendlyPreviewPage(projectId, errorMessage, true);
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

  app.get('/api/preview/:projectId/url', async (req, res) => {
    let entry = containers.get(req.params.projectId);
    if (!entry) {
      entry = await recoverContainerFromDocker(req.params.projectId, containers);
    }
    const port = entry?.port || 0;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`;
    res.json({ url: `${baseUrl}/preview/${req.params.projectId}`, port });
  });

  // Health check - shows which ports are responding
  app.get('/api/preview/:projectId/health', async (req, res) => {
    let entry = containers.get(req.params.projectId);
    if (!entry) {
      entry = await recoverContainerFromDocker(req.params.projectId, containers);
    }
    if (!entry) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const basePorts = [entry.port + 1, entry.port, entry.port + 2];
    const portStatus = await Promise.all(
      basePorts.map(async (port) => ({
        port,
        responding: await checkPort(port),
        type: port === entry.port + 1 ? 'Vite (5173)' : port === entry.port ? 'Next.js (3000)' : 'Other (8080)'
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
