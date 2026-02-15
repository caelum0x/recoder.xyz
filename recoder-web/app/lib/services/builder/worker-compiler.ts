/**
 * Worker Compiler Service
 *
 * Compiles and bundles Cloudflare Worker code for deployment.
 * Supports Hono framework and standard Workers API.
 */

import { dockerPost } from '../docker-api';

// ============================================
// Types
// ============================================

export interface WorkerConfig {
  /** Project ID */
  projectId: string;
  /** Entry point file (relative to project root) */
  entry?: string;
  /** Output file path */
  output?: string;
  /** Worker name */
  name?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Enable Hono compatibility */
  useHono?: boolean;
  /** Minify output */
  minify?: boolean;
  /** Include source maps */
  sourcemap?: boolean;
  /** Compile timeout in ms */
  timeout?: number;
}

export interface WorkerCompilationResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Compiled code (if success) */
  code?: string;
  /** Source map (if enabled) */
  sourceMap?: string;
  /** Compilation errors */
  errors: Array<{
    message: string;
    file?: string;
    line?: number;
    column?: number;
  }>;
  /** Compilation warnings */
  warnings: string[];
  /** Bundle size in bytes */
  size?: number;
  /** Compilation duration in ms */
  duration: number;
  /** Metadata */
  metadata?: {
    entry: string;
    format: 'esm' | 'cjs';
    target: string;
  };
}

export type WorkerTemplate = 'basic' | 'hono' | 'hono-cors' | 'api' | 'spa';

// ============================================
// Worker Templates
// ============================================

const WORKER_TEMPLATES: Record<WorkerTemplate, string> = {
  basic: `/**
 * Basic Cloudflare Worker
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Hello from Worker!', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};
`,

  hono: `/**
 * Hono Cloudflare Worker
 */
import { Hono } from 'hono';

interface Env {
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// API routes
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Serve static assets
app.get('*', async (c) => {
  try {
    return await c.env.ASSETS.fetch(c.req.raw);
  } catch {
    return c.notFound();
  }
});

export default app;
`,

  'hono-cors': `/**
 * Hono Cloudflare Worker with CORS
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'development',
  });
});

// Example API endpoint
app.get('/api/hello', (c) => {
  return c.json({
    message: 'Hello from Cloudflare Workers!',
    timestamp: new Date().toISOString(),
  });
});

// Serve static assets
app.get('*', async (c) => {
  try {
    return await c.env.ASSETS.fetch(c.req.raw);
  } catch {
    return c.notFound();
  }
});

export default app;
`,

  api: `/**
 * API-focused Cloudflare Worker
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

interface Env {
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors());

// Health endpoint
app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

// API v1 routes
const v1 = new Hono();

v1.get('/users', (c) => {
  return c.json({ users: [] });
});

v1.get('/users/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ user: { id } });
});

v1.post('/users', async (c) => {
  const body = await c.req.json();
  return c.json({ created: body }, 201);
});

app.route('/api/v1', v1);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  logger.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
`,

  spa: `/**
 * SPA-serving Cloudflare Worker
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('WorkerCompiler');

interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for API routes
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// API routes
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Serve static assets with SPA fallback
app.get('*', async (c) => {
  try {
    const response = await c.env.ASSETS.fetch(c.req.raw);

    // If the asset exists, return it
    if (response.ok || response.status === 304) {
      return response;
    }

    // For non-existent assets that look like files, return 404
    const url = new URL(c.req.url);
    if (url.pathname.includes('.') && !url.pathname.endsWith('.html')) {
      return c.notFound();
    }

    // For navigation requests, serve index.html (SPA routing)
    const indexRequest = new Request(new URL('/index.html', c.req.url).toString(), {
      cf: c.req.raw.cf,
    });
    return c.env.ASSETS.fetch(indexRequest);
  } catch {
    return c.notFound();
  }
});

export default app;
`,
};

// ============================================
// Compilation Functions
// ============================================

/**
 * Compile a worker from project files
 */
export async function compileWorker(config: WorkerConfig): Promise<WorkerCompilationResult> {
  const startTime = Date.now();
  const entry = config.entry || 'src/worker.ts';
  const output = config.output || 'dist/worker.js';

  try {
    // Build esbuild command
    const esbuildArgs = [
      `--bundle`,
      `--format=esm`,
      `--target=es2022`,
      `--platform=browser`,
      `--outfile=${output}`,
      config.minify ? '--minify' : '',
      config.sourcemap ? '--sourcemap' : '',
      `--external:__STATIC_CONTENT_MANIFEST`,
    ]
      .filter(Boolean)
      .join(' ');

    const command = `npx esbuild ${entry} ${esbuildArgs}`;

    const result = await dockerPost<{
      success: boolean;
      output: string;
      error?: string;
      exitCode: number;
    }>(
      `/api/shell/${config.projectId}`,
      {
        command,
        timeout: config.timeout || 60000,
      }
    );

    if (!result.success || result.exitCode !== 0) {
      return {
        success: false,
        errors: parseCompilationErrors(result.error || result.output),
        warnings: parseCompilationWarnings(result.output),
        duration: Date.now() - startTime,
      };
    }

    // Read the compiled output
    const codeResult = await dockerPost<{
      success: boolean;
      content: string;
      size: number;
    }>(
      `/api/files/${config.projectId}/read`,
      { path: output }
    );

    const code = codeResult.success ? codeResult.content : undefined;
    const size = codeResult.success ? codeResult.size : undefined;

    // Read source map if enabled
    let sourceMap: string | undefined;
    if (config.sourcemap) {
      const mapResult = await dockerPost<{
        success: boolean;
        content: string;
      }>(
        `/api/files/${config.projectId}/read`,
        { path: `${output}.map` }
      );
      sourceMap = mapResult.success ? mapResult.content : undefined;
    }

    return {
      success: true,
      code,
      sourceMap,
      errors: [],
      warnings: parseCompilationWarnings(result.output),
      size,
      duration: Date.now() - startTime,
      metadata: {
        entry,
        format: 'esm',
        target: 'es2022',
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Compile worker code from source string
 */
export async function compileWorkerFromSource(
  projectId: string,
  source: string,
  options: {
    minify?: boolean;
    sourcemap?: boolean;
    timeout?: number;
  } = {}
): Promise<WorkerCompilationResult> {
  const startTime = Date.now();

  try {
    // Write source to temporary file
    const tempPath = '.tmp/worker-source.ts';
    const outputPath = '.tmp/worker-compiled.js';

    await dockerPost(`/api/files/${projectId}/write`, {
      path: tempPath,
      content: source,
    });

    // Compile
    const result = await compileWorker({
      projectId,
      entry: tempPath,
      output: outputPath,
      minify: options.minify,
      sourcemap: options.sourcemap,
      timeout: options.timeout,
    });

    // Clean up temp file
    await dockerPost(`/api/shell/${projectId}`, {
      command: `rm -f ${tempPath}`,
      timeout: 5000,
    }).catch(() => {});

    return result;
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Bundle worker code with dependencies
 */
export async function bundleWorkerCode(
  projectId: string,
  entry: string,
  options: {
    external?: string[];
    define?: Record<string, string>;
    minify?: boolean;
    format?: 'esm' | 'cjs';
  } = {}
): Promise<WorkerCompilationResult> {
  const startTime = Date.now();
  const output = '.tmp/worker-bundle.js';

  try {
    const externals = options.external || ['__STATIC_CONTENT_MANIFEST'];
    const defines = options.define || {};

    // Build command
    const externalArgs = externals.map((e) => `--external:${e}`).join(' ');
    const defineArgs = Object.entries(defines)
      .map(([k, v]) => `--define:${k}=${JSON.stringify(v)}`)
      .join(' ');

    const command = [
      'npx esbuild',
      entry,
      '--bundle',
      `--format=${options.format || 'esm'}`,
      '--target=es2022',
      '--platform=browser',
      `--outfile=${output}`,
      options.minify ? '--minify' : '',
      externalArgs,
      defineArgs,
    ]
      .filter(Boolean)
      .join(' ');

    const result = await dockerPost<{
      success: boolean;
      output: string;
      error?: string;
      exitCode: number;
    }>(
      `/api/shell/${projectId}`,
      {
        command,
        timeout: 60000,
      }
    );

    if (!result.success || result.exitCode !== 0) {
      return {
        success: false,
        errors: parseCompilationErrors(result.error || result.output),
        warnings: parseCompilationWarnings(result.output),
        duration: Date.now() - startTime,
      };
    }

    // Read bundled output
    const codeResult = await dockerPost<{
      success: boolean;
      content: string;
      size: number;
    }>(
      `/api/files/${projectId}/read`,
      { path: output }
    );

    return {
      success: true,
      code: codeResult.success ? codeResult.content : undefined,
      errors: [],
      warnings: parseCompilationWarnings(result.output),
      size: codeResult.success ? codeResult.size : undefined,
      duration: Date.now() - startTime,
      metadata: {
        entry,
        format: options.format || 'esm',
        target: 'es2022',
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Validate worker code without compiling
 */
export async function validateWorkerCode(
  projectId: string,
  entry: string
): Promise<{
  valid: boolean;
  errors: Array<{ message: string; file?: string; line?: number }>;
  hasDefaultExport: boolean;
  hasRequiredHandlers: boolean;
}> {
  try {
    // Read the entry file
    const result = await dockerPost<{
      success: boolean;
      content: string;
    }>(
      `/api/files/${projectId}/read`,
      { path: entry }
    );

    if (!result.success) {
      return {
        valid: false,
        errors: [{ message: `Could not read ${entry}` }],
        hasDefaultExport: false,
        hasRequiredHandlers: false,
      };
    }

    const content = result.content;
    const errors: Array<{ message: string; file?: string; line?: number }> = [];

    // Check for default export
    const hasDefaultExport =
      /export\s+default/.test(content) || /export\s*\{[^}]*default[^}]*\}/.test(content);

    if (!hasDefaultExport) {
      errors.push({
        message: 'Worker must have a default export',
        file: entry,
      });
    }

    // Check for required handlers (fetch for Workers)
    const hasRequiredHandlers =
      /fetch\s*\(/.test(content) || /async\s+fetch\s*\(/.test(content) || hasDefaultExport;

    // Check for common issues
    if (content.includes('require(') && !content.includes('createRequire')) {
      errors.push({
        message: 'CommonJS require() is not supported in Workers. Use ES modules instead.',
        file: entry,
      });
    }

    if (content.includes('__dirname') || content.includes('__filename')) {
      errors.push({
        message: '__dirname and __filename are not available in Workers',
        file: entry,
      });
    }

    if (content.includes('process.env') && !content.includes('import.meta.env')) {
      errors.push({
        message: 'Use c.env or import.meta.env instead of process.env in Workers',
        file: entry,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      hasDefaultExport,
      hasRequiredHandlers,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      hasDefaultExport: false,
      hasRequiredHandlers: false,
    };
  }
}

/**
 * Get a worker template
 */
export function getWorkerTemplate(template: WorkerTemplate): string {
  return WORKER_TEMPLATES[template] || WORKER_TEMPLATES.basic;
}

/**
 * Create a Hono-based worker with custom routes
 */
export function createHonoWorker(options: {
  routes?: Array<{
    method: 'get' | 'post' | 'put' | 'delete' | 'patch';
    path: string;
    handler: string;
  }>;
  cors?: boolean;
  serveStatic?: boolean;
  healthEndpoint?: boolean;
}): string {
  const imports = ["import { Hono } from 'hono';"];
  const middleware: string[] = [];
  const routes: string[] = [];

  // Add CORS if enabled
  if (options.cors) {
    imports.push("import { cors } from 'hono/cors';");
    middleware.push(`app.use('*', cors());`);
  }

  // Add health endpoint if enabled
  if (options.healthEndpoint !== false) {
    routes.push(`
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});`);
  }

  // Add custom routes
  if (options.routes) {
    for (const route of options.routes) {
      routes.push(`
app.${route.method}('${route.path}', ${route.handler});`);
    }
  }

  // Add static serving if enabled
  if (options.serveStatic !== false) {
    routes.push(`
// Serve static assets
app.get('*', async (c) => {
  try {
    return await c.env.ASSETS.fetch(c.req.raw);
  } catch {
    return c.notFound();
  }
});`);
  }

  return `/**
 * Generated Hono Cloudflare Worker
 */
${imports.join('\n')}

interface Env {
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

${middleware.join('\n')}
${routes.join('\n')}

export default app;
`;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse compilation errors from output
 */
function parseCompilationErrors(output: string): Array<{
  message: string;
  file?: string;
  line?: number;
  column?: number;
}> {
  const errors: Array<{
    message: string;
    file?: string;
    line?: number;
    column?: number;
  }> = [];

  const lines = output.split('\n');

  for (const line of lines) {
    // Match esbuild error format
    const errorMatch = line.match(
      /(?:error:|✘|Error:)\s*(?:\[([^\]]+)\])?\s*(.+)/i
    );

    if (errorMatch) {
      const message = errorMatch[2].trim();

      // Try to extract file info
      const fileMatch = message.match(/([^\s:]+\.[jt]sx?):(\d+):(\d+)/);

      errors.push({
        message: message.replace(fileMatch?.[0] || '', '').trim() || message,
        file: fileMatch?.[1],
        line: fileMatch?.[2] ? parseInt(fileMatch[2], 10) : undefined,
        column: fileMatch?.[3] ? parseInt(fileMatch[3], 10) : undefined,
      });
    }
  }

  // If no parsed errors but output has content, add generic error
  if (errors.length === 0 && output.trim()) {
    errors.push({
      message: output.trim().slice(0, 500),
    });
  }

  return errors;
}

/**
 * Parse compilation warnings from output
 */
function parseCompilationWarnings(output: string): string[] {
  const warnings: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (
      line.toLowerCase().includes('warning') ||
      line.includes('⚠') ||
      line.includes('WARN')
    ) {
      const cleaned = line.replace(/^\s*(?:⚠|warning:?)/i, '').trim();
      if (cleaned) {
        warnings.push(cleaned);
      }
    }
  }

  return warnings;
}
