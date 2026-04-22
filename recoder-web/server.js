import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { createRequestHandler } from '@remix-run/express';
import express from 'express';
import http from 'http';
import https from 'https';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
dotenv.config({ path: join(__dirnameLocal, '.env') });

console.log('🔧 ENV - DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('🔧 ENV - INTERNAL_SERVICE_KEY:', process.env.INTERNAL_SERVICE_KEY ? 'SET' : 'NOT SET');

if (process.env.NODE_ENV === 'production') {
  const key = process.env.INTERNAL_SERVICE_KEY || '';
  if (!key) {
    console.error('❌ Missing INTERNAL_SERVICE_KEY in production. auth.verify cannot sign /api/auth/verify-token requests.');
    process.exit(1);
  }
  if (key.length < 32) {
    console.error('❌ INTERNAL_SERVICE_KEY must be at least 32 characters in production');
    process.exit(1);
  }
  if (/^(changeme|placeholder|xxx|secret|password|test|dev-internal-key)/i.test(key)) {
    console.error('❌ INTERNAL_SERVICE_KEY appears to be a placeholder value');
    process.exit(1);
  }
}

const BUILD_DIR = join(__dirnameLocal, 'build');
const app = express();
const publicBaseUrl = process.env.RECODER_WEB_URL || process.env.MAIN_SITE_URL || 'https://web.recoder.xyz';
const DOCKER_PUBLIC_URL = process.env.DOCKER_PUBLIC_URL || 'https://docker.recoder.xyz';

// Docker backend URL for preview proxy (internal, not via nginx for /preview/ routes)
const DOCKER_BACKEND_URL = process.env.DOCKER_BACKEND_URL
  || process.env.DOCKER_URL
  || process.env.VITE_DOCKER_BACKEND_URL
  || 'https://docker.recoder.xyz';

// Add cross-origin isolation headers for WebContainer support.
// In Docker mode (production), COEP/COOP are not needed and actively break
// the preview iframe — the parent page's COEP restricts sub-resources
// loaded by user apps in the preview (fonts, CDN scripts, images).
// Only enable COEP/COOP when WebContainer is the runtime (no Docker URL configured).
const hasExplicitDockerUrl = !!(process.env.DOCKER_URL || process.env.VITE_DOCKER_BACKEND_URL || process.env.DOCKER_BACKEND_URL);
if (!hasExplicitDockerUrl) {
  console.log('🔒 COEP/COOP enabled (WebContainer mode)');
  app.use((req, res, next) => {
    if (req.path.startsWith('/preview/')) {
      return next();
    }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
  });
} else {
  console.log('🐳 COEP/COOP skipped (Docker mode — preview iframe compatibility)');
}

// ============================================================
// Same-origin preview proxy
// Proxies /preview/:projectId/* to docker-backend /preview/:projectId/*
// This makes the preview iframe same-origin with web.recoder.xyz,
// eliminating all CSP frame-src, X-Frame-Options, and COEP issues.
// ============================================================
const previewProxy = createProxyMiddleware({
  target: DOCKER_BACKEND_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: (path) => (path.startsWith('/preview') ? path : `/preview${path}`),
  onProxyRes: (proxyRes) => {
    // Remove restrictive headers that the docker-backend or nginx might add
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['cross-origin-embedder-policy'];
    delete proxyRes.headers['cross-origin-opener-policy'];
    delete proxyRes.headers['content-security-policy'];

    // Set permissive headers for same-origin iframe content
    proxyRes.headers['cross-origin-resource-policy'] = 'same-origin';
  },
  onError: (err, req, res) => {
    console.error('[Preview Proxy] Error:', err.message);
    if (res && typeof res.writeHead === 'function' && typeof res.end === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f7fafc">
          <div style="text-align:center;max-width:400px">
            <h2>Preview Unavailable</h2>
            <p style="color:#64748b">The preview service is not responding. It may be starting up.</p>
            <script>setTimeout(() => location.reload(), 3000)</script>
          </div>
        </body></html>
      `);
      return;
    }

    // WebSocket upgrade failures hand us a raw socket, not an HTTP response.
    if (res && typeof res.end === 'function') {
      try {
        res.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        return;
      } catch (_) {}
    }

    if (res && typeof res.destroy === 'function') {
      res.destroy();
    }
  },
});

const dockerApiProxy = createProxyMiddleware({
  target: DOCKER_BACKEND_URL,
  changeOrigin: true,
  ws: true,
  pathRewrite: (path) => path.replace(/^\/api\/docker/, '') || '/',
  onProxyReq: (proxyReq) => {
    proxyReq.setTimeout(30000, () => proxyReq.destroy(new Error('docker api upstream timeout')));
  },
  onError: (err, req, res) => {
    console.error('[Docker API Proxy] Error:', err.message);
    if (res && typeof res.writeHead === 'function' && typeof res.end === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Docker API proxy unavailable' }));
      return;
    }
    if (res && typeof res.destroy === 'function') {
      res.destroy();
    }
  },
});

async function relayPreviewRequest(req, res, next, options = {}) {
  if (req.headers.upgrade && String(req.headers.upgrade).toLowerCase() === 'websocket') {
    return next();
  }

  try {
    const upstreamPath = options.upstreamPath || req.originalUrl;
    const upstreamUrl = new URL(upstreamPath, DOCKER_BACKEND_URL);
    const forwardedHeaders = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      const lowerKey = key.toLowerCase();
      if ([
        'host',
        'connection',
        'content-length',
        'transfer-encoding',
        'accept-encoding',
      ].includes(lowerKey)) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) forwardedHeaders.append(key, item);
      } else {
        forwardedHeaders.set(key, value);
      }
    }

    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const transport = upstreamUrl.protocol === 'https:' ? https : http;
    const upstreamRes = await new Promise((resolve, reject) => {
      const proxyReq = transport.request({
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === 'https:' ? 443 : 80),
        path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
        method: req.method,
        headers: Object.fromEntries(forwardedHeaders.entries()),
        insecureHTTPParser: true,
      }, (proxyRes) => {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          resolve({
            statusCode: proxyRes.statusCode || 502,
            headers: proxyRes.headers,
            body: Buffer.concat(chunks),
          });
        });
      });
      proxyReq.on('error', reject);
      proxyReq.setTimeout(65000, () => proxyReq.destroy(new Error('preview upstream timeout')));
      if (body) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });

    let responseBuffer = upstreamRes.body;
    const contentType = String(upstreamRes.headers['content-type'] || '');
    if (contentType.includes('text/html')) {
      const projectMatch = req.originalUrl.match(/^\/(?:preview|api\/sandbox-preview)\/([^/?#]+)/);
      const projectId = projectMatch?.[1];
      if (projectId) {
        const sameOriginBase = req.originalUrl.startsWith('/preview/')
          ? `/preview/${projectId}/`
          : `/api/sandbox-preview/${projectId}/`;
        const html = responseBuffer
          .toString('utf8')
          .replace(
            new RegExp(`<base href=["']/?api/sandbox-preview/${projectId}/["']`, 'i'),
            `<base href="${sameOriginBase}"`,
          )
          .replace(
            /<script\s+type="module">import\s+\{\s*injectIntoGlobalHook\s*\}\s+from\s+"[^"]*\/@react-refresh";[\s\S]*?window\.\$RefreshSig\$ = \(\) => \(type\) => type;<\/script>\s*/i,
            '<script>window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;</script>\n',
          )
          // Vite HMR websocket setup is unreliable through the sandbox preview proxy.
          // The preview still renders fine without the client bootstrap, and Recoder
          // already knows how to refresh the iframe when files change.
          .replace(
            /<script\s+type="module"\s+src="[^"]*\/@vite\/client"><\/script>\s*/i,
            '',
          );
        responseBuffer = Buffer.from(html, 'utf8');
      }
    }
    if (contentType.includes('text/javascript')) {
      const js = responseBuffer
        .toString('utf8')
        // Strip Vite HMR bootstrap from transformed sandbox modules.
        // The preview still renders fine without HMR, and Recoder can refresh
        // the iframe explicitly on file changes.
        .replace(
          /import\s+\{\s*createHotContext\s+as\s+__vite__createHotContext\s*\}\s+from\s+"[^"]*\/@vite\/client";\s*import\.meta\.hot\s*=\s*__vite__createHotContext\([^)]*\);\s*/g,
          '',
        )
        .replace(
          /import\s+\*\s+as\s+RefreshRuntime\s+from\s+"[^"]*\/@react-refresh";\s*/g,
          'const RefreshRuntime={getRefreshReg:()=>()=>{},createSignatureFunctionForTransform:()=>()=>{},__hmr_import:()=>Promise.resolve({}),registerExportsForReactRefresh:()=>{},validateRefreshBoundaryAndEnqueueUpdate:()=>null};',
        )
        .replace(/import\.meta\.hot/g, 'undefined');
      responseBuffer = Buffer.from(js, 'utf8');
    }

    const isPreviewHtml =
      upstreamPath.startsWith('/preview/') ||
      upstreamPath.startsWith('/api/sandbox-preview/');
    const normalizedStatus =
      isPreviewHtml &&
      [400, 503].includes(upstreamRes.statusCode)
        ? 200
        : upstreamRes.statusCode;

    res.status(normalizedStatus);
    Object.entries(upstreamRes.headers).forEach(([key, rawValue]) => {
      const lowerKey = key.toLowerCase();
      if ([
        'content-length',
        'transfer-encoding',
        'x-frame-options',
        'cross-origin-embedder-policy',
        'cross-origin-opener-policy',
        'content-security-policy',
        'access-control-allow-origin',
        'access-control-allow-credentials',
        'access-control-allow-methods',
        'access-control-allow-headers',
        'access-control-expose-headers',
        'access-control-max-age',
      ].includes(lowerKey)) {
        return;
      }
      if (rawValue == null) return;
      res.setHeader(key, rawValue);
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Length', String(responseBuffer.length));
    res.setHeader('cross-origin-resource-policy', 'same-origin');
    return res.end(responseBuffer);
  } catch (err) {
    return next(err);
  }
}

app.use('/preview', (req, res, next) =>
  relayPreviewRequest(req, res, next, {
    upstreamPath: req.originalUrl.replace(/^\/preview\//, '/api/sandbox-preview/'),
  }),
  previewProxy,
);

app.use('/api/sandbox-preview', (req, res, next) =>
  relayPreviewRequest(req, res, next),
);

app.use('/api/docker', dockerApiProxy);

console.log(`📺 Preview proxy: /preview/* -> ${DOCKER_BACKEND_URL}/preview/*`);
console.log(`🐳 Docker API proxy: /api/docker/* -> ${DOCKER_BACKEND_URL}/*`);

// Serve static files with smart caching
// Files with content hashes (e.g., /assets/index-abc123.js) get long cache
// Non-hashed files get short cache to ensure updates are seen
app.use(express.static(join(BUILD_DIR, 'client'), {
  setHeaders: (res, filePath) => {
    // Check if the file has a content hash in its name
    // Remix/Vite typically creates files like: assets/index-[hash].js, assets/style-[hash].css
    const hasContentHash = /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot|otf)$/i.test(filePath) ||
                           /[-_][a-f0-9]{8,}\.(js|css)$/i.test(filePath) ||
                           filePath.includes('/assets/');

    if (hasContentHash) {
      // Content-hashed files are immutable - cache for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(html|htm)$/i.test(filePath) || filePath.endsWith('/')) {
      // HTML files should always be revalidated
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (/\.(png|jpg|jpeg|gif|ico|svg|webp)$/i.test(filePath)) {
      // Images without hashes: cache for 1 day, but revalidate
      res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    } else {
      // Other files: short cache, must revalidate
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

app.get('/.well-known/agent-card.json', (_req, res) => {
  res.json({
    name: 'Recoder Web Agent',
    description: 'Recoder Web orchestration and execution gateway',
    protocolVersion: '0.3.0',
    version: '1.0.0',
    url: `${publicBaseUrl}/api/a2a/envelope`,
    skills: [
      { id: 'plan', name: 'Planning', description: 'Cross-service planning', tags: ['plan', 'workflow'] },
      { id: 'execute', name: 'Execution', description: 'Task execution and delegation', tags: ['execute', 'agent'] },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    defaultInputModes: ['text', 'application/json'],
    defaultOutputModes: ['text', 'application/json'],
  });
});

const buildPath = pathToFileURL(join(BUILD_DIR, 'server', 'index.js')).href;

app.use(async (req, res, next) => {
  try {
    const build = await import(buildPath);
    const envContext = {
      DATABASE_URL: process.env.DATABASE_URL,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      MAIN_SITE_URL: process.env.MAIN_SITE_URL,
      RECODER_WEB_URL: process.env.RECODER_WEB_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    };

    return createRequestHandler({
      build,
      getLoadContext() {
        return {
          cloudflare: {
            env: envContext
          }
        };
      }
    })(req, res, next);
  } catch (error) {
    console.error('Error loading build:', error);
    next(error);
  }
});

const port = process.env.PORT || 5173;
const server = app.listen(port, '0.0.0.0', () => {
  console.log('🚀 Server running at http://0.0.0.0:' + port);
});

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/preview/') && typeof previewProxy.upgrade === 'function') {
    previewProxy.upgrade(req, socket, head);
    return;
  }
  if (req.url?.startsWith('/api/sandbox-preview/') && typeof previewProxy.upgrade === 'function') {
    const originalUrl = req.url;
    req.url = req.url.replace(/^\/api\/sandbox-preview\//, '/preview/');
    previewProxy.upgrade(req, socket, head);
    req.url = originalUrl;
    return;
  }
  if (req.url?.startsWith('/api/docker/') && typeof dockerApiProxy.upgrade === 'function') {
    const originalUrl = req.url;
    req.url = req.url.replace(/^\/api\/docker/, '') || '/';
    dockerApiProxy.upgrade(req, socket, head);
    req.url = originalUrl;
  }
});

// Graceful shutdown — drain in-flight requests on SIGTERM/SIGINT
function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed, exiting.');
    process.exit(0);
  });
  // Force exit after 30s if connections won't drain
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 30_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
