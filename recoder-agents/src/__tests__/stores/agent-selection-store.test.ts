import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAgentSelectionStore } from '@/stores/agent-selection-store';

// Helper to build agent fixtures
function makeAgent(id: string, name: string, isDefault = false) {
  return {
    agent_id: id,
    name,
    metadata: isDefault ? { is_recoder_default: true } : undefined,
  };
}

describe('useAgentSelectionStore', () => {
  beforeEach(() => {
    // Reset the store between tests
    const { clearSelection } = useAgentSelectionStore.getState();
    clearSelection();
  });

  it('starts with no selection', () => {
    const { selectedAgentId, hasInitialized } = useAgentSelectionStore.getState();
    expect(selectedAgentId).toBeUndefined();
    expect(hasInitialized).toBe(false);
  });

  describe('setSelectedAgent', () => {
    it('sets the selected agent id', () => {
      useAgentSelectionStore.getState().setSelectedAgent('agent-1');
      expect(useAgentSelectionStore.getState().selectedAgentId).toBe('agent-1');
    });

    it('can clear by passing undefined', () => {
      useAgentSelectionStore.getState().setSelectedAgent('agent-1');
      useAgentSelectionStore.getState().setSelectedAgent(undefined);
      expect(useAgentSelectionStore.getState().selectedAgentId).toBeUndefined();
    });
  });

  describe('initializeFromAgents', () => {
    it('picks the default recoder agent when available', () => {
      const agents = [
        makeAgent('custom-1', 'Custom'),
        makeAgent('recoder-default', 'Recoder', true),
      ];

      useAgentSelectionStore.getState().initializeFromAgents(agents);

      expect(useAgentSelectionStore.getState().selectedAgentId).toBe('recoder-default');
      expect(useAgentSelectionStore.getState().hasInitialized).toBe(true);
    });

    it('falls back to the first agent when no default exists', () => {
      const agents = [makeAgent('a', 'Alpha'), makeAgent('b', 'Beta')];

      useAgentSelectionStore.getState().initializeFromAgents(agents);

      expect(useAgentSelectionStore.getState().selectedAgentId).toBe('a');
    });

    it('prefers threadAgentId over default', () => {
      const agents = [
        makeAgent('a', 'Alpha'),
        makeAgent('b', 'Beta', true),
      ];

      useAgentSelectionStore.getState().initializeFromAgents(agents, 'a');

      expect(useAgentSelectionStore.getState().selectedAgentId).toBe('a');
    });

    it('does not re-initialize once already initialized', () => {
      const agents = [makeAgent('a', 'Alpha'), makeAgent('b', 'Beta')];

      useAgentSelectionStore.getState().initializeFromAgents(agents);
      // Second call with different intent should be ignored
      useAgentSelectionStore.getState().initializeFromAgents(agents, 'b');

      expect(useAgentSelectionStore.getState().selectedAgentId).toBe('a');
    });

    it('calls onAgentSelect callback', () => {
      const agents = [makeAgent('a', 'Alpha')];
      const onSelect = vi.fn();

      useAgentSelectionStore.getState().initializeFromAgents(agents, undefined, onSelect);

      expect(onSelect).toHaveBeenCalledWith('a');
    });
  });

  describe('autoSelectAgent', () => {
    it('selects the default agent when no current selection', () => {
      const agents = [
        makeAgent('custom', 'Custom'),
        makeAgent('default', 'Default', true),
      ];

      useAgentSelectionStore.getState().autoSelectAgent(agents);

      expect(useAgentSelectionStore.getState().selectedAgentId).toBe('default');
    });

    it('does nothing when currentSelectedAgentId is provided', () => {
      const agents = [makeAgent('a', 'Alpha')];

      useAgentSelectionStore.getState().autoSelectAgent(agents, undefined, 'existing-id');

      expect(useAgentSelectionStore.getState().selectedAgentId).toBeUndefined();
    });

    it('does nothing with empty agents list', () => {
      useAgentSelectionStore.getState().autoSelectAgent([]);
      expect(useAgentSelectionStore.getState().selectedAgentId).toBeUndefined();
    });
  });

  describe('getCurrentAgent', () => {
    it('returns the matching agent object', () => {
      const agents = [makeAgent('a', 'Alpha'), makeAgent('b', 'Beta')];
      useAgentSelectionStore.getState().setSelectedAgent('b');

      const current = useAgentSelectionStore.getState().getCurrentAgent(agents);

      expect(current).toEqual(agents[1]);
    });

    it('returns null when no agent is selected', () => {
      const agents = [makeAgent('a', 'Alpha')];
      expect(useAgentSelectionStore.getState().getCurrentAgent(agents)).toBeNull();
    });
  });

  describe('clearSelection', () => {
    it('resets both selectedAgentId and hasInitialized', () => {
      useAgentSelectionStore.getState().setSelectedAgent('x');
      useAgentSelectionStore.getState().initializeFromAgents([makeAgent('x', 'X')]);

      useAgentSelectionStore.getState().clearSelection();

      const { selectedAgentId, hasInitialized } = useAgentSelectionStore.getState();
      expect(selectedAgentId).toBeUndefined();
      expect(hasInitialized).toBe(false);
    });
  });

  describe('isRecoderAgent', () => {
    it('returns true when selected agent is the default recoder agent', () => {
      const agents = [makeAgent('r', 'Recoder', true)];
      useAgentSelectionStore.getState().setSelectedAgent('r');

      expect(useAgentSelectionStore.getState().isRecoderAgent(agents)).toBe(true);
    });

    it('returns true when no agent is selected (undefined defaults to recoder)', () => {
      const agents = [makeAgent('a', 'Custom')];
      expect(useAgentSelectionStore.getState().isRecoderAgent(agents)).toBe(true);
    });

    it('returns false for a non-default custom agent', () => {
      const agents = [makeAgent('c', 'Custom')];
      useAgentSelectionStore.getState().setSelectedAgent('c');

      expect(useAgentSelectionStore.getState().isRecoderAgent(agents)).toBe(false);
    });
  });
});
