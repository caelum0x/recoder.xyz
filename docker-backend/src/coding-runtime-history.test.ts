import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistenceMocks = vi.hoisted(() => ({
  loadStore: vi.fn(),
  debouncedSave: vi.fn(),
}));

vi.mock('./persistence', () => ({
  loadStore: persistenceMocks.loadStore,
  debouncedSave: persistenceMocks.debouncedSave,
}));

import {
  CodingRuntimeHistoryService,
  resetCodingRuntimeHistoryService,
  getCodingRuntimeHistoryService,
} from './coding-runtime-history';

describe('CodingRuntimeHistoryService', () => {
  beforeEach(() => {
    persistenceMocks.loadStore.mockReset();
    persistenceMocks.debouncedSave.mockReset();
    persistenceMocks.loadStore.mockReturnValue({ entriesByProject: {} });
    resetCodingRuntimeHistoryService();
  });

  it('records session selections with auto-selection metadata', () => {
    const service = new CodingRuntimeHistoryService();

    const entry = service.recordSessionSelection({
      projectId: 'project-1',
      runtimeType: 'claude-code',
      requestedRuntimeType: 'auto',
      sandboxId: 'sandbox-1',
      executionMode: 'build',
      prompt: 'Debug failing preview boot sequence',
      autoSelection: {
        classification: { category: 'debug', confidence: 0.9 },
        routeDecision: { runtimeType: 'claude-code', modelTier: 'powerful' },
      },
    });

    expect(entry.eventType).toBe('session-selection');
    expect(entry.selectionSource).toBe('auto');
    expect(entry.promptPreview).toContain('Debug failing preview boot sequence');
    expect(service.listProjectHistory('project-1', 10)[0]).toMatchObject({
      runtimeType: 'claude-code',
      requestedRuntimeType: 'auto',
      sandboxId: 'sandbox-1',
    });
    expect(persistenceMocks.debouncedSave).toHaveBeenCalled();
  });

  it('records prompt runs and tracks session-default routing reuse', () => {
    const service = new CodingRuntimeHistoryService();

    service.recordPromptRun({
      projectId: 'project-2',
      runtimeType: 'opencode',
      requestedRuntimeType: 'auto',
      prompt: 'Add a settings panel',
      completionLoop: { enabled: true, completed: true, iterations: 2 },
      autoSelection: {
        classification: { category: 'feature', confidence: 0.8 },
        routeDecision: { runtimeType: 'opencode', modelTier: 'powerful' },
      },
    });

    const reused = service.recordPromptRun({
      projectId: 'project-2',
      runtimeType: 'opencode',
      requestedRuntimeType: 'session-default',
      prompt: 'Tighten spacing in the same panel',
      agent: 'builder-1',
    });

    expect(service.listProjectHistory('project-2', 10)).toHaveLength(2);
    expect(service.listProjectHistory('project-2', 10)[0]).toMatchObject({
      prompt: 'Tighten spacing in the same panel',
      agent: 'builder-1',
    });
    expect(reused.selectionSource).toBe('session-default');
  });

  it('hydrates persisted project history and returns newest entries first', () => {
    persistenceMocks.loadStore.mockReturnValueOnce({
      entriesByProject: {
        'project-3': [
          {
            id: 'first',
            projectId: 'project-3',
            eventType: 'session-selection',
            runtimeType: 'codex',
            requestedRuntimeType: 'auto',
            selectionSource: 'auto',
            createdAt: '2026-05-07T00:00:00.000Z',
          },
          {
            id: 'second',
            projectId: 'project-3',
            eventType: 'prompt-run',
            runtimeType: 'codex',
            requestedRuntimeType: 'auto',
            selectionSource: 'auto',
            createdAt: '2026-05-07T00:01:00.000Z',
            prompt: 'Ship the fix',
          },
        ],
      },
    });

    const service = new CodingRuntimeHistoryService();
    const history = service.listProjectHistory('project-3', 10);

    expect(history).toHaveLength(2);
    expect(history[0]?.id).toBe('second');
    expect(history[1]?.id).toBe('first');
  });

  it('caps per-project history at 100 entries', () => {
    const service = new CodingRuntimeHistoryService();

    for (let i = 0; i < 105; i += 1) {
      service.recordPromptRun({
        projectId: 'project-4',
        runtimeType: 'opencode',
        requestedRuntimeType: 'opencode',
        prompt: `Prompt ${i}`,
      });
    }

    const history = service.listProjectHistory('project-4', 200);
    expect(service.getProjectHistoryCount('project-4')).toBe(100);
    expect(history).toHaveLength(100);
    expect(history[0]?.prompt).toBe('Prompt 104');
    expect(history[99]?.prompt).toBe('Prompt 5');
  });

  it('exposes a singleton instance', () => {
    const first = getCodingRuntimeHistoryService();
    const second = getCodingRuntimeHistoryService();
    expect(first).toBe(second);
  });
});
