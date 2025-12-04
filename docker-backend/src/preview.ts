/**
 * Preview Proxy - Routes preview URLs to container dev servers
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import Docker from 'dockerode';
import type { Express } from 'express';

const docker = new Docker();

// Track which ports containers are using
const containerPorts = new Map<string, number>();

export function setupPreviewProxy(app: Express, containers: Map<string, { id: string; lastActive: number }>) {
  
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

    try {
      // Get container IP
      const container = docker.getContainer(entry.id);
      const info = await container.inspect();
      const ip = info.NetworkSettings.IPAddress;
      
      // Get port (default 3000, or detect from running processes)
      const port = containerPorts.get(projectId) || 3000;
      
      // Proxy to container
      const proxy = createProxyMiddleware({
        target: `http://${ip}:${port}`,
        changeOrigin: true,
        pathRewrite: { [`^/preview/${projectId}`]: '' },
        ws: true, // WebSocket support for HMR
        onProxyRes: (proxyRes) => {
          // Override COEP headers from proxied response
          proxyRes.headers['cross-origin-embedder-policy'] = 'unsafe-none';
          proxyRes.headers['cross-origin-resource-policy'] = 'cross-origin';
        },
        onError: (err, _req, res) => {
          console.error(`Preview proxy error for ${projectId}:`, err.message);
          (res as any).status(502).send(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h2>🚀 Dev server not running</h2>
                <p>Run <code>npm run dev</code> in the terminal to start the preview.</p>
                <p style="color: #666; font-size: 14px;">Port ${port} on container ${projectId}</p>
              </body>
            </html>
          `);
        },
      });

      return proxy(req, res, next);
    } catch (err: any) {
      console.error('Preview error:', err.message);
      res.status(500).send('Preview error: ' + err.message);
    }
  });

  // API to set container port
  app.post('/api/preview/:projectId/port', (req, res) => {
    const { port } = req.body;
    containerPorts.set(req.params.projectId, port);
    res.json({ success: true, port });
  });

  // Get preview URL
  app.get('/api/preview/:projectId/url', (req, res) => {
    const port = containerPorts.get(req.params.projectId) || 3000;
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`;
    res.json({ 
      url: `${baseUrl}/preview/${req.params.projectId}`,
      port 
    });
  });
}
