import { describe, expect, it } from 'vitest';
import type { ActionResultMeta, ActionState } from '~/lib/runtime/action-runner';
import { getActionMetaBadges, getActionPolicyText, getActionSummary } from './artifact-ui';

function makeAction(partial: Partial<ActionState>): ActionState {
  return {
    type: 'web_search',
    content: '',
    query: '',
    status: 'complete',
    abort: () => {},
    executed: true,
    abortSignal: new AbortController().signal,
    ...partial,
  } as ActionState;
}

describe('artifact UI helpers', () => {
  it('formats action summary for web actions', () => {
    const search = makeAction({ type: 'web_search', query: 'latest react docs' });
    const crawl = makeAction({ type: 'web_crawl', url: 'https://example.com/docs' });

    expect(getActionSummary(search)).toBe('Web search: latest react docs');
    expect(getActionSummary(crawl)).toBe('Web crawl: https://example.com/docs');
  });

  it('builds metadata badges for provider and capability constraints', () => {
    const meta: ActionResultMeta = {
      provider: 'openai',
      resultCount: 3,
      capabilities: {
        supportsWebCrawl: false,
        supportsAllowedDomains: false,
        supportsBlockedDomains: false,
      },
    };

    expect(getActionMetaBadges(meta)).toEqual([
      'provider: openai',
      'results: 3',
      'crawl unsupported',
      'blockedDomains ignored',
      'allowedDomains ignored',
    ]);
  });

  it('formats effective policy text', () => {
    const meta: ActionResultMeta = {
      effectivePolicy: {
        allowedDomains: ['example.com'],
        blockedDomains: ['admin.example.com'],
      },
    };
    expect(getActionPolicyText(meta)).toBe('policy: allow[example.com] block[admin.example.com]');
    expect(getActionPolicyText({})).toBeNull();
  });
});
