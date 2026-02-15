import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexToEnvelope, envelopeToClaudeCode } from './codex-claude-bridge.mjs';

function nowSeconds() {
  return String(Math.floor(Date.now() / 1000));
}

function hmacHex(secret, input) {
  return crypto.createHmac('sha256', secret).update(input).digest('hex');
}

function signedHeaders({ senderAgentId, timestamp, body, secret }) {
  const digest = hmacHex(secret, `${timestamp}.${body}`);
  return {
    'content-type': 'application/json',
    'x-recoder-a2a-agent-id': senderAgentId,
    'x-recoder-a2a-timestamp': timestamp,
    'x-recoder-a2a-signature': `v1=${digest}`,
  };
}

async function sendEnvelope({ endpoint, envelope, senderAgentId, secret }) {
  const body = JSON.stringify(envelope);
  const timestamp = nowSeconds();
  const headers = signedHeaders({ senderAgentId, timestamp, body, secret });

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`fetch failed for ${endpoint}: ${message}`);
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    endpoint,
    senderAgentId,
    parsed,
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function readEnvFileValue(filePath, key) {
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf8');
  const line = raw
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${key}=`) || item.startsWith(`export ${key}=`));
  if (!line) return '';
  const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
  const value = normalized.slice(normalized.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
  return value;
}

function resolveSharedSecret() {
  const direct = process.env.RECODER_A2A_SHARED_SECRET || '';
  if (direct && !/replace_with|changeme|example|todo/i.test(direct)) return direct;

  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), '..', '..', '..');
  const envFile = process.env.A2A_WORKER_ENV_FILE || path.join(repoRoot, '.env.a2a.workers');
  const fromFile = readEnvFileValue(envFile, 'RECODER_A2A_SHARED_SECRET');
  if (fromFile && !/replace_with|changeme|example|todo/i.test(fromFile)) return fromFile;

  throw new Error(`Missing required env: RECODER_A2A_SHARED_SECRET (also checked ${envFile})`);
}

function resolveDefaultSmokeEndpoint() {
  const explicit = process.env.RECODER_A2A_SMOKE_ENDPOINT || '';
  if (explicit) return explicit;

  const backendInternal = process.env.DOCKER_BACKEND_INTERNAL_URL || '';
  if (backendInternal) {
    return `${backendInternal.replace(/\/+$/, '')}/api/a2a/envelope`;
  }

  const backendExternal = process.env.BACKEND_URL || process.env.RECODER_A2A_BACKEND_URL || '';
  if (backendExternal) {
    return `${backendExternal.replace(/\/+$/, '')}/api/a2a/envelope`;
  }

  return '';
}

async function main() {
  const secret = resolveSharedSecret();
  const defaultEndpoint = resolveDefaultSmokeEndpoint();
  const codexEndpoint = process.env.RECODER_A2A_CODEX_ENDPOINT || defaultEndpoint;
  const claudeEndpoint = process.env.RECODER_A2A_CLAUDE_ENDPOINT || defaultEndpoint;

  if (!codexEndpoint || !claudeEndpoint) {
    throw new Error('Set RECODER_A2A_SMOKE_ENDPOINT or both RECODER_A2A_CODEX_ENDPOINT and RECODER_A2A_CLAUDE_ENDPOINT (fallbacks: DOCKER_BACKEND_INTERNAL_URL/BACKEND_URL)');
  }

  const codexAgentId = process.env.RECODER_A2A_CODEX_AGENT_ID || 'codex';
  const claudeAgentId = process.env.RECODER_A2A_CLAUDE_AGENT_ID || 'claude_code';
  const threadId = process.env.RECODER_A2A_THREAD_ID || `thread-${Date.now()}`;

  const codexMessage = process.env.RECODER_A2A_CODEX_MESSAGE || 'Plan rollout checkpoints for A2A worker failover.';
  const codexEnvelope = codexToEnvelope({
    message: { role: 'user', content: codexMessage, metadata: { source: 'codex-http-smoke' } },
    from: { id: codexAgentId, name: 'Codex', platform: 'codex' },
    to: { id: claudeAgentId, name: 'Claude Code', platform: 'claude_code' },
    messageId: `msg-codex-${Date.now()}`,
    threadId,
  });

  const claudeMessage = envelopeToClaudeCode(codexEnvelope);
  const claudeEnvelope = codexToEnvelope({
    message: { role: claudeMessage.role, content: claudeMessage.content?.[0]?.text || 'Ack', metadata: { source: 'claude-http-smoke' } },
    from: { id: claudeAgentId, name: 'Claude Code', platform: 'claude_code' },
    to: { id: codexAgentId, name: 'Codex', platform: 'codex' },
    messageId: `msg-claude-${Date.now()}`,
    threadId,
  });

  const codexSend = await sendEnvelope({
    endpoint: codexEndpoint,
    envelope: codexEnvelope,
    senderAgentId: codexAgentId,
    secret,
  });

  const claudeSend = await sendEnvelope({
    endpoint: claudeEndpoint,
    envelope: claudeEnvelope,
    senderAgentId: claudeAgentId,
    secret,
  });

  const output = {
    threadId,
    codexToClaude: codexSend,
    claudeToCodex: claudeSend,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!codexSend.ok || !claudeSend.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[a2a-codex-claude-smoke] failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
