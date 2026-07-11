/**
 * Simple-local-create normalizer tests.
 *
 * Proves the cockpit FORM bug is fixed end-to-end:
 *   1. The pure normalizer defaults the missing identity fields for a minimal
 *      `{ repoPath, prompt }` body while preserving caller-provided values.
 *   2. The REAL POST /api/conductor/workspaces route accepts that minimal body
 *      (no spaceId/projectId/taskId/createdBy) — it no longer 400s — and
 *      `createWorkspace` returns a workspace record with the defaulted identity.
 *
 * The route test drives the in-memory AgentOsRepository (default driver). No tmux
 * is launched: the substrate launch fails to `failed` AFTER the record is written,
 * which is expected and irrelevant — we assert validation passed and a workspace
 * record was created with the defaulted fields.
 */
import http from 'http';
import express from 'express';
import { describe, it, expect } from 'vitest';
import {
  deriveSimpleCreateDefaults,
  normalizeCreateBody,
  projectIdFromRepoPath,
} from './create-defaults.js';
import { createConductorRouter } from './conductor.routes.js';
import { getWorkspace } from './workspace-service.js';

function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Could not determine server address'));
        return;
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path,
          method,
          headers: { 'content-type': 'application/json', connection: 'close' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let parsed: any = data;
            try {
              parsed = JSON.parse(data);
            } catch {
              // leave as text
            }
            server.close(() => resolve({ status: res.statusCode ?? 0, body: parsed }));
          });
        },
      );
      req.on('error', (error) => server.close(() => reject(error)));
      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
    server.on('error', reject);
  });
}

describe('create-defaults normalizer (unit)', () => {
  it('derives projectId from the repo basename', () => {
    expect(projectIdFromRepoPath('/Users/me/code/my-app')).toBe('my-app');
    expect(projectIdFromRepoPath('/Users/me/code/my-app/')).toBe('my-app');
    expect(projectIdFromRepoPath('')).toBe('local');
    expect(projectIdFromRepoPath('/')).toBe('local');
  });

  it('defaults all four identity fields for a minimal body', () => {
    const d = deriveSimpleCreateDefaults('/tmp/widget', {});
    expect(d.spaceId).toBe('default');
    expect(d.projectId).toBe('widget');
    expect(d.createdBy).toBe('desktop-user');
    expect(d.taskId).toMatch(/^local-widget-/);
    expect(d.taskId.length).toBeGreaterThan('local-widget-'.length);
  });

  it('caller-provided identity values always win', () => {
    const d = deriveSimpleCreateDefaults('/tmp/widget', {
      spaceId: 'space-x',
      projectId: 'proj-x',
      taskId: 'task-x',
      createdBy: 'alice',
    });
    expect(d).toEqual({ spaceId: 'space-x', projectId: 'proj-x', taskId: 'task-x', createdBy: 'alice' });
  });

  it('normalizeCreateBody fills missing identity for {repoPath, prompt} and preserves prompt/runtime', () => {
    const out = normalizeCreateBody({ repoPath: '/tmp/x', prompt: 'do it', runtimeId: 'codex' });
    expect(out.repoPath).toBe('/tmp/x');
    expect(out.prompt).toBe('do it');
    expect(out.runtimeId).toBe('codex'); // caller value untouched
    expect(out.spaceId).toBe('default');
    expect(out.projectId).toBe('x');
    expect(out.createdBy).toBe('desktop-user');
    expect(out.taskId).toMatch(/^local-x-/);
  });

  it('normalizeCreateBody leaves a body with no repoPath untouched (route validation handles it)', () => {
    const out = normalizeCreateBody({ prompt: 'do it' } as Record<string, unknown>);
    expect(out).toEqual({ prompt: 'do it' });
    expect((out as { spaceId?: string }).spaceId).toBeUndefined();
  });

  it('does not invent a prompt/command (preserves real caller intent only)', () => {
    const out = normalizeCreateBody({ repoPath: '/tmp/x' });
    expect((out as { prompt?: string }).prompt).toBeUndefined();
    expect((out as { command?: string }).command).toBeUndefined();
  });
});

describe('POST /workspaces accepts a minimal cockpit-form body (integration)', () => {
  it('passes validation and creates a workspace from {repoPath, command} (no spaceId/etc)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/conductor', createConductorRouter());

    // Minimal body the desktop FORM sends — NO spaceId/projectId/taskId/createdBy.
    // `command:'true'` bypasses prompt enrichment so the path is hermetic; the
    // substrate launch then fails (no tmux), which is fine — we assert the record
    // was created with the defaulted identity, i.e. validation did NOT reject.
    const res = await request(app, 'POST', '/api/conductor/workspaces', {
      repoPath: '/tmp/create-defaults-form-test',
      command: 'true',
    });

    // It must NOT be the old 400 "spaceId, projectId, taskId... required":
    // validation now passes for the minimal body. The substrate launch then
    // fails (no tmux / not a git repo) → the route returns 409 with the created
    // workspace record in `data`. Either way the workspace record exists with
    // the defaulted identity, which is exactly what the FORM-create fix proves.
    expect(res.status).not.toBe(400);
    const ws = res.body.data;
    expect(ws).toBeTruthy();
    expect(ws.workspaceId).toBeTruthy();
    expect(ws.spaceId).toBe('default');
    expect(ws.projectId).toBe('create-defaults-form-test');
    expect(ws.createdBy).toBe('desktop-user');
    expect(ws.taskId).toMatch(/^local-create-defaults-form-test-/);

    // The record is persisted in the control-plane state of record with defaults.
    const persisted = await getWorkspace(ws.workspaceId);
    expect(persisted).toBeTruthy();
    expect(persisted!.spaceId).toBe('default');
    expect(persisted!.projectId).toBe('create-defaults-form-test');
    expect(persisted!.createdBy).toBe('desktop-user');
  });

  it('accepts a body that omits BOTH command and prompt (empty-start; no longer 400)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/conductor', createConductorRouter());

    const res = await request(app, 'POST', '/api/conductor/workspaces', {
      repoPath: '/tmp/create-defaults-form-test',
    });
    // The empty-start default provisions a no-op instead of rejecting; the form
    // promises "start empty and chat once it's running". It is no longer a 400
    // validation failure (it proceeds into the engine — which may then 201, or
    // 409/429 on provisioning/admission depending on the environment, but never
    // the old "command|prompt required" rejection).
    expect(res.status).not.toBe(400);
    if (res.body?.error) {
      expect(res.body.error).not.toContain('command|prompt');
    }
  });

  it('still rejects a body that omits repoPath', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/conductor', createConductorRouter());

    const res = await request(app, 'POST', '/api/conductor/workspaces', {
      prompt: 'do it',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('repoPath');
  });
});
