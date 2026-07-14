export interface OpencodeSandboxProviderKeys {
  openrouter?: string;
  openai?: string;
  anthropic?: string;
  google?: string;
  gemini?: string;
}

export interface BuildOpencodeSandboxCommandOptions {
  prompt: string;
  model?: string;
  sessionId?: string;
  continueSession?: boolean;
  cwd?: string;
  providerKeys?: OpencodeSandboxProviderKeys;
}

export interface ParsedOpencodeSandboxOutput {
  sessionId?: string;
  text: string;
  error?: string;
  rawText: string;
}

const DEFAULT_OPENCODE_MODEL = process.env.OPENCODE_MODEL || 'openrouter/anthropic/claude-sonnet-4.5';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function buildEnvAssignments(keys: OpencodeSandboxProviderKeys | undefined): string[] {
  if (!keys) {
    return [];
  }

  const assignments: string[] = [];

  if (keys.openrouter) {
    assignments.push(`OPENROUTER_API_KEY=${shellQuote(keys.openrouter)}`);
  }
  if (keys.openai) {
    assignments.push(`OPENAI_API_KEY=${shellQuote(keys.openai)}`);
  }
  if (keys.anthropic) {
    assignments.push(`ANTHROPIC_API_KEY=${shellQuote(keys.anthropic)}`);
  }

  const geminiKey = keys.google || keys.gemini;
  if (geminiKey) {
    assignments.push(`GEMINI_API_KEY=${shellQuote(geminiKey)}`);
  }

  return assignments;
}

export function buildOpencodeSandboxCommand(options: BuildOpencodeSandboxCommandOptions): string {
  const cwd = options.cwd || '/workspace';
  const parts = [...buildEnvAssignments(options.providerKeys)];

  parts.push('opencode', 'run', '--format', 'json', '--dir', shellQuote(cwd));

  if (options.sessionId) {
    parts.push('--session', shellQuote(options.sessionId));
  } else if (options.continueSession) {
    parts.push('--continue');
  }

  parts.push('--model', shellQuote(options.model || DEFAULT_OPENCODE_MODEL));
  parts.push(shellQuote(options.prompt));

  return parts.join(' ');
}

function extractTextFromEvent(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const event = value as Record<string, unknown>;
  const part = event.part;

  if (event.type === 'text' && part && typeof part === 'object') {
    const text = (part as Record<string, unknown>).text;
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : undefined;
  }

  if (event.type === 'error') {
    const error = event.error;
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim();
      }
    }
  }

  if (event.type === 'tool_use' && part && typeof part === 'object') {
    const record = part as Record<string, unknown>;
    const tool = typeof record.tool === 'string' ? record.tool : undefined;
    const state = record.state && typeof record.state === 'object'
      ? (record.state as Record<string, unknown>)
      : undefined;
    const status = typeof state?.status === 'string' ? state.status : undefined;

    if (tool && status) {
      return `[tool:${tool}] ${status}`;
    }
  }

  return undefined;
}

export function parseOpencodeSandboxOutput(output: string): ParsedOpencodeSandboxOutput {
  const textChunks: string[] = [];
  const errorChunks: string[] = [];
  let sessionId: string | undefined;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      if (typeof parsed.sessionID === 'string' && parsed.sessionID.trim()) {
        sessionId = parsed.sessionID.trim();
      }

      const chunk = extractTextFromEvent(parsed);
      if (!chunk) {
        continue;
      }

      if (parsed.type === 'error') {
        errorChunks.push(chunk);
      } else {
        textChunks.push(chunk);
      }
    } catch {
      textChunks.push(line);
    }
  }

  return {
    sessionId,
    text: textChunks.join('\n\n').trim(),
    error: errorChunks.join('\n').trim() || undefined,
    rawText: output,
  };
}
