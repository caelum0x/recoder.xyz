import { describe, expect, it } from 'vitest';
import {
  getWebToolCapabilityPrompt,
  getWebToolProviderCapability,
  resolveWebToolProvider,
  resolveWebToolProviderFromRuntime,
} from './types';

describe('web tool provider capability matrix', () => {
  it('resolves known providers and defaults unknown to free fallback', () => {
    expect(resolveWebToolProvider('openai')).toBe('openai');
    expect(resolveWebToolProvider('anthropic')).toBe('anthropic');
    expect(resolveWebToolProvider('gemini')).toBe('google');
    expect(resolveWebToolProvider('openrouter')).toBe('free-fallback');
  });

  it('returns capability entries for resolved providers', () => {
    expect(getWebToolProviderCapability('openai').supportsWebCrawl).toBe(false);
    expect(getWebToolProviderCapability('free-fallback').supportsWebCrawl).toBe(true);
    expect(getWebToolProviderCapability('unknown').provider).toBe('free-fallback');
  });

  it('resolves runtime provider/model to web tool provider', () => {
    expect(resolveWebToolProviderFromRuntime('openai')).toBe('openai');
    expect(resolveWebToolProviderFromRuntime('openrouter', 'anthropic/claude-sonnet-4')).toBe('anthropic');
    expect(resolveWebToolProviderFromRuntime('openrouter', 'google/gemini-2.5-pro')).toBe('google');
    expect(resolveWebToolProviderFromRuntime('openrouter', 'meta/llama-3.3')).toBe('free-fallback');
  });

  it('builds provider-aware web tool capability prompt', () => {
    const prompt = getWebToolCapabilityPrompt('openrouter', 'openai/gpt-5');
    expect(prompt).toContain('ACTIVE_WEB_TOOL_PROVIDER: openai');
    expect(prompt).toContain('web_crawl is NOT supported');
    expect(prompt).toContain('providerHint="openai"');
  });
});
