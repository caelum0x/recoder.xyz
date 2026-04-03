import { describe, expect, it } from 'vitest';
import { buildOpencodeSandboxCommand, parseOpencodeSandboxOutput } from '../opencode-sandbox';

describe('opencode-sandbox helpers', () => {
  it('builds an opencode sandbox command with provider env and session reuse', () => {
    const command = buildOpencodeSandboxCommand({
      prompt: "Fix the failing test and don't stop early.",
      model: 'openrouter/openai/gpt-4.1',
      sessionId: 'sess_123',
      cwd: '/workspace',
      providerKeys: {
        openrouter: 'sk-or-test',
        anthropic: 'sk-ant-test',
      },
    });

    expect(command).toContain("OPENROUTER_API_KEY='sk-or-test'");
    expect(command).toContain("ANTHROPIC_API_KEY='sk-ant-test'");
    expect(command).toContain("opencode run --format json --dir '/workspace' --session 'sess_123'");
    expect(command).toContain("--model 'openrouter/openai/gpt-4.1'");
    expect(command).toContain("'Fix the failing test and don'\"'\"'t stop early.'");
  });

  it('parses streamed json events into summary text and session id', () => {
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
    ].join('\n');

    const parsed = parseOpencodeSandboxOutput(output);

    expect(parsed.sessionId).toBe('sess_abc');
    expect(parsed.error).toBeUndefined();
    expect(parsed.text).toContain('[tool:bash] completed');
    expect(parsed.text).toContain('Updated src/App.tsx');
  });

  it('surfaces error events from opencode output', () => {
    const parsed = parseOpencodeSandboxOutput(JSON.stringify({
      type: 'error',
      sessionID: 'sess_err',
      error: { message: 'permission denied' },
    }));

    expect(parsed.sessionId).toBe('sess_err');
    expect(parsed.error).toBe('permission denied');
  });
});
