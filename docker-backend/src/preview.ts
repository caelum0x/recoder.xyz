/**
 * Preview Proxy - Routes preview URLs to container dev servers
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Express } from 'express';
import http from 'http';

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
    const entry = containers.get(projectId);

    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    if (!entry) {
      console.log(`⚠️ Preview request for unknown project: ${projectId}`);
      return res.status(204).end();
    }

    entry.lastActive = Date.now();

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
      return res.status(204).end();
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
                  // Rewrite script src
                  .replace(/(<script[^>]+src=["'])\/(?!preview\/)/gi, `$1/preview/${projectId}/`)
                  // Rewrite link href
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

  app.get('/api/preview/:projectId/url', (req, res) => {
    const entry = containers.get(req.params.projectId);
    const port = entry?.port || 0;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`;
    res.json({ url: `${baseUrl}/preview/${req.params.projectId}`, port });
  });

  // Health check - shows which ports are responding
  app.get('/api/preview/:projectId/health', async (req, res) => {
    const entry = containers.get(req.params.projectId);
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
}
