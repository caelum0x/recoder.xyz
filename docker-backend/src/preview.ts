/**
 * Preview Proxy - Routes preview URLs to container dev servers via port mapping
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Express } from 'express';
import http from 'http';

// Check if a port is responding
async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 500 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

export function setupPreviewProxy(app: Express, containers: Map<string, { id: string; lastActive: number; port: number }>) {
  
  // Preview route: /preview/:projectId/*
  app.use('/preview/:projectId', async (req, res, next) => {
    const { projectId } = req.params;
    const entry = containers.get(projectId);
    
    // Add headers for iframe embedding - remove restrictive policies
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    
    if (!entry) {
      // Return a waiting page instead of 404
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>Preview</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center; background: #1a1a2e; color: #eee;">
            <h2>Waiting for project...</h2>
            <p>Container not initialized yet. Send a message to start coding.</p>
            <script>setTimeout(() => location.reload(), 2000);</script>
          </body>
        </html>
      `);
    }

    entry.lastActive = Date.now();

    // Try ports in order: 5173 (vite default), 3000 (common), 8080 (fallback)
    const basePorts = [entry.port + 1, entry.port, entry.port + 2];
    let targetPort = 0;
    
    for (const port of basePorts) {
      if (await checkPort(port)) {
        targetPort = port;
        break;
      }
    }
    
    // No dev server running yet
    if (!targetPort) {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>Preview</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center; background: #1a1a2e; color: #eee;">
            <h2>Dev server starting...</h2>
            <p>Run <code style="background: #333; padding: 4px 8px; border-radius: 4px;">npm run dev</code> in the terminal.</p>
            <p style="color: #888; font-size: 14px;">Checking ports: ${basePorts.join(', ')}</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
          </body>
        </html>
      `);
    }
    
    const proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${targetPort}`,
      changeOrigin: true,
      pathRewrite: { [`^/preview/${projectId}`]: '' },
      ws: true,
      onProxyRes: (proxyRes) => {
        delete proxyRes.headers['cross-origin-embedder-policy'];
        delete proxyRes.headers['cross-origin-opener-policy'];
        proxyRes.headers['cross-origin-resource-policy'] = 'cross-origin';
        proxyRes.headers['x-frame-options'] = 'ALLOWALL';
      },
      onError: (err, _req, res) => {
        console.error(`Preview proxy error for ${projectId}:`, err.message);
        if (res && typeof (res as any).writeHead === 'function') {
          (res as any).writeHead(200, { 'Content-Type': 'text/html' });
          (res as any).end(`
            <!DOCTYPE html>
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center; background: #1a1a2e; color: #eee;">
                <h2>Connection error</h2>
                <p>Dev server may have stopped. Retrying...</p>
                <script>setTimeout(() => location.reload(), 3000);</script>
              </body>
            </html>
          `);
        }
      },
    });

    return proxy(req, res, next);
  });

  // Get preview URL
  app.get('/api/preview/:projectId/url', (req, res) => {
    const entry = containers.get(req.params.projectId);
    const port = entry?.port || 0;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`;
    res.json({ 
      url: `${baseUrl}/preview/${req.params.projectId}`,
      port 
    });
  });
}
