import {
  type A2AMessage,
  type A2ATextPart,
  type ClaudeCodeWireMessage,
  type CodexWireMessage,
  type RecoderA2AEnvelope,
  type RecoderAgentCard,
  type RecoderIntent,
  RECODER_A2A_ENVELOPE_TEXT_PREFIX,
  RECODER_A2A_ENVELOPE_VERSION,
  RECODER_A2A_PROTOCOL_VERSION,
  RecoderA2AEnvelopeValidationError,
  parseRecoderA2AEnvelope,
} from './types';

function extractFirstText(envelope: RecoderA2AEnvelope): string {
  const payload = envelope.payload as unknown[];
  const textPart = payload.find((part) => {
    if (!part || typeof part !== 'object') return false;
    return (part as { kind?: string }).kind === 'text';
  }) as { kind?: string; text?: string } | undefined;
  return textPart?.kind === 'text' ? (textPart.text ?? '') : '';
}

function roleFromIntent(intent: RecoderIntent): 'system' | 'user' | 'assistant' {
  if (intent === 'plan' || intent === 'status' || intent === 'sync') {
    return 'system';
  }

  if (intent === 'tool_call') {
    return 'assistant';
  }

  return 'user';
}

function intentFromRole(role: 'system' | 'user' | 'assistant'): RecoderIntent {
  if (role === 'system') {
    return 'plan';
  }

  if (role === 'assistant') {
    return 'tool_result';
  }

  return 'execute';
}

function intentFromClaudeRole(role: 'user' | 'assistant'): RecoderIntent {
  return role === 'assistant' ? 'tool_result' : 'execute';
}

function readClaudeText(content: ClaudeCodeWireMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export function createRecoderAgentCard(input: {
  name: string;
  description: string;
  version: string;
  url: string;
  skills: RecoderAgentCard['skills'];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  supportsStreaming?: boolean;
  supportsPushNotifications?: boolean;
}): RecoderAgentCard {
  return {
    name: input.name,
    description: input.description,
    protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
    version: input.version,
    url: input.url,
    skills: input.skills,
    capabilities: {
      streaming: input.supportsStreaming ?? true,
      pushNotifications: input.supportsPushNotifications ?? false,
    },
    defaultInputModes: input.defaultInputModes ?? ['text'],
    defaultOutputModes: input.defaultOutputModes ?? ['text'],
  };
}

export function envelopeToA2ATextPart(envelope: RecoderA2AEnvelope): A2ATextPart {
  return {
    kind: 'text',
    text: `${RECODER_A2A_ENVELOPE_TEXT_PREFIX}${JSON.stringify(envelope)}`,
  };
}

export function envelopeToA2AMessage(
  envelope: RecoderA2AEnvelope,
  role: A2AMessage['role'] = 'agent'
): A2AMessage {
  return {
    kind: 'message',
    messageId: envelope.messageId,
    role,
    parts: [envelopeToA2ATextPart(envelope)],
    contextId: envelope.threadId,
  };
}

export function a2aTextPartToEnvelope(part: A2ATextPart): RecoderA2AEnvelope {
  if (!part.text.startsWith(RECODER_A2A_ENVELOPE_TEXT_PREFIX)) {
    throw new Error('A2A text part does not contain a Recoder envelope');
  }

  const raw = part.text.slice(RECODER_A2A_ENVELOPE_TEXT_PREFIX.length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new RecoderA2AEnvelopeValidationError([
      { path: 'a2a.text', message: 'contains an invalid JSON envelope payload' },
    ]);
  }

  return parseRecoderA2AEnvelope(parsed);
}

export function codexToEnvelope(input: {
  message: CodexWireMessage;
  from: RecoderA2AEnvelope['from'];
  to: RecoderA2AEnvelope['to'];
  messageId: string;
  threadId: string;
  now?: string;
}): RecoderA2AEnvelope {
  return {
    envelopeVersion: RECODER_A2A_ENVELOPE_VERSION,
    protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
    messageId: input.messageId,
    threadId: input.threadId,
    createdAt: input.now ?? new Date().toISOString(),
    from: input.from,
    to: input.to,
    intent: intentFromRole(input.message.role),
    payload: [{ kind: 'text', text: input.message.content }],
    metadata: input.message.metadata,
  };
}

export function envelopeToCodex(envelope: RecoderA2AEnvelope): CodexWireMessage {
  return {
    role: roleFromIntent(envelope.intent),
    content: extractFirstText(envelope),
    metadata: envelope.metadata,
  };
}

export function claudeCodeToEnvelope(input: {
  message: ClaudeCodeWireMessage;
  from: RecoderA2AEnvelope['from'];
  to: RecoderA2AEnvelope['to'];
  messageId: string;
  threadId: string;
  now?: string;
}): RecoderA2AEnvelope {
  return {
    envelopeVersion: RECODER_A2A_ENVELOPE_VERSION,
    protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
    messageId: input.messageId,
    threadId: input.threadId,
    createdAt: input.now ?? new Date().toISOString(),
    from: input.from,
    to: input.to,
    intent: intentFromClaudeRole(input.message.role),
    payload: [{ kind: 'text', text: readClaudeText(input.message.content) }],
    metadata: input.message.metadata,
  };
}

export function envelopeToClaudeCode(envelope: RecoderA2AEnvelope): ClaudeCodeWireMessage {
  return {
    role: envelope.intent === 'tool_result' ? 'assistant' : 'user',
    content: [{ type: 'text', text: extractFirstText(envelope) }],
    metadata: envelope.metadata,
  };
}
