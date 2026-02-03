/**
 * Enhanced Model Selector
 *
 * A comprehensive dropdown for selecting AI models with:
 * - Search functionality
 * - Grouping by provider
 * - Speed/cost indicators
 * - Recommended badges
 * - Quick switch buttons for recent models
 */

import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';
import {
  AVAILABLE_MODELS,
  PROVIDERS,
  selectedModelStore,
  selectedModelIdStore,
  recentModelsStore,
  selectModel,
  searchModels,
  getModelsByProvider,
  getSpeedInfo,
  getCostInfo,
  formatContextWindow,
  type ModelMetadata,
  type Provider,
} from '~/lib/stores/model-selection';

interface EnhancedModelSelectorProps {
  className?: string;
  compact?: boolean;
}

export function EnhancedModelSelector({ className, compact = false }: EnhancedModelSelectorProps) {
  const selectedModel = useStore(selectedModelStore);
  const recentModels = useStore(recentModelsStore);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return AVAILABLE_MODELS;
    }
    return searchModels(searchQuery);
  }, [searchQuery]);

  // Group filtered models by provider
  const groupedModels = useMemo(() => {
    const grouped = new Map<Provider, ModelMetadata[]>();
    for (const model of filteredModels) {
      const existing = grouped.get(model.provider) || [];
      existing.push(model);
      grouped.set(model.provider, existing);
    }
    return grouped;
  }, [filteredModels]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when dropdown opens
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleModelSelect = useCallback((modelId: string) => {
    selectModel(modelId);
    setIsOpen(false);
    setSearchQuery('');
  }, []);

  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Get provider info for display
  const providerInfo = PROVIDERS[selectedModel.provider];
  const speedInfo = getSpeedInfo(selectedModel.speed);
  const costInfo = getCostInfo(selectedModel.costTier);

  return (
    <div ref={dropdownRef} className={classNames('relative', className)}>
      {/* Main Button */}
      <button
        onClick={toggleDropdown}
        className={classNames(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
          'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3 hover:border-bolt-elements-borderColorActive',
          'text-bolt-elements-textPrimary font-medium',
          compact ? 'text-xs h-[32px]' : 'text-sm h-[38px]'
        )}
      >
        {/* Provider Icon */}
        <div
          className={classNames(providerInfo.icon, compact ? 'text-sm' : 'text-base')}
          style={{ color: providerInfo.color }}
        />

        {/* Model Name */}
        <span className="truncate max-w-[180px]">{selectedModel.name}</span>

        {/* Quick Indicators */}
        {!compact && (
          <div className="flex items-center gap-1 ml-1">
            <div
              className={classNames(speedInfo.icon, 'text-xs', speedInfo.color)}
              title={speedInfo.label}
            />
            <span className={classNames('text-[10px]', costInfo.color)}>{costInfo.label}</span>
          </div>
        )}

        {/* Dropdown Arrow */}
        <div className="i-ph:caret-down text-xs text-bolt-elements-textSecondary" />
      </button>

      {/* Quick Switch - Recent Models */}
      {!compact && recentModels.length > 1 && (
        <div className="flex items-center gap-1 mt-1">
          {recentModels.slice(1, 4).map((model) => (
            <button
              key={model.id}
              onClick={() => handleModelSelect(model.id)}
              className={classNames(
                'px-2 py-0.5 rounded text-[10px] transition-colors',
                'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4',
                'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                'border border-transparent hover:border-bolt-elements-borderColor'
              )}
              title={`Switch to ${model.name}`}
            >
              {model.name.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={classNames(
            'absolute z-[1000] mt-1 rounded-xl shadow-2xl overflow-hidden',
            'border border-bolt-elements-borderColor',
            'w-[380px] max-h-[480px]'
          )}
          style={{ backgroundColor: 'var(--bolt-elements-bg-depth-1)' }}
        >
          {/* Search Input */}
          <div className="p-3 border-b border-bolt-elements-borderColor sticky top-0 bg-bolt-elements-background-depth-1 z-10">
            <div className="relative">
              <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textSecondary" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className={classNames(
                  'w-full pl-9 pr-3 py-2 rounded-lg text-sm',
                  'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                  'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                  'focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20'
                )}
              />
            </div>
          </div>

          {/* Model List */}
          <div className="overflow-y-auto max-h-[400px]">
            {/* Recent Models Section */}
            {!searchQuery && recentModels.length > 0 && (
              <div className="py-2">
                <div className="px-3 py-1 text-[10px] font-semibold text-bolt-elements-textTertiary uppercase tracking-wider">
                  Recent
                </div>
                {recentModels.slice(0, 3).map((model) => (
                  <ModelItem
                    key={`recent-${model.id}`}
                    model={model}
                    isSelected={model.id === selectedModel.id}
                    onSelect={handleModelSelect}
                  />
                ))}
                <div className="border-b border-bolt-elements-borderColor my-2" />
              </div>
            )}

            {/* Grouped Models */}
            {Array.from(groupedModels.entries()).map(([provider, models]) => {
              const info = PROVIDERS[provider];
              return (
                <div key={provider} className="py-2">
                  {/* Provider Header */}
                  <div className="px-3 py-1 flex items-center gap-2">
                    <div className={classNames(info.icon, 'text-sm')} style={{ color: info.color }} />
                    <span className="text-xs font-semibold text-bolt-elements-textSecondary">
                      {info.name}
                    </span>
                    <span className="text-[10px] text-bolt-elements-textTertiary">
                      ({models.length})
                    </span>
                  </div>

                  {/* Models */}
                  {models.map((model) => (
                    <ModelItem
                      key={model.id}
                      model={model}
                      isSelected={model.id === selectedModel.id}
                      onSelect={handleModelSelect}
                    />
                  ))}
                </div>
              );
            })}

            {/* No Results */}
            {filteredModels.length === 0 && (
              <div className="p-6 text-center text-bolt-elements-textTertiary">
                <div className="i-ph:magnifying-glass-minus text-3xl mb-2 opacity-50" />
                <p className="text-sm">No models found for "{searchQuery}"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Individual Model Item Component
interface ModelItemProps {
  model: ModelMetadata;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function ModelItem({ model, isSelected, onSelect }: ModelItemProps) {
  const providerInfo = PROVIDERS[model.provider];
  const speedInfo = getSpeedInfo(model.speed);
  const costInfo = getCostInfo(model.costTier);

  return (
    <button
      onClick={() => onSelect(model.id)}
      className={classNames(
        'w-full px-3 py-2.5 flex items-start gap-3 transition-colors text-left',
        isSelected ? 'bg-amber-500/10' : 'hover:bg-bolt-elements-background-depth-2'
      )}
    >
      {/* Selection Indicator */}
      <div className="flex-shrink-0 pt-0.5">
        {isSelected ? (
          <div className="i-ph:check-circle-fill text-amber-500" />
        ) : (
          <div className="w-4 h-4 rounded-full border border-bolt-elements-borderColor" />
        )}
      </div>

      {/* Model Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Model Name */}
          <span
            className={classNames(
              'font-medium truncate',
              isSelected ? 'text-amber-500' : 'text-bolt-elements-textPrimary'
            )}
          >
            {model.name}
          </span>

          {/* Badges */}
          {model.recommended && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/20 text-amber-400">
              Recommended
            </span>
          )}
          {model.new && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/20 text-green-400">
              New
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-[11px] text-bolt-elements-textTertiary mt-0.5 line-clamp-1">
          {model.description}
        </p>

        {/* Metadata Row */}
        <div className="flex items-center gap-3 mt-1">
          {/* Context Window */}
          <span className="text-[10px] text-bolt-elements-textTertiary flex items-center gap-1">
            <div className="i-ph:stack" />
            {formatContextWindow(model.contextWindow)}
          </span>

          {/* Speed */}
          <span className={classNames('text-[10px] flex items-center gap-1', speedInfo.color)}>
            <div className={speedInfo.icon} />
            {speedInfo.label}
          </span>

          {/* Cost */}
          <span className={classNames('text-[10px]', costInfo.color)}>{costInfo.label}</span>

          {/* Capabilities */}
          {model.supportsVision && (
            <span className="text-[10px] text-blue-400 flex items-center gap-1" title="Supports vision">
              <div className="i-ph:eye" />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// Compact version that just shows model name and dropdown
export function CompactModelSelector({ className }: { className?: string }) {
  return <EnhancedModelSelector className={className} compact />;
}
