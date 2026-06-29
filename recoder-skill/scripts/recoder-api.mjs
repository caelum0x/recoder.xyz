#!/usr/bin/env node

/**
 * Recoder API CLI — agent skill helper script.
 *
 * A thin, dependency-free client over the Recoder public API
 * (`/api/v1/projects`) so a third-party coding agent (Claude Code,
 * clawdbot, ...) can build and deploy apps with Recoder.
 *
 * Usage:
 *   node recoder-api.mjs create  --name "My App" --template react
 *   node recoder-api.mjs prompt  --project <id> --prompt "Add dark mode"
 *   node recoder-api.mjs preview --project <id>
 *   node recoder-api.mjs list
 *   node recoder-api.mjs publish --project <id>
 *
 * Environment:
 *   RECODER_API_KEY  — Required. Must start with `sk_`.
 *                      Get one at https://recoder.xyz/settings/api-keys
 *   RECODER_API_URL  — Optional. Defaults to https://api.recoder.xyz
 *
 * This module is importable (no side effects on import). The CLI only runs
 * when the file is executed directly, which keeps it unit-testable.
 */

import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const DEFAULT_API_URL = 'https://api.recoder.xyz';
const API_KEY_DOCS_URL = 'https://recoder.xyz/settings/api-keys';

// ── Configuration ────────────────────────────────────────────────────

/**
 * Error thrown when the skill is not configured correctly (missing or
 * malformed API key). Carries an exit code so the CLI can fail gracefully
 * with a clear "not configured" message instead of a stack trace.
 */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Error thrown when the API responds with a non-2xx status. Surfaces the
 * server's error `code` and HTTP status so failures stay truthful instead
 * of being flattened into a generic message.
 */
export class ApiError extends Error {
  constructor(message, { code, status, retryAfter } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

/**
 * Resolve and validate configuration from environment variables.
 * Real validation against the server contract: keys must start with `sk_`,
 * otherwise the backend rejects every request with INVALID_API_KEY.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ apiKey: string, apiUrl: string }}
 * @throws {ConfigError} when the key is missing or malformed.
 */
export function resolveConfig(env = process.env) {
  const rawKey = env.RECODER_API_KEY;
  if (!rawKey || rawKey.trim() === '') {
    throw new ConfigError(
      `RECODER_API_KEY is not set. Get an API key at ${API_KEY_DOCS_URL} ` +
        'and export it as RECODER_API_KEY.',
    );
  }

  const apiKey = rawKey.trim();
  if (!apiKey.startsWith('sk_')) {
    throw new ConfigError(
      'RECODER_API_KEY looks invalid: Recoder API keys start with "sk_". ' +
        `Check your key at ${API_KEY_DOCS_URL}.`,
    );
  }

  const rawUrl = env.RECODER_API_URL && env.RECODER_API_URL.trim() !== ''
    ? env.RECODER_API_URL.trim()
    : DEFAULT_API_URL;
  const apiUrl = rawUrl.replace(/\/+$/, '');

  return { apiKey, apiUrl };
}

// ── HTTP ─────────────────────────────────────────────────────────────

/**
 * Perform an authenticated request against the Recoder public API and
 * unwrap the standard `{ success, data }` envelope.
 *
 * @param {object} cfg                  result of resolveConfig()
 * @param {string} method               HTTP method
 * @param {string} path                 path under /api/v1 (e.g. "/projects")
 * @param {object} [opts]
 * @param {object} [opts.body]          JSON request body
 * @param {typeof fetch} [opts.fetchImpl] injectable fetch (for tests)
 * @returns {Promise<any>} the unwrapped `data` payload
 * @throws {ApiError} on non-2xx responses
 */
export async function apiRequest(cfg, method, path, opts = {}) {
  const { apiKey, apiUrl } = cfg;
  const fetchImpl = opts.fetchImpl || fetch;
  const url = `${apiUrl}/api/v1${path}`;

  const headers = {
    // The backend expects `Authorization: Bearer sk_...`, NOT X-API-Key.
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  const requestInit = { method, headers };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestInit.body = JSON.stringify(opts.body);
  }

  let res;
  try {
    res = await fetchImpl(url, requestInit);
  } catch (err) {
    // Network-level failure (DNS, refused, timeout). Stay truthful.
    throw new ApiError(
      `Could not reach Recoder API at ${apiUrl}: ${err.message}`,
      { code: 'NETWORK_ERROR' },
    );
  }

  // The API always responds JSON, but a proxy/error page may not.
  let data;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    const code = data?.error?.code;
    const message =
      data?.error?.message ||
      data?.message ||
      `Request failed with HTTP ${res.status}`;
    const retryAfter = data?.error?.details?.retryAfter;
    throw new ApiError(message, { code, status: res.status, retryAfter });
  }

  // Successful responses use { success, data }. Fall back to the raw body
  // for forward-compatibility if the envelope is ever absent.
  if (data && typeof data === 'object' && 'data' in data) {
    return data.data;
  }
  return data;
}

// ── Arg parsing ──────────────────────────────────────────────────────

/**
 * Parse `--key value` / `--flag` style arguments into a plain object.
 * Pure and immutable: builds a fresh object, never mutates the input.
 *
 * @param {string[]} args
 * @returns {Record<string, string | true>}
 */
export function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    const hasValue = next !== undefined && !next.startsWith('--');
    if (hasValue) {
      parsed[key] = next;
      i++;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

/**
 * Read a required string option, throwing a ConfigError otherwise.
 * @param {Record<string, string | true>} opts
 * @param {string} key
 */
function requireOpt(opts, key) {
  const value = opts[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`--${key} is required`);
  }
  return value;
}

// ── Commands ─────────────────────────────────────────────────────────
// Each command takes (cfg, opts, fetchImpl?) and returns a plain object
// suitable for JSON output. They throw ConfigError / ApiError on failure.

export async function createProject(cfg, opts, fetchImpl) {
  const name = requireOpt(opts, 'name');
  const body = {
    name,
    template: typeof opts.template === 'string' ? opts.template : 'react',
  };
  if (typeof opts.description === 'string') body.description = opts.description;

  const result = await apiRequest(cfg, 'POST', '/projects', { body, fetchImpl });
  return {
    projectId: result.id,
    name: result.name,
    status: result.status,
    template: result.template,
    previewUrl: result.previewUrl ?? null,
  };
}

export async function sendPrompt(cfg, opts, fetchImpl) {
  const project = requireOpt(opts, 'project');
  const prompt = requireOpt(opts, 'prompt');
  const body = { prompt };
  if (typeof opts.model === 'string') body.model = opts.model;

  const result = await apiRequest(
    cfg,
    'POST',
    `/projects/${encodeURIComponent(project)}/prompt`,
    { body, fetchImpl },
  );
  // The backend queues prompts asynchronously and returns a taskId; poll
  // task status via GET /projects/:id/tasks/:taskId for completion.
  return {
    taskId: result.taskId,
    status: result.status,
  };
}

export async function getPreview(cfg, opts, fetchImpl) {
  const project = requireOpt(opts, 'project');
  const result = await apiRequest(
    cfg,
    'GET',
    `/projects/${encodeURIComponent(project)}`,
    { fetchImpl },
  );
  return {
    projectId: result.id,
    name: result.name,
    status: result.status,
    previewUrl: result.previewUrl ?? null,
    publishedUrl: result.publishedUrl ?? null,
  };
}

export async function listProjects(cfg, _opts, fetchImpl) {
  const result = await apiRequest(cfg, 'GET', '/projects', { fetchImpl });
  return result?.projects ?? result ?? [];
}

export async function publishProject(cfg, opts, fetchImpl) {
  const project = requireOpt(opts, 'project');
  const result = await apiRequest(
    cfg,
    'POST',
    `/projects/${encodeURIComponent(project)}/publish`,
    { fetchImpl },
  );
  return {
    url: result.url,
    slug: result.slug,
    publishedAt: result.publishedAt,
  };
}

export const COMMANDS = {
  create: createProject,
  prompt: sendPrompt,
  preview: getPreview,
  list: listProjects,
  publish: publishProject,
};

export const USAGE = `Usage: recoder-api.mjs <command> [options]

Commands:
  create   --name <name> [--template <tpl>]    Create a new project
  prompt   --project <id> --prompt <text>       Send a coding prompt
  preview  --project <id>                       Get preview URL
  list                                          List all projects
  publish  --project <id>                       Publish to web

Templates: react (default), nextjs, vue, svelte, expo, html

Environment:
  RECODER_API_KEY  Required. API key (starts with sk_) for authentication.
  RECODER_API_URL  Optional. API base URL (default: ${DEFAULT_API_URL})`;

// ── CLI entrypoint ───────────────────────────────────────────────────

/**
 * Run the CLI. Returns the process exit code instead of calling exit(),
 * so it can be driven from tests.
 *
 * @param {string[]} argv               args after `node script.mjs`
 * @param {object} [io]
 * @param {NodeJS.ProcessEnv} [io.env]
 * @param {(s: string) => void} [io.stdout]
 * @param {(s: string) => void} [io.stderr]
 * @param {typeof fetch} [io.fetchImpl]
 * @returns {Promise<number>} exit code
 */
export async function runCli(argv, io = {}) {
  const env = io.env || process.env;
  const stdout = io.stdout || ((s) => process.stdout.write(s + '\n'));
  const stderr = io.stderr || ((s) => process.stderr.write(s + '\n'));

  const [command, ...rest] = argv;
  const handler = command && COMMANDS[command];

  if (!handler) {
    stderr(USAGE);
    return 1;
  }

  // Validate configuration only once we know the command is valid.
  let cfg;
  try {
    cfg = resolveConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) {
      stderr(`Error: ${err.message}`);
      return 1;
    }
    throw err;
  }

  const opts = parseArgs(rest);
  try {
    const result = await handler(cfg, opts, io.fetchImpl);
    stdout(JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    if (err instanceof ConfigError) {
      stderr(`Error: ${err.message}`);
      return 1;
    }
    if (err instanceof ApiError) {
      const parts = [err.message];
      if (err.code) parts.push(`(code: ${err.code})`);
      if (err.retryAfter !== undefined) {
        parts.push(`(retry after ${err.retryAfter}s)`);
      }
      stderr(`Error: ${parts.join(' ')}`);
      return 1;
    }
    stderr(`Error: ${err.message}`);
    return 1;
  }
}

// Only run the CLI when executed directly (not when imported by tests).
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolvePath(entry);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
