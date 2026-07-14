import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import fetch from 'node-fetch';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const codexRuntime = {
    isRunning: vi.fn(() => false),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    getState: vi.fn(() => ({ status: 'stopped', pid: null, startedAt: null, lastActivity: null })),
    executeTask: vi.fn(async () => ({ taskId: 't1', success: true, resultText: 'ok', raw: {} })),
    getTaskStatus: vi.fn(async () => ({ state: 'working' })),
    cancelTask: vi.fn(async () => ({ cancelled: true })),
    respondToApproval: vi.fn(async () => ({ ok: true })),
  };

  const claudeRuntime = {
    isRunning: vi.fn(() => false),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    registerWithAgentRegistry: vi.fn(() => undefined),
    getState: vi.fn(() => ({ status: 'stopped', pid: null, startedAt: null, lastActivity: null, tools: [] })),
    getTools: vi.fn(() => [{ name: 'Task', description: 'Execute task', inputSchema: { type: 'object' } }]),
    refreshTools: vi.fn(async () => [{ name: 'Task', description: 'Execute task', inputSchema: { type: 'object' } }]),
    executeTask: vi.fn(async () => ({ taskId: 't1', success: true, resultText: 'ok', envelope: {} })),
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  };

  const opencodeRuntime = {
    isRunning: vi.fn(() => false),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    getState: vi.fn(() => ({ status: 'stopped', pid: null, startedAt: null, lastActivity: null, error: null, activeTasks: 0 })),
    executeTask: vi.fn(async () => ({ taskId: 't1', success: true, resultText: 'ok', sessionId: 'sess_1', raw: {} })),
    getTaskStatus: vi.fn(async () => ({ status: 'running', taskId: 't1' })),
    cancelTask: vi.fn(async () => ({ taskId: 't1', cancelled: true })),
    respondToApproval: vi.fn(async () => ({ approvalId: 'a1', supported: false, approved: true })),
  };

  const monitor = {
    getAllConnectorsHealth: vi.fn(() => ({
      connectors: [],
      summary: { total: 0, running: 0, stopped: 0, circuitOpen: 0 },
      timestamp: new Date().toISOString(),
    })),
    isRegistered: vi.fn(() => false),
    getConnectorHealth: vi.fn((id: string) => ({ connectorId: id, circuit: { state: 'closed' } })),
    restartConnector: vi.fn(async () => undefined),
    resetCircuit: vi.fn(() => undefined),
    getCircuitStatus: vi.fn(() => ({ state: 'closed', failures: 0 })),
  };

  const fakePattern = {
    patternType: 'direct-handoff',
    execute: vi.fn(async () => ({
      success: true,
      patternType: 'direct-handoff',
      taskIds: ['tsk_a', 'tsk_b'],
      metadata: { taskAId: 'tsk_a', taskBId: 'tsk_b' },
    })),
  };

  const patternRegistry = {
    list: vi.fn(() => ['direct-handoff', 'supervisor', 'competitive']),
    getDetails: vi.fn(() => ([
      { type: 'direct-handoff', description: 'A->B handoff' },
      { type: 'supervisor', description: 'Supervisor orchestration' },
      { type: 'competitive', description: 'Agents race' },
    ])),
    get: vi.fn((type: string) => (type === 'direct-handoff' ? fakePattern : undefined)),
  };

  return {
    codexRuntime,
    claudeRuntime,
    opencodeRuntime,
    monitor,
    fakePattern,
    patternRegistry,
  };
});

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock('../codex-connector-runtime.service', () => ({
  getCodexConnectorRuntime: () => mocks.codexRuntime,
}));

vi.mock('../claude-connector-runtime.service', () => ({
  getClaudeConnectorRuntime: () => mocks.claudeRuntime,
}));

vi.mock('../opencode-connector-runtime.service', () => ({
  getOpencodeConnectorRuntime: () => mocks.opencodeRuntime,
}));

vi.mock('../connector-health-monitor.service', () => ({
  getConnectorHealthMonitor: () => mocks.monitor,
}));

vi.mock('../patterns/pattern-registry', () => ({
  getPatternRegistry: () => mocks.patternRegistry,
}));

import { codexConnectorRouter } from '../codex-connector.routes';
import { claudeConnectorRouter } from '../claude-connector.routes';
import { opencodeConnectorRouter } from '../opencode-connector.routes';
import { contextBridgeRouter } from '../context-bridge.routes';
import { connectorHealthRouter } from '../connector-health.routes';
import { patternRouter } from '../patterns/pattern.routes';
import { a2aOpenApiRouter } from '../openapi.routes';
import { resetTaskLifecycleService } from '../task-lifecycle.service';
import { resetContextBridgeService } from '../context-bridge.service';

describe('A2A routes HTTP E2E (socket-backed)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use('/api/a2a', express.text({ type: 'application/json', limit: '2mb' }));
    app.use('/api/a2a/connectors/claude', claudeConnectorRouter);
    app.use('/api/a2a/connectors/codex', codexConnectorRouter);
    app.use('/api/a2a/connectors/opencode', opencodeConnectorRouter);
    app.use('/api/a2a/context', contextBridgeRouter);
    app.use('/api/a2a', connectorHealthRouter);
    app.use('/api/a2a/patterns', patternRouter);
    app.use('/api/a2a', a2aOpenApiRouter);

    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1');
      instance.on('listening', () => resolve(instance));
      instance.on('error', reject);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetContextBridgeService();
    resetTaskLifecycleService();
  });

  it('serves connector status routes over real HTTP', async () => {
    const codexRes = await fetch(`${baseUrl}/api/a2a/connectors/codex/status`);
    const codexJson = await codexRes.json();
    expect(codexRes.status).toBe(200);
    expect(codexJson.success).toBe(true);
    expect(codexJson.data.connector).toBe('codex-cli');

    const claudeRes = await fetch(`${baseUrl}/api/a2a/connectors/claude/status`);
    const claudeJson = await claudeRes.json();
    expect(claudeRes.status).toBe(200);
    expect(claudeJson.success).toBe(true);
    expect(claudeJson.data.connector).toBe('claude-code-mcp');

    const opencodeRes = await fetch(`${baseUrl}/api/a2a/connectors/opencode/status`);
    const opencodeJson = await opencodeRes.json();
    expect(opencodeRes.status).toBe(200);
    expect(opencodeJson.success).toBe(true);
    expect(opencodeJson.data.connector).toBe('opencode-cli');
  });

  it('supports context lifecycle routes over real HTTP', async () => {
    const createRes = await fetch(`${baseUrl}/api/a2a/context/task_e2e`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'metadata', data: { key: 'value' } }),
    });
    const createJson = await createRes.json();
    expect(createRes.status).toBe(201);
    expect(createJson.success).toBe(true);

    const getByTypeRes = await fetch(`${baseUrl}/api/a2a/context/task_e2e/metadata`);
    const getByTypeJson = await getByTypeRes.json();
    expect(getByTypeRes.status).toBe(200);
    expect(getByTypeJson.success).toBe(true);
    expect(getByTypeJson.data.count).toBe(1);
  });

  it('serves connector health routes over real HTTP', async () => {
    const listRes = await fetch(`${baseUrl}/api/a2a/connectors/health`);
    const listJson = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listJson.success).toBe(true);
    expect(listJson.data.summary.total).toBe(0);

    const missingRes = await fetch(`${baseUrl}/api/a2a/connectors/codex-cli/health`);
    const missingJson = await missingRes.json();
    expect(missingRes.status).toBe(404);
    expect(missingJson.success).toBe(false);
    expect(missingJson.error.code).toBe('CONNECTOR_NOT_FOUND');
  });

  it('executes pattern routes over real HTTP', async () => {
    const listRes = await fetch(`${baseUrl}/api/a2a/patterns`);
    const listJson = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listJson.success).toBe(true);
    expect(listJson.data.count).toBe(3);

    const executeRes = await fetch(`${baseUrl}/api/a2a/patterns/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patternType: 'direct-handoff',
        config: {
          workspaceId: 'ws_1',
          threadId: 'thr_1',
          requester: { agent_id: 'u1', platform: 'recoder_app' },
        },
        input: {
          kind: 'direct-handoff',
          prompt: 'Analyze then handoff',
          agentA: { agent_id: 'a1', platform: 'codex' },
          agentB: { agent_id: 'a2', platform: 'claude_code' },
        },
      }),
    });
    const executeJson = await executeRes.json();
    expect(executeRes.status).toBe(200);
    expect(executeJson.success).toBe(true);
    expect(mocks.fakePattern.execute).toHaveBeenCalledTimes(1);
  });

  it('serves docs routes over real HTTP', async () => {
    const yamlRes = await fetch(`${baseUrl}/api/a2a/openapi.yaml`);
    const yamlText = await yamlRes.text();
    expect(yamlRes.status).toBe(200);
    expect(yamlRes.headers.get('content-type')).toContain('application/yaml');
    expect(yamlText).toContain('openapi: 3.1.0');

    const docsRes = await fetch(`${baseUrl}/api/a2a/docs`);
    const docsHtml = await docsRes.text();
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers.get('content-type')).toContain('text/html');
    expect(docsHtml).toContain('SwaggerUIBundle');
    expect(docsHtml).toContain('/api/a2a/openapi.yaml');
  });
});
