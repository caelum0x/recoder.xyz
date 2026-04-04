/**
 * Model Profiles Store
 *
 * Three named profiles (Fast / Balanced / Powerful) for quick model switching.
 * Each profile maps to a provider+model combo. User-customizable, persisted to localStorage.
 */

import { atom, computed } from 'nanostores';
import { selectModel } from './model-selection';
import type { ChatMode } from './chat-mode';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ModelProfiles');

// ── Types ──────────────────────────────────────────────────────────

export type ProfileId = 'fast' | 'balanced' | 'powerful';

export interface ModelProfile {
  id: ProfileId;
  label: string;
  icon: string;
  color: string;
  modelId: string; // OpenRouter model ID e.g. "google/gemini-2.5-flash"
  description: string;
}

// ── Defaults ───────────────────────────────────────────────────────

const DEFAULT_PROFILES: Record<ProfileId, ModelProfile> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    icon: 'i-ph:lightning-bold',
    color: 'green',
    modelId: 'openrouter/free',
    description: 'Free models, quick responses',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    icon: 'i-ph:scales-bold',
    color: 'blue',
    modelId: 'openrouter/free',
    description: 'Free models, best quality',
  },
  powerful: {
    id: 'powerful',
    label: 'Powerful',
    icon: 'i-ph:brain-bold',
    color: 'purple',
    modelId: 'openrouter/free',
    description: 'Free models, max quality',
  },
};

// ── Persistence ────────────────────────────────────────────────────

const STORAGE_KEY = 'recoder_model_profiles';

function loadProfiles(): Record<ProfileId, ModelProfile> {
  if (typeof window === 'undefined') return { ...DEFAULT_PROFILES };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<ProfileId, Partial<ModelProfile>>;
      // Merge with defaults so new fields are always present
      return {
        fast: { ...DEFAULT_PROFILES.fast, ...parsed.fast },
        balanced: { ...DEFAULT_PROFILES.balanced, ...parsed.balanced },
        powerful: { ...DEFAULT_PROFILES.powerful, ...parsed.powerful },
      };
    }
  } catch (e) {
    logger.error('[ModelProfiles] Failed to load profiles:', e);
  }

  return { ...DEFAULT_PROFILES };
}

function saveProfiles(profiles: Record<ProfileId, ModelProfile>): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    logger.error('[ModelProfiles] Failed to save profiles:', e);
  }
}

// ── Stores ─────────────────────────────────────────────────────────

export const activeProfileIdStore = atom<ProfileId>('balanced');
export const profilesStore = atom<Record<ProfileId, ModelProfile>>(loadProfiles());

/** Whether the current profile was auto-selected by a mode change */
export const autoSelectedStore = atom<boolean>(false);

/** Derived: the full ModelProfile for the active profile */
export const activeProfileStore = computed(
  [activeProfileIdStore, profilesStore],
  (id, profiles) => profiles[id],
);

/** Derived: the model ID for the active profile */
export const activeProfileModelStore = computed(activeProfileStore, (profile) => profile.modelId);

// ── Actions ────────────────────────────────────────────────────────

/**
 * Switch active profile and update the selected model.
 */
export function setActiveProfile(id: ProfileId, auto = false): void {
  activeProfileIdStore.set(id);
  autoSelectedStore.set(auto);

  const profiles = profilesStore.get();
  const profile = profiles[id];
  if (profile) {
    selectModel(profile.modelId);
  }
}

/**
 * Customize a profile to use a different model.
 */
export function customizeProfile(profileId: ProfileId, modelId: string): void {
  const profiles = profilesStore.get();
  const updated = {
    ...profiles,
    [profileId]: { ...profiles[profileId], modelId },
  };
  profilesStore.set(updated);
  saveProfiles(updated);

  // If this is the active profile, also update the selected model
  if (activeProfileIdStore.get() === profileId) {
    selectModel(modelId);
  }
}

/**
 * Reset a profile to its default model.
 */
export function resetProfile(profileId: ProfileId): void {
  const profiles = profilesStore.get();
  const updated = {
    ...profiles,
    [profileId]: { ...DEFAULT_PROFILES[profileId] },
  };
  profilesStore.set(updated);
  saveProfiles(updated);

  if (activeProfileIdStore.get() === profileId) {
    selectModel(DEFAULT_PROFILES[profileId].modelId);
  }
}

// ── Mode → Profile auto-selection (A4) ─────────────────────────────

const MODE_PROFILE_MAP: Record<ChatMode, ProfileId> = {
  build: 'powerful',
  ask: 'balanced',
  agent: 'balanced',
  'deep-coding': 'powerful',
};

const ERROR_FIX_PROFILE: ProfileId = 'fast';

/**
 * Auto-select the best profile for a given chat mode.
 */
export function autoSelectProfileForMode(mode: ChatMode): void {
  const target = MODE_PROFILE_MAP[mode];
  if (target) {
    setActiveProfile(target, true);
  }
}

/**
 * Select the fast profile for auto-fix operations.
 */
export function selectErrorFixProfile(): void {
  setActiveProfile(ERROR_FIX_PROFILE, true);
}

// ── Init: restore persisted active profile ─────────────────────────

if (typeof window !== 'undefined') {
  try {
    const savedId = localStorage.getItem('recoder_active_profile') as ProfileId | null;
    if (savedId && (savedId === 'fast' || savedId === 'balanced' || savedId === 'powerful')) {
      activeProfileIdStore.set(savedId);
    }
  } catch {}

  // Persist active profile on change
  activeProfileIdStore.subscribe((id) => {
    try {
      localStorage.setItem('recoder_active_profile', id);
    } catch {}
  });
}
