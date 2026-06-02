import { randomUUID } from 'node:crypto';
import { debouncedSave, loadStore } from './persistence';

const CODING_RUNTIME_HISTORY_STORE = 'coding-runtime-history';
const MAX_HISTORY_PER_PROJECT = 100;
const SAVE_DEBOUNCE_MS = 250;

export interface CodingRuntimeAutoSelection {
  classification: unknown;
  routeDecision: unknown;
}

export interface CodingRuntimeHistoryEntry {
  id: string;
  projectId: string;
  eventType: 'session-selection' | 'prompt-run';
  runtimeType: string;
  requestedRuntimeType: string;
  selectionSource: 'auto' | 'manual' | 'session-default';
  createdAt: string;
  prompt?: string;
  promptPreview?: string;
  sandboxId?: string;
  executionMode?: string;
  agent?: string;
  autoSelection?: CodingRuntimeAutoSelection;
  completionLoop?: {
    enabled: boolean;
    completed?: boolean;
    iterations?: number;
  };
}

interface PersistedCodingRuntimeHistoryStore {
  entriesByProject: Record<string, CodingRuntimeHistoryEntry[]>;
}

function emptyStore(): PersistedCodingRuntimeHistoryStore {
  return { entriesByProject: {} };
}

function makePromptPreview(prompt?: string): string | undefined {
  if (typeof prompt !== 'string') return undefined;
  const normalized = prompt.trim().replace(/\s+/g, ' ');
  if (!normalized) return undefined;
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

export class CodingRuntimeHistoryService {
  private readonly entriesByProject = new Map<string, CodingRuntimeHistoryEntry[]>();

  constructor() {
    const persisted = loadStore<PersistedCodingRuntimeHistoryStore>(
      CODING_RUNTIME_HISTORY_STORE,
      emptyStore(),
    );

    for (const [projectId, entries] of Object.entries(persisted.entriesByProject || {})) {
      this.entriesByProject.set(projectId, Array.isArray(entries) ? entries : []);
    }
  }

  recordSessionSelection(input: {
    projectId: string;
    runtimeType: string;
    requestedRuntimeType: string;
    sandboxId?: string;
    executionMode?: string;
    prompt?: string;
    autoSelection?: CodingRuntimeAutoSelection;
  }): CodingRuntimeHistoryEntry {
    return this.append({
      projectId: input.projectId,
      eventType: 'session-selection',
      runtimeType: input.runtimeType,
      requestedRuntimeType: input.requestedRuntimeType,
      selectionSource: input.autoSelection ? 'auto' : 'manual',
      sandboxId: input.sandboxId,
      executionMode: input.executionMode,
      prompt: input.prompt,
      autoSelection: input.autoSelection,
    });
  }

  recordPromptRun(input: {
    projectId: string;
    runtimeType: string;
    requestedRuntimeType: string;
    prompt: string;
    agent?: string;
    autoSelection?: CodingRuntimeAutoSelection;
    completionLoop?: {
      enabled: boolean;
      completed?: boolean;
      iterations?: number;
    };
  }): CodingRuntimeHistoryEntry {
    const selectionSource =
      input.requestedRuntimeType === 'session-default'
        ? 'session-default'
        : input.autoSelection
          ? 'auto'
          : 'manual';

    return this.append({
      projectId: input.projectId,
      eventType: 'prompt-run',
      runtimeType: input.runtimeType,
      requestedRuntimeType: input.requestedRuntimeType,
      selectionSource,
      prompt: input.prompt,
      agent: input.agent,
      autoSelection: input.autoSelection,
      completionLoop: input.completionLoop,
    });
  }

  listProjectHistory(projectId: string, limit = 50): CodingRuntimeHistoryEntry[] {
    const entries = this.entriesByProject.get(projectId) || [];
    const normalizedLimit = Math.min(Math.max(limit, 1), MAX_HISTORY_PER_PROJECT);
    return entries.slice(-normalizedLimit).reverse();
  }

  getProjectHistoryCount(projectId: string): number {
    return (this.entriesByProject.get(projectId) || []).length;
  }

  private append(input: Omit<CodingRuntimeHistoryEntry, 'id' | 'createdAt' | 'promptPreview'>): CodingRuntimeHistoryEntry {
    const entry: CodingRuntimeHistoryEntry = {
      ...input,
      id: `crh_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      promptPreview: makePromptPreview(input.prompt),
    };

    const existing = this.entriesByProject.get(entry.projectId) || [];
    const next =
      existing.length + 1 > MAX_HISTORY_PER_PROJECT
        ? existing.concat(entry).slice(existing.length + 1 - MAX_HISTORY_PER_PROJECT)
        : existing.concat(entry);

    this.entriesByProject.set(entry.projectId, next);
    this.persist();
    return entry;
  }

  private persist(): void {
    const entriesByProject = Object.fromEntries(this.entriesByProject.entries());
    debouncedSave(
      CODING_RUNTIME_HISTORY_STORE,
      { entriesByProject },
      SAVE_DEBOUNCE_MS,
    );
  }
}

let instance: CodingRuntimeHistoryService | null = null;

export function getCodingRuntimeHistoryService(): CodingRuntimeHistoryService {
  if (!instance) {
    instance = new CodingRuntimeHistoryService();
  }
  return instance;
}

export function resetCodingRuntimeHistoryService(): void {
  instance = null;
}
