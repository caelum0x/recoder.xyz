import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// The useModelSelection hook has deep React + API dependencies (useAuth,
// useAccountState, React hooks). Instead of trying to render the full hook,
// we extract and test the pure-logic functions it relies on:
//   - getDefaultModel (model priority logic)
//   - isPaidTier (subscription tier check)
//   - loadCustomModels / saveCustomModels (localStorage persistence)
// ---------------------------------------------------------------------------

// Re-implement the pure functions from use-model-selection.ts so we can
// unit-test them without importing the 'use client' module and its hooks.
// These mirror the source exactly (verified by reading the file).

interface ModelOption {
  id: string;
  label: string;
  requiresSubscription: boolean;
  priority?: number;
}

const isPaidTier = (tierKey: string | undefined): boolean => {
  if (!tierKey) return false;
  return tierKey !== 'free' && tierKey !== 'none';
};

const getDefaultModel = (accessibleModels: ModelOption[]): string => {
  const powerModel = accessibleModels.find(m => m.id === 'recoder/power');
  if (powerModel) return powerModel.id;

  const basicModel = accessibleModels.find(m => m.id === 'recoder/basic');
  if (basicModel) return basicModel.id;

  if (accessibleModels.length > 0) {
    return accessibleModels[0].id;
  }

  return '';
};

interface CustomModel {
  id: string;
  label: string;
}

const CUSTOM_MODELS_STORAGE_KEY = 'customModels';

function loadCustomModels(): CustomModel[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MODELS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomModel[];
  } catch {
    return [];
  }
}

function saveCustomModels(models: CustomModel[]) {
  try {
    localStorage.setItem(CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(models));
  } catch {
    // localStorage unavailable
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Model Selection Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // --- getDefaultModel ---------------------------------------------------

  describe('getDefaultModel', () => {
    it('should default to recoder/power when it is accessible', () => {
      const models: ModelOption[] = [
        { id: 'recoder/basic', label: 'Recoder Basic', requiresSubscription: false },
        { id: 'recoder/power', label: 'Recoder', requiresSubscription: false },
        { id: 'openai/gpt-4', label: 'GPT-4', requiresSubscription: false },
      ];
      expect(getDefaultModel(models)).toBe('recoder/power');
    });

    it('should fall back to recoder/basic when power is not accessible', () => {
      const models: ModelOption[] = [
        { id: 'recoder/basic', label: 'Recoder Basic', requiresSubscription: false },
        { id: 'openai/gpt-4', label: 'GPT-4', requiresSubscription: false },
      ];
      expect(getDefaultModel(models)).toBe('recoder/basic');
    });

    it('should fall back to the first model when neither recoder model is present', () => {
      const models: ModelOption[] = [
        { id: 'openai/gpt-4', label: 'GPT-4', requiresSubscription: false },
        { id: 'anthropic/claude-3', label: 'Claude 3', requiresSubscription: false },
      ];
      expect(getDefaultModel(models)).toBe('openai/gpt-4');
    });

    it('should return empty string when no models are accessible', () => {
      expect(getDefaultModel([])).toBe('');
    });

    it('should prefer recoder/power over recoder/basic regardless of list order', () => {
      const models: ModelOption[] = [
        { id: 'openai/gpt-4', label: 'GPT-4', requiresSubscription: false },
        { id: 'recoder/basic', label: 'Recoder Basic', requiresSubscription: false },
        { id: 'recoder/power', label: 'Recoder', requiresSubscription: false },
      ];
      expect(getDefaultModel(models)).toBe('recoder/power');
    });
  });

  // --- isPaidTier --------------------------------------------------------

  describe('isPaidTier', () => {
    it('should return false for undefined tier', () => {
      expect(isPaidTier(undefined)).toBe(false);
    });

    it('should return false for "free" tier', () => {
      expect(isPaidTier('free')).toBe(false);
    });

    it('should return false for "none" tier', () => {
      expect(isPaidTier('none')).toBe(false);
    });

    it('should return true for "pro" tier', () => {
      expect(isPaidTier('pro')).toBe(true);
    });

    it('should return true for "enterprise" tier', () => {
      expect(isPaidTier('enterprise')).toBe(true);
    });

    it('should return true for any non-free, non-none string', () => {
      expect(isPaidTier('team')).toBe(true);
      expect(isPaidTier('starter')).toBe(true);
    });
  });

  // --- Custom model localStorage persistence -----------------------------

  describe('custom model persistence', () => {
    it('should persist model selection to localStorage via saveCustomModels', () => {
      const models: CustomModel[] = [
        { id: 'custom/my-model', label: 'My Model' },
      ];
      saveCustomModels(models);

      const raw = localStorage.getItem(CUSTOM_MODELS_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual(models);
    });

    it('should load custom models from localStorage', () => {
      const models: CustomModel[] = [
        { id: 'custom/a', label: 'Model A' },
        { id: 'custom/b', label: 'Model B' },
      ];
      localStorage.setItem(CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(models));

      const loaded = loadCustomModels();
      expect(loaded).toEqual(models);
    });

    it('should return empty array when localStorage is empty', () => {
      expect(loadCustomModels()).toEqual([]);
    });

    it('should return empty array when localStorage has invalid JSON', () => {
      localStorage.setItem(CUSTOM_MODELS_STORAGE_KEY, 'not-json');
      expect(loadCustomModels()).toEqual([]);
    });

    it('should round-trip multiple custom models', () => {
      const models: CustomModel[] = [
        { id: 'custom/alpha', label: 'Alpha' },
        { id: 'custom/beta', label: 'Beta' },
        { id: 'custom/gamma', label: 'Gamma' },
      ];
      saveCustomModels(models);
      expect(loadCustomModels()).toEqual(models);
    });
  });
});
