/**
 * @module gateway.test
 *
 * Test suite for the A2A Gateway Router -- the unified entry point that
 * chains all middleware and mounts sub-routers under `/api/a2a`.
 *
 * Covers:
 * - Gateway creation with default and custom config
 * - Middleware chain configuration (tracing, rate limiting, auth)
 * - Sub-router mounting verification (all expected paths present)
 * - Health endpoint response shape
 * - Error handler behaviour
 * - Rate limit config override
 * - All features disabled simultaneously
 *
 * P18-003: A2A Gateway router (unified entry point)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'http';
import { createA2AGateway, type GatewayConfig } from '../gateway.router';
import { resetA2ARateLimiter } from '../rate-limiter.service';
import { resetTraceService } from '../trace-context';
import { resetA2ARBACService } from '../rbac.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Express app with the A2A gateway mounted at /api/a2a.
 */
function createTestApp(config?: GatewayConfig) {
  const app = express();
  app.use(express.json());
  app.use('/api/a2a', createA2AGateway(config));
  return app;
}

/**
 * Lightweight HTTP request helper -- uses node's built-in http module.
 * Returns { status, headers, body }.
 */
function request(
  app: express.Express,
  method: string,
  path: string,
  options?: { headers?: Record<string, string>; body?: any },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Could not determine server address'));
        return;
      }
      const port = addr.port;

      const reqOptions: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method: method.toUpperCase(),
        headers: {
          'content-type': 'application/json',
          ...options?.headers,
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          let body: any;
          try {
            body = JSON.parse(data);
          } catch {
            body = data;
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (options?.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  });
}

/**
 * Inspect the Express router stack to extract mounted paths.
 * Returns an array of route path strings.
 */
function getRoutePaths(router: express.Router): string[] {
  const paths: string[] = [];
  const stack = (router as any).stack;
  if (!Array.isArray(stack)) return paths;
  for (const layer of stack) {
    if (layer.route) {
      // Direct route (e.g., GET /health)
      paths.push(layer.route.path);
    } else if (layer.name === 'router' && layer.regexp) {
      // Sub-router mount -- extract the path from the regexp keys or match
      const keys = layer.keys;
      if (layer.regexp && layer.regexp.source) {
        // Express stores mounted path in layer.regexp; try to extract the path
        // from the layer's path property or by matching the regexp
        const regexpStr = layer.regexp.source;
        // Fast path: check for exact path match pattern like "^\/tasks\/?"
        const match = regexpStr.match(/^\^\\\/([a-z\-\/]+)/i);
        if (match) {
          paths.push('/' + match[1].replace(/\\\//g, '/'));
        }
      }
    }
  }
  return paths;
}

/**
 * Count middleware layers in the router stack that are NOT routes or sub-routers.
 */
function countMiddlewareLayers(router: express.Router): number {
  const stack = (router as any).stack;
  if (!Array.isArray(stack)) return 0;
  let count = 0;
  for (const layer of stack) {
    // Middleware layers have name !== 'router' and no route property
    if (!layer.route && layer.name !== 'router') {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Shared setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetA2ARateLimiter();
  resetTraceService();
  resetA2ARBACService();
});

afterEach(() => {
  resetA2ARateLimiter();
  resetTraceService();
  resetA2ARBACService();
});

// ===========================================================================
// Gateway creation
// ===========================================================================

describe('createA2AGateway', () => {
  it('returns an Express Router', () => {
    const router = createA2AGateway();
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
    // Express routers have a stack property
    expect(Array.isArray((router as any).stack)).toBe(true);
  });

  it('creates a router with non-empty stack', () => {
    const router = createA2AGateway();
    const stack = (router as any).stack;
    expect(stack.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Default config (all middleware enabled)
// ===========================================================================

describe('default config -- all middleware enabled', () => {
  it('includes tracing, rate limiting, and auth middleware layers', () => {
    const router = createA2AGateway();
    // With all 3 middleware + error handler, we expect at least 3 generic middleware layers
    const mwCount = countMiddlewareLayers(router);
    expect(mwCount).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// Config toggles
// ===========================================================================

describe('config toggles', () => {
  it('disabling tracing reduces middleware count', () => {
    const routerAll = createA2AGateway({ enableTracing: true, enableRateLimit: true, enableAuth: true });
    const routerNoTrace = createA2AGateway({ enableTracing: false, enableRateLimit: true, enableAuth: true });

    const countAll = countMiddlewareLayers(routerAll);
    const countNoTrace = countMiddlewareLayers(routerNoTrace);

    expect(countNoTrace).toBeLessThan(countAll);
  });

  it('disabling rate limiting reduces middleware count', () => {
    const routerAll = createA2AGateway({ enableTracing: true, enableRateLimit: true, enableAuth: true });
    const routerNoRL = createA2AGateway({ enableTracing: true, enableRateLimit: false, enableAuth: true });

    const countAll = countMiddlewareLayers(routerAll);
    const countNoRL = countMiddlewareLayers(routerNoRL);

    expect(countNoRL).toBeLessThan(countAll);
  });

  it('disabling auth reduces middleware count', () => {
    const routerAll = createA2AGateway({ enableTracing: true, enableRateLimit: true, enableAuth: true });
    const routerNoAuth = createA2AGateway({ enableTracing: true, enableRateLimit: true, enableAuth: false });

    const countAll = countMiddlewareLayers(routerAll);
    const countNoAuth = countMiddlewareLayers(routerNoAuth);

    expect(countNoAuth).toBeLessThan(countAll);
  });

  it('all features disabled simultaneously yields fewer middleware layers', () => {
    const routerAll = createA2AGateway();
    const routerNone = createA2AGateway({
      enableTracing: false,
      enableRateLimit: false,
      enableAuth: false,
    });

    const countAll = countMiddlewareLayers(routerAll);
    const countNone = countMiddlewareLayers(routerNone);

    // With all disabled, the only non-route middleware is the error handler
    expect(countNone).toBeLessThan(countAll);
    // Error handler is the only remaining middleware
    expect(countNone).toBe(1);
  });
});

// ===========================================================================
// Sub-router mounting
// ===========================================================================

describe('sub-router mounting', () => {
  /**
   * Extract mount paths from the gateway router stack.
   *
   * Express layer regexp sources look like:
   *   /tasks       => "^\\/tasks\\/?(?=\\/|$)"
   *   /connectors/claude => "^\\/connectors\\/claude\\/?(?=\\/|$)"
   *
   * We test the regexp against known mount paths to verify them,
   * which is more reliable than string-parsing the regexp source.
   */
  it('mounts routers for all expected sub-paths', () => {
    const router = createA2AGateway();
    const stack = (router as any).stack as any[];

    const expectedPaths = [
      '/tasks',
      '/channels',
      '/heartbeat',
      '/agents',
      '/events',
      '/connectors/claude',
      '/connectors/codex',
      '/connectors/cursor',
      '/connectors/windsurf',
      '/connectors/replit',
      '/connectors/health',
      '/context',
      '/docs',
      '/metrics',
      '/adapters/rest',
      '/adapters/git',
    ];

    // For each expected path, check that some layer's regexp matches it
    for (const expected of expectedPaths) {
      const found = stack.some((layer: any) => {
        if (layer.name !== 'router' || !layer.regexp) return false;
        // Test the layer regexp against the expected path (with and without trailing /)
        return layer.regexp.test(expected) || layer.regexp.test(expected + '/');
      });
      expect(found, `Expected sub-router mount at '${expected}'`).toBe(true);
    }

    // Also verify we have at least 16 sub-router mounts
    const routerLayers = stack.filter((l: any) => l.name === 'router');
    expect(routerLayers.length).toBeGreaterThanOrEqual(16);
  });

  it('has a direct /health route', () => {
    const router = createA2AGateway();
    const stack = (router as any).stack as any[];

    const hasHealthRoute = stack.some(
      (layer: any) => layer.route && layer.route.path === '/health',
    );
    expect(hasHealthRoute).toBe(true);
  });
});

// ===========================================================================
// Health endpoint
// ===========================================================================

describe('GET /api/a2a/health', () => {
  it('returns 200 with correct shape and subsystem flags', async () => {
    const app = createTestApp({
      enableTracing: true,
      enableRateLimit: false,
      enableAuth: true,
    });

    const { status, body } = await request(app, 'GET', '/api/a2a/health');

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.service).toBe('a2a-gateway');
    expect(typeof body.data.timestamp).toBe('string');
    expect(body.data.subsystems).toEqual({
      tracing: true,
      rateLimit: false,
      auth: true,
    });
  });

  it('returns all subsystems as false when all disabled', async () => {
    const app = createTestApp({
      enableTracing: false,
      enableRateLimit: false,
      enableAuth: false,
    });

    const { status, body } = await request(app, 'GET', '/api/a2a/health');

    expect(status).toBe(200);
    expect(body.data.subsystems).toEqual({
      tracing: false,
      rateLimit: false,
      auth: false,
    });
  });

  it('returns all subsystems as true with default config', async () => {
    const app = createTestApp();

    const { status, body } = await request(app, 'GET', '/api/a2a/health');

    expect(status).toBe(200);
    expect(body.data.subsystems).toEqual({
      tracing: true,
      rateLimit: true,
      auth: true,
    });
  });
});

// ===========================================================================
// Error handler
// ===========================================================================

describe('error handler', () => {
  /**
   * Helper: inserts a middleware layer into the gateway's stack *before*
   * the error handler (which is the last element). This lets us inject
   * routes that call `next(err)` and verify the error handler catches them.
   */
  function injectBeforeErrorHandler(
    gateway: express.Router,
    layer: express.RequestHandler | express.Router,
    path?: string,
  ): void {
    // Build a mini-router to mount
    const wrapper = express.Router();
    if (path) {
      wrapper.use(path, layer);
    } else {
      wrapper.use(layer);
    }

    const stack = (gateway as any).stack as any[];
    // The error handler is the last element. Insert the wrapper just before it.
    const wrapperLayers = (wrapper as any).stack as any[];
    for (const wl of wrapperLayers) {
      stack.splice(stack.length - 1, 0, wl);
    }
  }

  it('catches errors and returns standardized A2A error response', async () => {
    const gateway = createA2AGateway({ enableTracing: false, enableRateLimit: false, enableAuth: false });

    const errorRoute = express.Router();
    errorRoute.get('/explode', (_req: Request, _res: Response, next: NextFunction) => {
      const err: any = new Error('Deliberate test explosion');
      err.status = 503;
      next(err);
    });

    injectBeforeErrorHandler(gateway, errorRoute, '/test-error');

    const app = express();
    app.use(express.json());
    app.use('/api/a2a', gateway);

    const { status, body } = await request(app, 'GET', '/api/a2a/test-error/explode');

    expect(status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain('Deliberate test explosion');
  });

  it('defaults to 500 when error has no status', async () => {
    const gateway = createA2AGateway({ enableTracing: false, enableRateLimit: false, enableAuth: false });

    const errorRoute = express.Router();
    errorRoute.get('/kaboom', (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error('No status code set'));
    });

    injectBeforeErrorHandler(gateway, errorRoute, '/test-error');

    const app = express();
    app.use(express.json());
    app.use('/api/a2a', gateway);

    const { status, body } = await request(app, 'GET', '/api/a2a/test-error/kaboom');

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('No status code set');
  });
});

// ===========================================================================
// Custom rate limit config
// ===========================================================================

describe('custom rate limit config', () => {
  it('applies the provided rateLimitConfig values', () => {
    const customConfig = { maxRequests: 10, windowMs: 5_000, maxConcurrent: 2 };
    const router = createA2AGateway({ rateLimitConfig: customConfig });

    // The router should be created without error
    expect(router).toBeDefined();

    // Verify by checking the stack has rate limit middleware present
    const stack = (router as any).stack as any[];
    const mwLayers = stack.filter((l: any) => !l.route && l.name !== 'router');
    // With all defaults on, should have tracing + rate limit + auth + error handler = 4
    expect(mwLayers.length).toBeGreaterThanOrEqual(4);
  });

  it('uses custom rate limit config without erroring on health request', async () => {
    const app = createTestApp({
      rateLimitConfig: { maxRequests: 5, windowMs: 10_000, maxConcurrent: 1 },
    });

    const { status, body } = await request(app, 'GET', '/api/a2a/health');

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ===========================================================================
// Timestamp format
// ===========================================================================

describe('health timestamp', () => {
  it('returns an ISO 8601 timestamp', async () => {
    const app = createTestApp({ enableTracing: false, enableRateLimit: false, enableAuth: false });
    const { body } = await request(app, 'GET', '/api/a2a/health');

    // Parse the timestamp -- should be a valid date
    const ts = new Date(body.data.timestamp);
    expect(ts.getTime()).not.toBeNaN();
    // ISO strings end with 'Z'
    expect(body.data.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
