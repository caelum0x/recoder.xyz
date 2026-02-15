/**
 * Theme Store — CRUD for custom themes and per-project theme assignments.
 * Uses JSON file persistence via loadStore/saveStore.
 */

import { v4 as uuid } from 'uuid';
import { loadStore, saveStore } from '../persistence.js';
import { BUILTIN_THEMES, type BuiltinTheme } from './builtin-themes.js';

// ── Types ──────────────────────────────────────────────────────────

export interface CustomTheme {
  id: string;
  name: string;
  description: string;
  prompt: string; // wrapped in <theme></theme>
  createdAt: number;
  updatedAt: number;
  createdBy: string; // userId
}

interface ThemesStore {
  customThemes: CustomTheme[];
  projectThemes: Record<string, string>; // projectId → themeId
}

const STORE_NAME = 'themes';

// ── Helpers ────────────────────────────────────────────────────────

function load(): ThemesStore {
  return loadStore<ThemesStore>(STORE_NAME, { customThemes: [], projectThemes: {} });
}

function save(data: ThemesStore): void {
  saveStore(STORE_NAME, data);
}

// ── Custom Theme CRUD ──────────────────────────────────────────────

export function listThemes(userId: string): CustomTheme[] {
  const store = load();
  return store.customThemes.filter((t) => t.createdBy === userId);
}

export function listAllThemes(): CustomTheme[] {
  return load().customThemes;
}

export function createTheme(
  userId: string,
  name: string,
  description: string,
  prompt: string,
): CustomTheme {
  const store = load();
  const theme: CustomTheme = {
    id: uuid(),
    name,
    description,
    prompt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: userId,
  };
  store.customThemes.push(theme);
  save(store);
  return theme;
}

export function updateTheme(
  themeId: string,
  updates: Partial<Pick<CustomTheme, 'name' | 'description' | 'prompt'>>,
): CustomTheme | null {
  const store = load();
  const idx = store.customThemes.findIndex((t) => t.id === themeId);
  if (idx === -1) return null;
  const theme = store.customThemes[idx];
  if (updates.name !== undefined) theme.name = updates.name;
  if (updates.description !== undefined) theme.description = updates.description;
  if (updates.prompt !== undefined) theme.prompt = updates.prompt;
  theme.updatedAt = Date.now();
  save(store);
  return theme;
}

export function deleteTheme(themeId: string): boolean {
  const store = load();
  const before = store.customThemes.length;
  store.customThemes = store.customThemes.filter((t) => t.id !== themeId);
  // Also remove any project assignments referencing this theme
  for (const [pid, tid] of Object.entries(store.projectThemes)) {
    if (tid === themeId) delete store.projectThemes[pid];
  }
  if (store.customThemes.length !== before) {
    save(store);
    return true;
  }
  return false;
}

// ── Per-project Theme Assignment ───────────────────────────────────

export function getProjectTheme(projectId: string): string | null {
  const store = load();
  return store.projectThemes[projectId] || null;
}

export function setProjectTheme(projectId: string, themeId: string): void {
  const store = load();
  store.projectThemes[projectId] = themeId;
  save(store);
}

export function removeProjectTheme(projectId: string): void {
  const store = load();
  delete store.projectThemes[projectId];
  save(store);
}

// ── Built-in Theme Lookup ──────────────────────────────────────────

export function getBuiltinTheme(themeId: string): BuiltinTheme | null {
  return BUILTIN_THEMES.find((t) => t.id === themeId) || null;
}

/**
 * Resolve a theme ID to its prompt text.
 * Checks built-ins first, then custom themes for the given user.
 */
export function resolveThemePrompt(themeId: string, userId: string): string | null {
  // Check built-in themes
  const builtin = getBuiltinTheme(themeId);
  if (builtin) return builtin.prompt;

  // Check custom themes
  const store = load();
  const custom = store.customThemes.find((t) => t.id === themeId);
  if (custom) return custom.prompt;

  return null;
}
