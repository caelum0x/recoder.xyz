#!/usr/bin/env node

/**
 * Recoder API CLI — OpenClaw skill helper script
 *
 * Usage:
 *   node recoder-api.mjs create --name "My App" --template react
 *   node recoder-api.mjs prompt --project <id> --prompt "Add dark mode"
 *   node recoder-api.mjs preview --project <id>
 *   node recoder-api.mjs list
 *   node recoder-api.mjs publish --project <id>
 *
 * Environment:
 *   RECODER_API_KEY  — Required. Get one at https://recoder.xyz/settings/api-keys
 *   RECODER_API_URL  — Optional. Defaults to https://api.recoder.xyz
 */

const API_KEY = process.env.RECODER_API_KEY;
const API_URL = (process.env.RECODER_API_URL || 'https://api.recoder.xyz').replace(/\/$/, '');

if (!API_KEY) {
  console.error('Error: RECODER_API_KEY environment variable is not set.');
  console.error('Get an API key at https://recoder.xyz/settings/api-keys');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────

async function apiRequest(method, path, body) {
  const url = `${API_URL}/api/v1${path}`;
  const options = {
    method,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data.data ?? data;
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = val;
      if (val !== true) i++;
    }
  }
  return parsed;
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

// ── Commands ─────────────────────────────────────────────────────────

async function createProject(opts) {
  if (!opts.name) {
    console.error('Error: --name is required');
    process.exit(1);
  }
  const result = await apiRequest('POST', '/projects', {
    name: opts.name,
    template: opts.template || 'react',
    description: opts.description,
  });
  output({
    projectId: result.id,
    name: result.name,
    status: result.status,
    template: result.template,
    previewUrl: result.previewUrl,
  });
}

async function sendPrompt(opts) {
  if (!opts.project) {
    console.error('Error: --project is required');
    process.exit(1);
  }
  if (!opts.prompt) {
    console.error('Error: --prompt is required');
    process.exit(1);
  }
  const body = { prompt: opts.prompt };
  if (opts.model) body.model = opts.model;

  const result = await apiRequest('POST', `/projects/${opts.project}/prompt`, body);
  output({
    messageId: result.messageId,
    status: result.status,
  });
}

async function getPreview(opts) {
  if (!opts.project) {
    console.error('Error: --project is required');
    process.exit(1);
  }
  const result = await apiRequest('GET', `/projects/${opts.project}`);
  output({
    projectId: result.id,
    name: result.name,
    status: result.status,
    previewUrl: result.previewUrl,
    publishedUrl: result.publishedUrl || null,
  });
}

async function listProjects() {
  const result = await apiRequest('GET', '/projects');
  output(result.projects || result);
}

async function publishProject(opts) {
  if (!opts.project) {
    console.error('Error: --project is required');
    process.exit(1);
  }
  const result = await apiRequest('POST', `/projects/${opts.project}/publish`);
  output({
    url: result.url,
    slug: result.slug,
    publishedAt: result.publishedAt,
  });
}

// ── Main ─────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const opts = parseArgs(rest);

const commands = {
  create: createProject,
  prompt: sendPrompt,
  preview: getPreview,
  list: listProjects,
  publish: publishProject,
};

if (!command || !commands[command]) {
  console.error(`Usage: recoder-api.mjs <command> [options]

Commands:
  create   --name <name> [--template <tpl>]    Create a new project
  prompt   --project <id> --prompt <text>       Send a coding prompt
  preview  --project <id>                       Get preview URL
  list                                          List all projects
  publish  --project <id>                       Publish to web

Environment:
  RECODER_API_KEY  Required. API key for authentication.
  RECODER_API_URL  Optional. API base URL (default: https://api.recoder.xyz)`);
  process.exit(1);
}

try {
  await commands[command](opts);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
