import { describe, expect, it, vi } from 'vitest';
import { createJiraRequirementAdapter, jiraDocumentText } from './jira-requirement.adapter.js';

describe('Jira requirement adapter', () => {
  it('reads one canonical Jira Cloud issue with bounded ADF text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      key: 'PAY-42',
      fields: {
        summary: 'Make settlement atomic',
        description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lock read and write.' }] }] },
        status: { name: 'In Progress' },
        labels: ['payments'],
        issuetype: { name: 'Story' },
        priority: { name: 'High' },
      },
    }), { status: 200 }));
    const adapter = createJiraRequirementAdapter({
      baseUrl: 'https://acme.atlassian.net/',
      email: 'dev@acme.test',
      apiToken: 'secret',
      fetch: fetchMock as typeof fetch,
    });
    await expect(adapter.issue('pay-42')).resolves.toEqual({
      key: 'PAY-42',
      title: 'Make settlement atomic',
      description: 'Lock read and write.',
      status: 'In Progress',
      url: 'https://acme.atlassian.net/browse/PAY-42',
      labels: ['payments'],
      issueType: 'Story',
      priority: 'High',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://acme.atlassian.net/rest/api/3/issue/PAY-42?fields=summary,description,status,labels,issuetype,priority',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: expect.stringMatching(/^Basic /) }) }),
    );
  });

  it('degrades truthfully when unconfigured and treats 404 as missing', async () => {
    const down = createJiraRequirementAdapter({});
    await expect(down.health()).resolves.toEqual({ available: false, reason: 'Jira base URL is not configured' });
    await expect(down.issue('PAY-42')).resolves.toBeNull();
    const missing = createJiraRequirementAdapter({
      baseUrl: 'https://acme.atlassian.net',
      apiToken: 'token',
      fetch: vi.fn(async () => new Response('', { status: 404 })) as typeof fetch,
    });
    await expect(missing.issue('PAY-404')).resolves.toBeNull();
  });

  it('flattens paragraphs and hard breaks without preserving ADF controls', () => {
    expect(jiraDocumentText({ type: 'doc', content: [
      { type: 'heading', content: [{ type: 'text', text: 'Acceptance' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'First' }, { type: 'hardBreak' }, { type: 'text', text: 'Second' }] },
    ] })).toBe('Acceptance\nFirst\nSecond');
  });
});
