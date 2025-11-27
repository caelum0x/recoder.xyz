import { useEffect, useState } from 'react';
import { getAllProviders, getModelsByProvider, getSpeedIndicator, type ModelInfo, type ProviderConfig } from '~/lib/models';
import { classNames } from '~/utils/classNames';

interface ModelSelectorProps {
  selectedProvider: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onSettingsClick: () => void;
}

export function ModelSelector({
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  onSettingsClick,
}: ModelSelectorProps) {
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);

  const providers = getAllProviders();
  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const models = getModelsByProvider(selectedProvider);
  const currentModel = models.find((m) => m.id === selectedModel);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClick = () => {
      setShowProviderMenu(false);
      setShowModelMenu(false);
    };

    if (showProviderMenu || showModelMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showProviderMenu, showModelMenu]);

  const handleProviderClick = (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation();
    onProviderChange(providerId);
    setShowProviderMenu(false);

    // Auto-select first model of the new provider
    const newProviderModels = getModelsByProvider(providerId);
    if (newProviderModels.length > 0) {
      onModelChange(newProviderModels[0].id);
    }
  };

  const handleModelClick = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    onModelChange(modelId);
    setShowModelMenu(false);
  };

  return (
    <div className="flex items-center gap-2 mb-2 px-4 pt-3">
      {/* Provider Dropdown */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowProviderMenu(!showProviderMenu);
            setShowModelMenu(false);
          }}
          className={classNames(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors text-sm',
            'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
            'hover:bg-bolt-elements-background-depth-3',
            'text-bolt-elements-textPrimary'
          )}
        >
          <span>{currentProvider?.icon}</span>
          <span>{currentProvider?.name || 'Select Provider'}</span>
          {currentProvider?.recommended && (
            <span className="text-xs text-orange-400">★</span>
          )}
          <div className="i-ph:caret-down text-xs" />
        </button>

        {/* Provider Menu */}
        {showProviderMenu && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg shadow-xl z-50 overflow-hidden">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={(e) => handleProviderClick(e, provider.id)}
                className={classNames(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  'hover:bg-bolt-elements-background-depth-4',
                  provider.id === selectedProvider ? 'bg-bolt-elements-item-backgroundActive' : ''
                )}
              >
                <span className="text-xl">{provider.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-bolt-elements-textPrimary">
                      {provider.name}
                    </span>
                    {provider.recommended && (
                      <span className="text-xs text-orange-400">★ Recommended</span>
                    )}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary">
                    {provider.models.length} models available
                  </div>
                </div>
                {provider.id === selectedProvider && (
                  <div className="i-ph:check text-green-500" />
                )}
              </button>
            ))}
            <div className="border-t border-bolt-elements-borderColor">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSettingsClick();
                  setShowProviderMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bolt-elements-background-depth-4 transition-colors"
              >
                <div className="i-ph:gear text-xl text-bolt-elements-textSecondary" />
                <span className="text-sm text-bolt-elements-textSecondary">Manage API Keys</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Model Dropdown */}
      <div className="relative flex-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowModelMenu(!showModelMenu);
            setShowProviderMenu(false);
          }}
          className={classNames(
            'w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border transition-colors text-sm',
            'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
            'hover:bg-bolt-elements-background-depth-3',
            'text-bolt-elements-textPrimary'
          )}
        >
          <span className="truncate">{currentModel?.name || 'Select Model'}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentModel && (
              <>
                <span className="text-xs text-bolt-elements-textSecondary">
                  {getSpeedIndicator(currentModel.speed)}
                </span>
                <span className="text-xs text-bolt-elements-textTertiary">
                  ${currentModel.cost.toFixed(4)}/1K
                </span>
              </>
            )}
            <div className="i-ph:caret-down text-xs" />
          </div>
        </button>

        {/* Model Menu */}
        {showModelMenu && (
          <div className="absolute top-full left-0 mt-1 w-full max-w-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
            {/* Group by category */}
            {['popular', 'budget', 'advanced'].map((category) => {
              const categoryModels = models.filter((m) => m.category === category);

              if (categoryModels.length === 0) return null;

              return (
                <div key={category}>
                  <div className="px-4 py-2 text-xs font-semibold text-bolt-elements-textTertiary uppercase bg-bolt-elements-background-depth-4 sticky top-0">
                    {category === 'popular' && '🔥 Popular Models'}
                    {category === 'budget' && '💰 Budget Models'}
                    {category === 'advanced' && '🧠 Advanced Models'}
                  </div>
                  {categoryModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={(e) => handleModelClick(e, model.id)}
                      className={classNames(
                        'w-full px-4 py-3 text-left transition-colors',
                        'hover:bg-bolt-elements-background-depth-4',
                        model.id === selectedModel ? 'bg-bolt-elements-item-backgroundActive' : ''
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-bolt-elements-textPrimary truncate">
                            {model.name}
                          </div>
                          <div className="text-xs text-bolt-elements-textSecondary mt-0.5">
                            {model.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                          <span className="text-bolt-elements-textTertiary">
                            {getSpeedIndicator(model.speed)}
                          </span>
                          <span className="text-bolt-elements-textTertiary">
                            ${model.cost.toFixed(4)}/1K
                          </span>
                          {model.id === selectedModel && (
                            <div className="i-ph:check text-green-500" />
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-bolt-elements-textTertiary mt-1">
                        Context: {(model.contextLength / 1000).toFixed(0)}K tokens
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings Gear Icon */}
      <button
        onClick={onSettingsClick}
        className={classNames(
          'p-1.5 rounded-lg border transition-colors',
          'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
        )}
        title="Manage API Keys"
      >
        <div className="i-ph:gear text-lg" />
      </button>
    </div>
  );
}
