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
    
    // Add CORS headers for iframe embedding
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (!entry) {
      return res.status(404).send('Container not found. Start a project first.');
    }

    entry.lastActive = Date.now();

    // Try ports in order: 5173 (vite default), 3000 (common), 8080 (fallback)
    const basePorts = [entry.port + 1, entry.port, entry.port + 2]; // 5173, 3000, 8080 mapped
    let targetPort = entry.port;
    
    for (const port of basePorts) {
      if (await checkPort(port)) {
        targetPort = port;
        break;
      }
    }
    
    const proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${targetPort}`,
      changeOrigin: true,
      pathRewrite: { [`^/preview/${projectId}`]: '' },
      ws: true, // Enable WebSocket for HMR
      onProxyRes: (proxyRes) => {
        proxyRes.headers['cross-origin-embedder-policy'] = 'unsafe-none';
        proxyRes.headers['cross-origin-resource-policy'] = 'cross-origin';
      },
      onError: (err, _req, res) => {
        console.error(`Preview proxy error for ${projectId}:`, err.message);
        if (res && typeof (res as any).writeHead === 'function') {
          (res as any).writeHead(502, { 'Content-Type': 'text/html' });
          (res as any).end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center; background: #1a1a2e; color: #eee;">
                <h2>🚀 Dev server starting...</h2>
                <p>Run <code style="background: #333; padding: 4px 8px; border-radius: 4px;">npm run dev</code> in the terminal to start the preview.</p>
                <p style="color: #888; font-size: 14px; margin-top: 20px;">Checking ports: ${basePorts.join(', ')}</p>
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
