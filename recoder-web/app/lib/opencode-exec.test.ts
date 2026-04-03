import { describe, expect, it } from 'vitest';
import { buildOpencodeCommand, parseOpencodeExecOutput } from './.server/llm/opencode-exec';

describe('opencode-exec', () => {
  it('builds a sandbox-safe opencode command with session reuse', () => {
    const command = buildOpencodeCommand({
      model: 'openrouter/openai/gpt-4.1',
      prompt: "Fix the failing test and don't stop early.",
      sessionId: 'sess_123',
      openrouter: 'sk-or-test',
      anthropic: 'sk-ant-test',
    });

    expect(command).toContain("OPENROUTER_API_KEY='sk-or-test'");
    expect(command).toContain("ANTHROPIC_API_KEY='sk-ant-test'");
    expect(command).toContain("opencode run --format json --dir /workspace --session 'sess_123'");
    expect(command).toContain("--model 'openrouter/openai/gpt-4.1'");
    expect(command).toContain("'Fix the failing test and don'\"'\"'t stop early.'");
  });

  it('parses json event output into session and summary text', () => {
    const output = [
      JSON.stringify({
        type: 'tool_use',
        sessionID: 'sess_abc',
        part: { tool: 'bash', state: { status: 'completed' } },
      }),
      JSON.stringify({
        type: 'text',
        sessionID: 'sess_abc',
        part: { text: 'Updated src/App.tsx' },
      }),
      JSON.stringify({
        type: 'text',
        sessionID: 'sess_abc',
        part: { text: 'Ran pnpm test' },
      }),
    ].join('\n');

    const parsed = parseOpencodeExecOutput(output);

    expect(parsed.sessionId).toBe('sess_abc');
    expect(parsed.error).toBeUndefined();
    expect(parsed.text).toContain('[tool:bash] completed');
    expect(parsed.text).toContain('Updated src/App.tsx');
    expect(parsed.text).toContain('Ran pnpm test');
  });

  it('surfaces error events', () => {
    const output = JSON.stringify({
      type: 'error',
      sessionID: 'sess_err',
      error: { message: 'permission denied' },
    });

    const parsed = parseOpencodeExecOutput(output);

    expect(parsed.sessionId).toBe('sess_err');
    expect(parsed.error).toBe('permission denied');
  });
});
