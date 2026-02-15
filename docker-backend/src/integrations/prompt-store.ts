/**
 * Prompt Library Store
 * CRUD for reusable custom prompts. Users can reference prompts via @prompt:id in chat.
 * Uses JSON file persistence via loadStore/saveStore.
 */

import { loadStore, saveStore } from '../persistence.js';
import crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────────

export interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string; // userId
}

interface PromptStore {
  prompts: Prompt[];
}

const STORE_NAME = 'prompts';

// ── Helpers ────────────────────────────────────────────────────────

function load(): PromptStore {
  return loadStore<PromptStore>(STORE_NAME, { prompts: [] });
}

function save(data: PromptStore): void {
  saveStore(STORE_NAME, data);
}

// ── CRUD ───────────────────────────────────────────────────────────

export function listPrompts(userId: string): Prompt[] {
  const store = load();
  return store.prompts.filter(p => p.createdBy === userId);
}

export function getPrompt(promptId: string): Prompt | null {
  const store = load();
  return store.prompts.find(p => p.id === promptId) || null;
}

export function createPrompt(
  userId: string,
  title: string,
  description: string,
  content: string,
): Prompt {
  const store = load();
  const now = Date.now();
  const prompt: Prompt = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: description.trim(),
    content,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };
  store.prompts.push(prompt);
  save(store);
  return prompt;
}

export function updatePrompt(
  promptId: string,
  updates: Partial<Pick<Prompt, 'title' | 'description' | 'content'>>,
): Prompt | null {
  const store = load();
  const idx = store.prompts.findIndex(p => p.id === promptId);
  if (idx === -1) return null;

  if (updates.title !== undefined) store.prompts[idx].title = updates.title.trim();
  if (updates.description !== undefined) store.prompts[idx].description = updates.description.trim();
  if (updates.content !== undefined) store.prompts[idx].content = updates.content;
  store.prompts[idx].updatedAt = Date.now();

  save(store);
  return store.prompts[idx];
}

export function deletePrompt(promptId: string): boolean {
  const store = load();
  const before = store.prompts.length;
  store.prompts = store.prompts.filter(p => p.id !== promptId);
  if (store.prompts.length < before) {
    save(store);
    return true;
  }
  return false;
}

// ── Prompt Reference Replacement ──────────────────────────────────

/**
 * Replace @prompt:id references in a string with actual prompt content.
 * Used in the chat pipeline before sending to AI.
 */
export function replacePromptReferences(text: string): string {
  if (!text || !text.includes('@prompt:')) return text;

  const store = load();
  return text.replace(/@prompt:([a-f0-9-]+)/g, (_match, id) => {
    const prompt = store.prompts.find(p => p.id === id);
    return prompt ? prompt.content : _match;
  });
}

/**
 * Get multiple prompts by IDs (for batch lookups).
 */
export function getPromptsByIds(ids: string[]): Record<string, Prompt> {
  const store = load();
  const result: Record<string, Prompt> = {};
  for (const p of store.prompts) {
    if (ids.includes(p.id)) {
      result[p.id] = p;
    }
  }
  return result;
}
