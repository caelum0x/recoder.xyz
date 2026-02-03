'use client';

import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react';
import classNames from 'classnames';
import { SearchIcon, ChevronDownIcon } from './icons';
import type { ModelPickerGroup, ModelOption } from './types';

interface ModelPickerProps {
  currentProvider: string;
  currentModelId: string;
  groups?: ModelPickerGroup[];
  onSelect: (provider: string, modelId: string) => void;
  width?: number;
  searchPlaceholder?: string;
  fullWidth?: boolean;
}

// Default model groups for common providers
const DEFAULT_GROUPS: ModelPickerGroup[] = [
  {
    provider: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
  },
  {
    provider: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    ],
  },
  {
    provider: 'google',
    label: 'Google',
    models: [
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
    ],
  },
];

export function ModelPicker({
  currentProvider,
  currentModelId,
  groups = DEFAULT_GROUPS,
  onSelect,
  width = 320,
  searchPlaceholder = 'Search models...',
  fullWidth = true,
}: ModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | 'all'>(
    currentProvider || 'all'
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter groups based on search and provider
  const filteredGroups = useMemo(() => {
    const safeGroups = Array.isArray(groups) ? groups : [];
    const lowerQ = query.trim().toLowerCase();

    const base =
      providerFilter === 'all'
        ? safeGroups
        : safeGroups.filter((g) => g.provider === providerFilter);

    return base.map((g) => ({
      ...g,
      models: lowerQ
        ? (g.models ?? []).filter((m) =>
            (m.label || m.id).toLowerCase().includes(lowerQ)
          )
        : (g.models ?? []),
    })).filter((g) => g.models.length > 0);
  }, [groups, providerFilter, query]);

  // Get current model display label
  const currentModelLabel = useMemo(() => {
    for (const group of groups) {
      const model = group.models.find((m) => m.id === currentModelId);
      if (model) {
        return `${group.label || group.provider} / ${model.label || model.id}`;
      }
    }
    return `${currentProvider} / ${currentModelId}`;
  }, [groups, currentProvider, currentModelId]);

  // Get unique providers
  const providers = useMemo(() => {
    return ['all', ...new Set(groups.map((g) => g.provider))];
  }, [groups]);

  return (
    <div ref={containerRef} className="relative" style={{ width: fullWidth ? '100%' : width }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(
          'w-full flex justify-between items-center gap-2 px-3 py-2 rounded-lg',
          'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-sm text-bolt-elements-textPrimary',
          'hover:bg-bolt-elements-background-depth-3 hover:border-bolt-elements-borderColor transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-accent-500/50'
        )}
      >
        <span className="truncate">{currentModelLabel}</span>
        <ChevronDownIcon
          className={classNames(
            'w-4 h-4 text-bolt-elements-textTertiary transition-transform',
            isOpen && 'transform rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute z-50 mt-1 w-full bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-xl overflow-hidden"
          style={{ width }}
        >
          {/* Search Input */}
          <div className="p-2 border-b border-bolt-elements-borderColor">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-bolt-elements-background-depth-2 rounded-lg">
              <SearchIcon className="w-4 h-4 text-bolt-elements-textTertiary" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent border-none text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none"
              />
            </div>
          </div>

          {/* Provider Tabs */}
          <div className="flex gap-1 p-2 border-b border-bolt-elements-borderColor overflow-x-auto">
            {providers.map((p) => {
              const label =
                p === 'all'
                  ? 'All'
                  : groups.find((g) => g.provider === p)?.label || p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProviderFilter(p)}
                  className={classNames(
                    'px-2 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors',
                    providerFilter === p
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Model List */}
          <div className="max-h-64 overflow-y-auto p-2">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-bolt-elements-textTertiary">
                No models found
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.provider} className="mb-2 last:mb-0">
                  <div className="px-2 py-1 text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                    {group.label || group.provider}
                  </div>
                  <div className="space-y-0.5">
                    {group.models.map((model) => {
                      const isSelected =
                        group.provider === currentProvider && model.id === currentModelId;
                      const isDisabled = Boolean(model.disabled);

                      return (
                        <button
                          key={`${group.provider}-${model.id}`}
                          type="button"
                          onClick={() => {
                            if (!isDisabled) {
                              onSelect(group.provider, model.id);
                              setIsOpen(false);
                            }
                          }}
                          disabled={isDisabled}
                          className={classNames(
                            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm',
                            isSelected && 'bg-accent-500/20 text-accent-400',
                            !isSelected && !isDisabled && 'text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
                            isDisabled && 'opacity-50 cursor-not-allowed text-bolt-elements-textTertiary'
                          )}
                        >
                          {model.icon && <span className="flex-shrink-0">{model.icon}</span>}
                          <span className="flex-1 truncate">{model.label || model.id}</span>
                          {model.badge && <span className="flex-shrink-0">{model.badge}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Standalone model selector with label
export function ModelSelector({
  label,
  currentProvider,
  currentModelId,
  groups,
  onSelect,
}: {
  label?: string;
} & ModelPickerProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs text-bolt-elements-textTertiary">{label}</label>
      )}
      <ModelPicker
        currentProvider={currentProvider}
        currentModelId={currentModelId}
        groups={groups}
        onSelect={onSelect}
      />
    </div>
  );
}
