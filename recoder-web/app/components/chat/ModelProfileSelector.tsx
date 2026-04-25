/**
 * Model Profile Selector
 *
 * Compact 3-button pill group for switching between Fast / Balanced / Powerful profiles.
 * Active profile gets highlighted background + colored border.
 * Clicking a profile changes the AI model. Long-press or secondary click opens
 * a small dropdown to customise the model backing that profile.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import {
  activeProfileIdStore,
  profilesStore,
  autoSelectedStore,
  setActiveProfile,
  customizeProfile,
  resetProfile,
  type ProfileId,
} from '~/lib/stores/model-profiles';
import { AVAILABLE_MODELS, type ModelMetadata } from '~/lib/stores/model-selection';

// ── Color helpers ───────────────────────────────────────────────────

const PROFILE_COLORS: Record<string, { active: string; hover: string; text: string }> = {
  green: {
    active: 'bg-black border-green-500/40 text-white',
    hover: 'hover:bg-zinc-900',
    text: 'text-green-400',
  },
  blue: {
    active: 'bg-black border-blue-500/40 text-white',
    hover: 'hover:bg-zinc-900',
    text: 'text-blue-400',
  },
  purple: {
    active: 'bg-black border-purple-500/40 text-white',
    hover: 'hover:bg-zinc-900',
    text: 'text-purple-400',
  },
};

// ── Component ───────────────────────────────────────────────────────

export function ModelProfileSelector() {
  const activeId = useStore(activeProfileIdStore);
  const profiles = useStore(profilesStore);
  const isAutoSelected = useStore(autoSelectedStore);

  const [customizeOpen, setCustomizeOpen] = useState<ProfileId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCustomizeOpen(null);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleProfileClick = useCallback(
    (id: ProfileId) => {
      if (id === activeId && !customizeOpen) {
        // Already active — open customise dropdown
        setCustomizeOpen(id);
        return;
      }
      setCustomizeOpen(null);
      setSearchQuery('');
      setActiveProfile(id);
    },
    [activeId, customizeOpen],
  );

  const handleModelSelect = useCallback(
    (profileId: ProfileId, modelId: string) => {
      customizeProfile(profileId, modelId);
      setCustomizeOpen(null);
      setSearchQuery('');
    },
    [],
  );

  const handleReset = useCallback(
    (profileId: ProfileId) => {
      resetProfile(profileId);
      setCustomizeOpen(null);
      setSearchQuery('');
    },
    [],
  );

  const filteredModels = searchQuery
    ? AVAILABLE_MODELS.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : AVAILABLE_MODELS;

  const profileIds: ProfileId[] = ['fast', 'balanced', 'powerful'];

  return (
    <div ref={dropdownRef} className="relative flex items-center">
      {/* Pill group */}
      <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-black">
        {profileIds.map((id) => {
          const profile = profiles[id];
          const isActive = id === activeId;
          const colors = PROFILE_COLORS[profile.color] || PROFILE_COLORS.blue;

          return (
            <button
              key={id}
              onClick={() => handleProfileClick(id)}
              className={`
                relative flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors
                ${isActive ? colors.active : `bg-black text-gray-300 ${colors.hover}`}
                ${id !== 'fast' ? 'border-l border-white/10' : ''}
              `}
              title={`${profile.label}: ${profile.description} (${profile.modelId})`}
            >
              <div className={profile.icon} />
              <span>{profile.label}</span>
              {isActive && isAutoSelected && (
                <span className="ml-0.5 text-[9px] opacity-60 font-normal">auto</span>
              )}
              {isActive && (
                <div className="i-ph:caret-down text-[10px] opacity-50 ml-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Customize dropdown */}
      {customizeOpen && (
        <div
          className="absolute top-full left-0 mt-1 w-72 rounded-lg shadow-lg z-50 overflow-hidden bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-recoder-elements-borderColor">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-recoder-elements-textPrimary">
                Customize {profiles[customizeOpen].label} Profile
              </span>
              <button
                onClick={() => handleReset(customizeOpen)}
                className="text-[10px] text-recoder-elements-textPrimary/40 hover:text-recoder-elements-textPrimary/70 transition-colors"
              >
                Reset
              </button>
            </div>
            <div className="text-[10px] text-recoder-elements-textPrimary/40 mt-0.5">
              Current: {profiles[customizeOpen].modelId}
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-recoder-elements-borderColor">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary text-xs rounded px-2 py-1.5 border border-recoder-elements-borderColor outline-none focus:border-recoder-elements-borderColor/80 placeholder:text-recoder-elements-textPrimary/30"
              autoFocus
            />
          </div>

          {/* Model list */}
          <div className="max-h-60 overflow-y-auto">
            {filteredModels.map((model) => (
              <ModelOption
                key={model.id}
                model={model}
                isSelected={profiles[customizeOpen].modelId === model.id}
                onSelect={() => handleModelSelect(customizeOpen, model.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: Model option row ─────────────────────────────────

function ModelOption({
  model,
  isSelected,
  onSelect,
}: {
  model: ModelMetadata;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const speedColors: Record<string, string> = {
    fast: 'text-green-400',
    balanced: 'text-blue-400',
    powerful: 'text-purple-400',
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-recoder-elements-background-depth-3 ${
        isSelected ? 'bg-recoder-elements-background-depth-3' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-recoder-elements-textPrimary truncate">
            {model.name}
          </span>
          {model.isFree && (
            <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full font-medium ml-1">
              FREE
            </span>
          )}
          {model.new && (
            <span className="text-[9px] px-1 py-0 rounded bg-blue-500/20 text-blue-400 font-medium">
              NEW
            </span>
          )}
        </div>
        <div className="text-[10px] text-recoder-elements-textPrimary/40 truncate mt-0.5">
          {model.id}
        </div>
      </div>
      <span className={`text-[10px] ${speedColors[model.speed] || 'text-recoder-elements-textPrimary/40'}`}>
        {model.speed}
      </span>
      {isSelected && <div className="i-ph:check text-green-400 text-sm flex-shrink-0" />}
    </button>
  );
}

export default ModelProfileSelector;
