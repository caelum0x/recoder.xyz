import { describe, expect, it } from 'vitest';
import {
  containsLegacyRuntimeMarkup,
  extractCodingRuntimeText,
  inferCodingRuntimeProvider,
  sanitizeRuntimeSystemPrompt,
} from './.server/llm/coding-runtime-exec';

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

  it('strips legacy recoder action guidance from runtime system prompts', () => {
    const sanitized = sanitizeRuntimeSystemPrompt(`You are in BUILD mode.
Generate complete, production-ready code. Create files directly using recoderAction type="file".
Do not emit XML.
Keep real runtime behavior.`);

    expect(sanitized).not.toContain('recoderAction');
    expect(sanitized).not.toContain('XML');
    expect(sanitized).toContain('Keep real runtime behavior.');
  });

  it('detects legacy runtime markup in text responses', () => {
    expect(containsLegacyRuntimeMarkup('<recoderArtifact id="a1"><recoderAction type="file">x</recoderAction></recoderArtifact>')).toBe(true);
    expect(containsLegacyRuntimeMarkup('Updated src/App.tsx and ran npm test.')).toBe(false);
  });
});
