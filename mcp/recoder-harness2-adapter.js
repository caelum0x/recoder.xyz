#!/usr/bin/env node
/**
 * Recoder Harness² Capability Probe
 *
 * Harness² (github.com/google-research/harness2, Apache 2.0) is Google Research's
 * open-source framework for RECURSIVE AGENT HARNESSING: it lets an agent rewrite its
 * own scaffolding (system prompt, guardrails, memory, tool guidance, subagents,
 * skills, scripts, plugins) between attempts at the SAME task, using a
 * propose -> probe -> compose loop, then folds adopted edits into a persistent
 * "improvement harness" for future tasks.
 *
 * This file is deliberately NOT a `ConductorRuntime`/`RuntimeDriver` adapter like
 * `recoder-codex-adapter.js` or `recoder-claude-bridge`. Those adapters work because
 * Codex/Claude Code expose a stable "run an arbitrary prompt against an arbitrary repo,
 * stream back edits" surface. Harness², as released, does not expose that surface:
 *
 *   - Its only CLI entrypoint (`harness2`, see `pyproject.toml` -> `harness2.cli.run_sweep:main`)
 *     takes `--bench {jb,lab,wb}` — a CLOSED set of three fixed research benchmarks
 *     (JobBench / LAB / WorkBuddy-Bench) — not an arbitrary task or repo path.
 *   - Its executor interface, `harness2.substrate.base.Substrate.execute(task_ref, install,
 *     run_ids, timeout)`, requires a "benchmark-supplied launcher" from
 *     `third_party/{jb,lab,wb}_runner` plus a `task_ref` that only resolves inside that
 *     benchmark's fixed, pre-downloaded task dataset. There is no `execute(prompt, repo_path)`
 *     path for an arbitrary Recoder workspace.
 *   - A model-backed run needs Linux + Python 3.12 + `uv` + the Google Cloud CLI with
 *     Vertex AI Application Default Credentials, benchmark-pinned venvs under
 *     `dependencies/<bench>/.venv`, and (for WorkBuddy) Docker — none of which Recoder's
 *     existing Codex/Claude adapters require (they shell out to CLIs the user already
 *     has installed and authenticated).
 *   - Harness²'s own Codex integration is itself a client of Codex (via a local LiteLLM
 *     `harness2-bridge`), i.e. Harness² CONSUMES Codex/OpenCode as its executor — it is
 *     not designed to be consumed as one.
 *
 * See docs/engines/HARNESS2.md for the full writeup (what Harness² is, why it is not
 * wired as a selectable `ConductorRuntime`, and what a real integration would require).
 *
 * What THIS adapter gives Recoder instead, honestly: a small, additive, optional
 * capability probe over the SAME JSON-RPC-over-stdio shape as the other mcp/ adapters,
 * so a Recoder operator/agent can ask "is a Harness² benchmark environment usable here,
 * and what is it actually for" without Recoder pretending it can dispatch a coding task
 * to it. It never reports a fabricated "ready to run your task" status.
 *
 * Usage:
 *   node mcp/recoder-harness2-adapter.js
 */

'use strict';

const { spawnSync } = require('node:child_process');

const HARNESS2_BENCHMARKS = Object.freeze(['jb', 'lab', 'wb']);

const HARNESS2_DESCRIPTION = Object.freeze({
  project: 'Harness² (Recursive Agent Harnessing for an Open World)',
  source: 'https://github.com/google-research/harness2',
  license: 'Apache-2.0',
  paper: 'https://arxiv.org/pdf/2610.14224',
  what_it_is:
    'A research framework where an agent executor (OpenCode or Codex) runs a benchmark ' +
    'task, a harness editor proposes edits to 8 harness components (system prompt, ' +
    'guardrails, memory, tool guidance, subagents, skills, scripts, plugins), candidate ' +
    'edits are probed on the same task, and a composer adopts the edits that help — then a ' +
    'persistent "improvement harness" carries lessons into future tasks.',
  supported_benchmarks: HARNESS2_BENCHMARKS,
  supports_arbitrary_task_dispatch: false,
  why_not: [
    'The only CLI entrypoint (`harness2`) requires --bench {jb,lab,wb}; there is no ' +
      'arbitrary --repo/--prompt mode.',
    '`Substrate.execute(task_ref, install, run_ids, timeout)` requires a ' +
      'benchmark-supplied Launcher (third_party/{jb,lab,wb}_runner) and a task_ref that ' +
      'only resolves inside that benchmark\'s fixed, pre-downloaded dataset.',
    'A model-backed run requires Linux + Python 3.12 + uv + Google Cloud CLI with Vertex ' +
      'AI Application Default Credentials, plus benchmark-pinned venvs and (for ' +
      'WorkBuddy-Bench) Docker.',
    'Harness² consumes Codex/OpenCode as ITS executor (via its own harness2-bridge ' +
      'LiteLLM shim for the Codex path); it is not designed to be driven as an executor ' +
      'the way Recoder drives Codex or Claude Code.',
  ],
  additive_status:
    'Optional, additive, read-only capability probe. Does not replace or gate any of ' +
    'Recoder\'s own engines (Codex, Claude Code, opencode, recoder-code, ...).',
  docs: 'docs/engines/HARNESS2.md',
});

/**
 * Check whether a binary resolves on PATH without invoking a shell.
 * @param {string} bin
 * @returns {{ present: boolean, version: string | null }}
 */
function probeBinary(bin) {
  const which = spawnSync('which', [bin], { encoding: 'utf8' });
  if (which.status !== 0 || !which.stdout || !which.stdout.trim()) {
    return { present: false, version: null };
  }
  const versionProbe = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 });
  const version =
    versionProbe.status === 0 && versionProbe.stdout
      ? versionProbe.stdout.trim().split('\n')[0]
      : null;
  return { present: true, version };
}

/**
 * Truthful dependency/health probe. Never reports "up" for something unverified; a
 * missing or unverifiable dependency is reported `present: false`, matching the repo
 * convention (AGENTS.md: "never fake success", .claude/rules/frontend.md: "show the
 * missing source clearly instead of faking success").
 * @returns {{ ok: boolean, degraded: boolean, dependencies: Record<string, unknown>, supportsTaskDispatch: false, reason: string }}
 */
function probeHealth() {
  const dependencies = {
    harness2: probeBinary('harness2'),
    'harness2-check': probeBinary('harness2-check'),
    uv: probeBinary('uv'),
    gcloud: probeBinary('gcloud'),
    docker: probeBinary('docker'),
    node: probeBinary('node'),
  };

  const harness2Installed = dependencies.harness2.present && dependencies['harness2-check'].present;
  const coreToolingPresent = dependencies.uv.present && dependencies.gcloud.present;

  return {
    ok: harness2Installed,
    degraded: harness2Installed && !coreToolingPresent,
    dependencies,
    // Always false: see HARNESS2_DESCRIPTION.why_not. This is a structural limitation
    // of the upstream project's released API surface, not an environment gap that
    // installing more dependencies would fix.
    supportsTaskDispatch: false,
    reason:
      'Harness² has no API for dispatching an arbitrary Recoder task/repo; it only runs ' +
      'its three fixed benchmarks (jb/lab/wb). See harness2_describe or docs/engines/HARNESS2.md.',
  };
}

// Only wire up the stdio JSON-RPC loop when run as a script. Requiring this file as a
// library (e.g. from tests, for probeHealth/probeBinary/HARNESS2_DESCRIPTION) must not
// attach a `process.stdin` listener — that would keep the host process alive forever
// waiting on stdin that never arrives.
if (require.main === module) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) {
        try {
          const msg = JSON.parse(line);
          Promise.resolve(handleMessage(msg)).catch((err) => {
            respondError(readJsonRpcId(msg), -32000, err.message || 'Tool execution failed');
          });
        } catch (err) {
          respondError(null, -32700, 'Parse error', { message: err.message });
        }
      }
    }
  });
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message, data) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message, data } }) + '\n');
}

function readJsonRpcId(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return null;
  return Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    respondError(null, -32600, 'Invalid Request');
    return;
  }

  const { id, method, params } = msg;
  if (typeof method !== 'string') {
    respondError(id, -32600, 'Invalid Request', { reason: 'method must be a string' });
    return;
  }

  if (method === 'initialize') {
    respond(id, {
      name: 'recoder-harness2-probe',
      version: '1.0.0',
      kind: 'capability-probe',
      // Deliberately NOT advertised as a ConductorRuntime/engine id. See file header.
      tools: [
        { name: 'harness2_health', description: 'Truthful local dependency probe for Harness² tooling (never fakes readiness)' },
        { name: 'harness2_describe', description: 'What Harness² is, its real supported surface, and why it is not a dispatchable Recoder engine' },
      ],
    });
    return;
  }

  if (method === 'tools/call' || method === 'call') {
    const name = params?.name || params?.tool;

    try {
      let result;
      switch (name) {
        case 'harness2_health': {
          result = probeHealth();
          break;
        }
        case 'harness2_describe': {
          result = HARNESS2_DESCRIPTION;
          break;
        }
        default:
          respondError(id, -32601, `Unknown tool: ${name}`);
          return;
      }
      respond(id, result);
    } catch (err) {
      respondError(id, -32000, err.message || 'Tool execution failed');
    }
    return;
  }

  respondError(id, -32601, `Unknown method: ${method}`);
}

module.exports = { probeHealth, probeBinary, HARNESS2_DESCRIPTION, HARNESS2_BENCHMARKS };

if (require.main === module) {
  process.stderr.write(
    '[recoder-harness2-probe] Ready. 2 tools available. This is a capability probe, not a ' +
      'task-dispatching engine — see docs/engines/HARNESS2.md.\n',
  );
}

