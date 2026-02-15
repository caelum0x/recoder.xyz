#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const POLL_INTERVAL_MS = Number(process.env.RECODER_A2A_BRIDGE_POLL_MS || 1500);
const HEARTBEAT_INTERVAL_MS = Number(process.env.RECODER_A2A_BRIDGE_HEARTBEAT_MS || 15000);
const COMMAND_TIMEOUT_MS = Number(process.env.RECODER_A2A_BRIDGE_COMMAND_TIMEOUT_MS || 120000);
const ONESHOT = process.env.RECODER_A2A_BRIDGE_ONESHOT === 'true';
const BRIDGE_URL = String(process.env.RECODER_A2A_BRIDGE_URL || '').replace(/\/$/, '');
const BRIDGE_TOKEN = String(process.env.RECODER_A2A_BRIDGE_TOKEN || '');
const CODEX_CMD = process.env.RECODER_A2A_CODEX_CMD || 'codex';
const CLAUDE_CMD = process.env.RECODER_A2A_CLAUDE_CMD || 'claude';
const BRIDGE_ID = process.env.RECODER_A2A_BRIDGE_ID || `bridge-${randomUUID()}`;

if (!BRIDGE_URL || !BRIDGE_TOKEN) {
  console.error('Missing required env: RECODER_A2A_BRIDGE_URL and RECODER_A2A_BRIDGE_TOKEN');
  process.exit(1);
}

function pickCommand(agentId) {
  if (agentId === 'codex') return String(CODEX_CMD || '').trim();
  if (agentId === 'claude_code') return String(CLAUDE_CMD || '').trim();
  return null;
}

function extractPrompt(envelope) {
  const textPart = Array.isArray(envelope?.payload)
    ? envelope.payload.find((part) => part?.kind === 'text' && typeof part.text === 'string')
    : null;
  return textPart?.text || '';
}

function authHeaders(extra = {}) {
  return {
    authorization: `Bearer ${BRIDGE_TOKEN}`,
    'x-recoder-a2a-bridge-id': BRIDGE_ID,
    ...extra,
  };
}

async function sendHeartbeat() {
  try {
    await fetch(`${BRIDGE_URL}/api/a2a/bridge/heartbeat`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        bridgeId: BRIDGE_ID,
        capabilities: ['codex', 'claude_code'],
        startedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error(`heartbeat_failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}

function runAgentCommand(commandString, prompt) {
  return new Promise((resolve) => {
    const parts = commandString.split(/\s+/).filter(Boolean);
    const child = spawn(parts[0], parts.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok: false, stdout, stderr: `${stderr}\ncommand_timeout` });
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, stdout, stderr: `${stderr}\n${error.message}` });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });

    child.stdin.write(`${prompt}\n`);
    child.stdin.end();
  });
}

async function reportResult(job, execution) {
  const body = {
    bridgeId: BRIDGE_ID,
    jobId: job.jobId,
    traceId: job.traceId || job.envelope?.metadata?.traceId || null,
    ok: execution.ok,
    resultEnvelope: {
      envelopeVersion: job.envelope?.envelopeVersion || '2026-02-14',
      protocolVersion: job.envelope?.protocolVersion || '0.3.0',
      messageId: `${job.envelope?.messageId || job.jobId}-result`,
      threadId: job.envelope?.threadId || job.jobId,
      createdAt: new Date().toISOString(),
      from: {
        id: job.agentId || 'unknown_agent',
        name: job.agentId || 'unknown_agent',
        platform: job.agentId || 'custom',
      },
      to: job.envelope?.from || {
        id: 'recoder',
        name: 'Recoder',
        platform: 'recoder_web',
      },
      intent: execution.ok ? 'tool_result' : 'error',
      payload: [
        {
          kind: 'text',
          text: execution.ok ? execution.stdout : execution.stderr || 'command_failed',
        },
      ],
      metadata: {
        bridgeId: BRIDGE_ID,
        sourceJobId: job.jobId,
        exitCode: execution.exitCode ?? null,
      },
    },
  };

  const response = await fetch(`${BRIDGE_URL}/api/a2a/bridge/jobs/${encodeURIComponent(job.jobId)}/result`, {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`result_post_failed status=${response.status} body=${text}`);
  }
}

async function pollOnce() {
  const response = await fetch(`${BRIDGE_URL}/api/a2a/bridge/jobs/next`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (response.status === 204) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`poll_failed status=${response.status} body=${text}`);
  }

  const job = await response.json();
  const command = pickCommand(job.agentId);
  if (!command) {
    await reportResult(job, { ok: false, stderr: `unsupported_agent:${job.agentId}`, stdout: '', exitCode: -1 });
    return;
  }

  const prompt = extractPrompt(job.envelope);
  const execution = await runAgentCommand(command, prompt);
  await reportResult(job, execution);
}

async function main() {
  console.log(`recoder-a2a-bridge starting bridgeId=${BRIDGE_ID} url=${BRIDGE_URL}`);
  await sendHeartbeat();
  if (ONESHOT) {
    await pollOnce();
    return;
  }
  setInterval(() => {
    void sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce();
    } catch (error) {
      console.error(`bridge_loop_error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

void main();
