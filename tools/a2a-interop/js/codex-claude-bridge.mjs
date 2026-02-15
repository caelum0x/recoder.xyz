const PROTOCOL_VERSION = '0.3.0';
const ENVELOPE_VERSION = '2026-02-14';

export function codexToEnvelope({ message, from, to, messageId, threadId }) {
  return {
    envelopeVersion: ENVELOPE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    messageId,
    threadId,
    createdAt: new Date().toISOString(),
    from,
    to,
    intent: message.role === 'assistant' ? 'tool_result' : message.role === 'system' ? 'plan' : 'execute',
    payload: [{ kind: 'text', text: message.content }],
    metadata: message.metadata ?? {},
  };
}

export function envelopeToClaudeCode(envelope) {
  const text = envelope.payload.find((part) => part.kind === 'text')?.text ?? '';
  return {
    role: envelope.intent === 'tool_result' ? 'assistant' : 'user',
    content: [{ type: 'text', text }],
    metadata: envelope.metadata ?? {},
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = codexToEnvelope({
    message: { role: 'user', content: 'Plan deploy steps for recoder-pm.' },
    from: { id: 'codex-1', name: 'Codex', platform: 'codex' },
    to: { id: 'claude-1', name: 'Claude Code', platform: 'claude_code' },
    messageId: 'msg-001',
    threadId: 'thread-001',
  });

  const claude = envelopeToClaudeCode(sample);
  console.log(JSON.stringify({ envelope: sample, claude }, null, 2));
}
