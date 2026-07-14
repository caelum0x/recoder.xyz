/**
 * Cockpit Static Routes — serves the desktop cockpit SPA at `/cockpit`.
 *
 * The cockpit renderer (apps/desktop/cockpit) is a self-contained static
 * bundle (index.html + content-hashed js/css). Serving it from the backend
 * lets Wave (the Recoder terminal) open it in a plain `<webview>` pointed at
 * `http://127.0.0.1:<port>/cockpit/` — same-origin with the APIs it calls.
 *
 * Resolution order for the dist directory:
 *   1. explicit `distDir` option (tests / composition root)
 *   2. `COCKPIT_DIST_DIR` env (set by the desktop supervisor: dev →
 *      `<repo>/apps/desktop/cockpit/dist`, packaged →
 *      `<resourcesPath>/cockpit/dist`)
 *   3. dev-checkout fallbacks relative to the backend working directory
 *
 * AUTH: intentionally unauthenticated. The bundle is a static shell with ZERO
 * secrets baked in — every API it calls stays behind its own auth, so a plain
 * browser tab shows the truthful signed-out state. Tokens reach the cockpit
 * only via the Electron preload bridge (`window.__RECODER_COCKPIT__`), never
 * via this route.
 *
 * DEGRADE-SAFE: when no dist directory exists (bundle not built / env unset),
 * every request gets a truthful 503 explaining what is missing — no blank
 * page, no fake index.
 */

import express, { Router } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CockpitStaticOptions {
  /** Explicit dist directory (wins over env + fallbacks). */
  distDir?: string;
}

/** Locations tried (relative to cwd) when COCKPIT_DIST_DIR is not set. */
const DEV_DIST_CANDIDATES = [
  // backend/ is the cwd in dev (the desktop supervisor spawns `tsx src/server.ts`
  // with cwd=<repo>/backend; plain `pnpm dev` in backend/ matches too)
  '../apps/desktop/cockpit/dist',
  // packaged desktop: cwd=<resources>/backend, bundle at <resources>/cockpit/dist
  // (electron-builder extraResources {from:"../cockpit/dist", to:"cockpit/dist"})
  '../cockpit/dist',
  // repo root as cwd (task runners / tests started from the monorepo root)
  'apps/desktop/cockpit/dist',
];

function isServableDist(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, 'index.html'));
  } catch {
    return false;
  }
}

/**
 * Resolve the cockpit dist directory, or null when no servable build exists.
 * An explicit dir is authoritative (no fallback past it) so a composition
 * root / test never silently serves a different tree than it asked for.
 * Exported for tests and for startup logging (truthful "serving from X" /
 * "not available" messages).
 */
export function resolveCockpitDistDir(explicit?: string): string | null {
  if (explicit) {
    const resolved = path.resolve(explicit);
    return isServableDist(resolved) ? resolved : null;
  }
  const candidates = [
    process.env.COCKPIT_DIST_DIR,
    ...DEV_DIST_CANDIDATES.map((rel) => path.resolve(process.cwd(), rel)),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (isServableDist(resolved)) return resolved;
  }
  return null;
}

/**
 * Router serving the cockpit SPA. Mount at `/cockpit`.
 *
 * The dist dir is re-resolved lazily until first found (a dev build may finish
 * after the backend boots), then the static middleware is cached.
 */
export function createCockpitStaticRouter(options: CockpitStaticOptions = {}): Router {
  const router = Router();

  let cachedDir: string | null = null;
  let cachedStatic: express.RequestHandler | null = null;

  function getStaticHandler(): { dir: string; handler: express.RequestHandler } | null {
    if (cachedDir && cachedStatic) return { dir: cachedDir, handler: cachedStatic };
    const dir = resolveCockpitDistDir(options.distDir);
    if (!dir) return null;
    cachedDir = dir;
    cachedStatic = express.static(dir, {
      index: 'index.html',
      fallthrough: true,
      // content-hashed assets are immutable; index.html must revalidate
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
    return { dir: cachedDir, handler: cachedStatic };
  }

  router.use((req, res, next) => {
    const resolved = getStaticHandler();
    if (!resolved) {
      return res.status(503).json({
        success: false,
        error:
          'Cockpit UI is not available: no built bundle found. ' +
          'Build apps/desktop/cockpit (pnpm build) or set COCKPIT_DIST_DIR to the dist directory.',
      });
    }
    resolved.handler(req, res, next);
  });

  // SPA fallback: any GET the static handler could not satisfy serves
  // index.html (client-side routes). The path sent is always the fixed,
  // resolved index — request input never touches the filesystem path.
  router.get('*', (req, res) => {
    const resolved = getStaticHandler();
    if (!resolved) {
      return res.status(503).json({ success: false, error: 'Cockpit UI is not available.' });
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(resolved.dir, 'index.html'));
  });

  return router;
}
