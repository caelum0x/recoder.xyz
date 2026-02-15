import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDockerFetchJson, mockGetProjectConfigPrompt } = vi.hoisted(() => ({
  mockDockerFetchJson: vi.fn(),
  mockGetProjectConfigPrompt: vi.fn(),
}));

vi.mock('~/lib/http/docker-server', () => ({
  dockerFetchJson: mockDockerFetchJson,
}));

vi.mock('~/lib/services/project-config', () => ({
  getProjectConfigPrompt: mockGetProjectConfigPrompt,
}));

import {
  loadProjectConfigPromptFromDocker,
  loadThemePromptFromDocker,
  resolvePromptMentionsBestEffort,
} from './docker-enrichment';

describe('chat docker enrichment helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads project config prompt from docker-backed reader', async () => {
    mockGetProjectConfigPrompt.mockImplementationOnce(async (reader: (path: string) => Promise<string | null>) => {
      const content = await reader('.recoder/INSTRUCTIONS.md');
      return content ? `<project_config>${content}</project_config>` : '';
    });
    mockDockerFetchJson.mockResolvedValueOnce({ content: 'Use strict TypeScript.' });

    const prompt = await loadProjectConfigPromptFromDocker('http://docker', 'project-1', {
      Authorization: 'Bearer t',
    });

    expect(prompt).toContain('Use strict TypeScript.');
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(1);
  });

  it('returns empty prompt when theme fetch fails', async () => {
    mockDockerFetchJson.mockRejectedValueOnce(new Error('down'));

    const themePrompt = await loadThemePromptFromDocker('http://docker', 'project-1', {
      Authorization: 'Bearer t',
    });

    expect(themePrompt).toBe('');
  });

  it('returns theme prompt when docker theme exists', async () => {
    mockDockerFetchJson.mockResolvedValueOnce({
      data: { themePrompt: 'Prefer slate palette' },
    });

    const themePrompt = await loadThemePromptFromDocker('http://docker', 'project-1', {
      Authorization: 'Bearer t',
    });

    expect(themePrompt).toBe('\n\nPrefer slate palette');
  });

  it('resolves @prompt mentions and tolerates resolver errors', async () => {
    mockDockerFetchJson
      .mockResolvedValueOnce({ data: { resolved: 'Expanded prompt body' } })
      .mockRejectedValueOnce(new Error('resolver failed'));

    const messages: any = [
      { role: 'user', content: '@prompt:abc summarize this' },
      { role: 'user', content: '@prompt:def do this too' },
      { role: 'assistant', content: 'unchanged' },
    ];

    await resolvePromptMentionsBestEffort(messages, 'http://docker', {
      Authorization: 'Bearer t',
    });

    expect(messages[0].content).toBe('Expanded prompt body');
    expect(messages[1].content).toBe('@prompt:def do this too');
    expect(messages[2].content).toBe('unchanged');
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(2);
  });
});
