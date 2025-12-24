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
      return res.status(204).end();
    }

    entry.lastActive = Date.now();

    const basePorts = [entry.port + 1, entry.port, entry.port + 2];
    let targetPort = 0;
    
    for (const port of basePorts) {
      if (await checkPort(port)) {
        targetPort = port;
        break;
      }
    }
    
    if (!targetPort) {
      return res.status(204).end();
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
      onError: () => res.status(204).end(),
    });

    return proxy(req, res, next);
  });

  app.get('/api/preview/:projectId/url', (req, res) => {
    const entry = containers.get(req.params.projectId);
    const port = entry?.port || 0;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`;
    res.json({ url: `${baseUrl}/preview/${req.params.projectId}`, port });
  });
}
