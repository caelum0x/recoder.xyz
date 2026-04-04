import { describe, expect, it } from 'vitest';
import { extractCodingRuntimeText, inferCodingRuntimeProvider } from './.server/llm/coding-runtime-exec';

describe('coding-runtime-exec', () => {
  it('infers the right API-key provider for opencode-backed model selections', () => {
    expect(inferCodingRuntimeProvider('opencode', 'openrouter/anthropic/claude-sonnet-4.5')).toBe('openrouter');
    expect(inferCodingRuntimeProvider('opencode', 'gemini-2.5-pro')).toBe('google');
    expect(inferCodingRuntimeProvider('anthropic', 'claude-sonnet-4-5-20250929')).toBe('anthropic');
  });

  it('extracts text from wrapped coding-runtime prompt responses', () => {
    const text = extractCodingRuntimeText({
      result: {
        parts: [
          { type: 'tool-result', content: '[tool:bash] completed' },
          { type: 'text', content: 'Updated app/routes/api.chat.ts' },
        ],
      },
    });

    expect(text).toContain('[tool:bash] completed');
    expect(text).toContain('Updated app/routes/api.chat.ts');
  });
});
