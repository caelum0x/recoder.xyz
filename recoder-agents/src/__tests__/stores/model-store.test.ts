import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore, formatModelName } from '@/stores/model-store';

const STORAGE_KEY = 'recoder-model-selection-v3';

describe('Model Store', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the Zustand store to its initial state between tests.
    // Zustand persist middleware reads from localStorage on init, so clearing
    // localStorage first ensures a clean slate.
    useModelStore.setState({ selectedModel: '' });
  });

  it('should initialize with empty selectedModel', () => {
    const { selectedModel } = useModelStore.getState();
    expect(selectedModel).toBe('');
  });

  it('should update selected model via setSelectedModel', () => {
    useModelStore.getState().setSelectedModel('recoder/power');
    expect(useModelStore.getState().selectedModel).toBe('recoder/power');
  });

  it('should allow changing to a different model', () => {
    useModelStore.getState().setSelectedModel('recoder/power');
    useModelStore.getState().setSelectedModel('recoder/basic');
    expect(useModelStore.getState().selectedModel).toBe('recoder/basic');
  });

  it('should allow setting to an arbitrary model id', () => {
    useModelStore.getState().setSelectedModel('openai/gpt-4-turbo');
    expect(useModelStore.getState().selectedModel).toBe('openai/gpt-4-turbo');
  });

  it('should allow clearing the model by setting empty string', () => {
    useModelStore.getState().setSelectedModel('recoder/power');
    useModelStore.getState().setSelectedModel('');
    expect(useModelStore.getState().selectedModel).toBe('');
  });

  it('should persist to localStorage under the correct key', () => {
    useModelStore.getState().setSelectedModel('recoder/power');

    // Zustand persist middleware writes JSON to localStorage
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.state.selectedModel).toBe('recoder/power');
  });

  it('should only persist selectedModel (partialize)', () => {
    useModelStore.getState().setSelectedModel('recoder/basic');

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    // The partialize config only includes selectedModel
    expect(parsed.state).toHaveProperty('selectedModel');
    // setSelectedModel (the function) should NOT be serialised
    expect(parsed.state).not.toHaveProperty('setSelectedModel');
  });
});

describe('formatModelName', () => {
  it('should capitalise hyphen-separated words', () => {
    expect(formatModelName('gpt-4-turbo')).toBe('Gpt 4 Turbo');
  });

  it('should handle single word', () => {
    expect(formatModelName('claude')).toBe('Claude');
  });

  it('should handle already capitalised input', () => {
    expect(formatModelName('GPT-4')).toBe('GPT 4');
  });

  it('should handle empty string', () => {
    expect(formatModelName('')).toBe('');
  });

  it('should handle model ids with slashes', () => {
    // formatModelName splits on hyphens only, so slashes remain
    expect(formatModelName('openai/gpt-4')).toBe('Openai/gpt 4');
  });
});
