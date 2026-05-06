import { describe, expect, it } from 'vitest';
import {
  buildRuntimePrompt,
  hasObservableMutation,
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
Use str_replace for targeted edits on existing files.
Use readFile first.
Do not emit XML.
Keep real runtime behavior.`);

    expect(sanitized).not.toContain('recoderAction');
    expect(sanitized).not.toContain('str_replace');
    expect(sanitized).not.toContain('readFile');
    expect(sanitized).not.toContain('XML');
    expect(sanitized).toContain('Keep real runtime behavior.');
  });

  it('detects legacy runtime markup in text responses', () => {
    expect(containsLegacyRuntimeMarkup('<recoderArtifact id="a1"><recoderAction type="file">x</recoderAction></recoderArtifact>')).toBe(true);
    expect(containsLegacyRuntimeMarkup('Updated src/App.tsx and ran npm test.')).toBe(false);
  });

  it('builds runtime prompts from user conversation without legacy action terms', () => {
    const prompt = buildRuntimePrompt({
      systemPrompt: `Use recoderAction type="file". Use str_replace. Do not emit XML.`,
      hasSession: false,
      messages: [{ role: 'user', content: 'Make the heading red.' }] as any,
    });

    expect(prompt).toContain('Make the heading red.');
    expect(prompt).not.toContain('recoderAction');
    expect(prompt).not.toContain('str_replace');
    expect(prompt).not.toContain('Use recoderAction');
    expect(prompt).not.toContain('Use str_replace');
  });

  it('detects observable mutation across starter entry files', () => {
    const before = {
      files: {
        '/src/App.tsx': 'old',
        '/index.html': null,
      },
    };
    const after = {
      files: {
        '/src/App.tsx': 'new',
        '/index.html': null,
      },
    };

    expect(hasObservableMutation(before as any, after as any)).toBe(true);
    expect(hasObservableMutation(before as any, before as any)).toBe(false);
  });
});
