import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { getAllProviders, getModelsByProvider, getOpenRouterModelsCached, type ModelInfo, type ProviderConfig } from '~/lib/models';
import {
  loadDynamicModels,
  dynamicModelsStore,
  dynamicModelsLoadingStore,
  dynamicModelsLoadedStore,
  searchDynamicModels,
} from '~/lib/stores/model-selection';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ModelSelector');

const CUSTOM_MODELS_KEY = 'recoder_custom_models';

interface CustomModelsStorage {
  [providerId: string]: ModelInfo[];
}

function getStoredCustomModels(): CustomModelsStorage {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCustomModels(models: CustomModelsStorage): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
  } catch (e) {
    logger.error('Failed to save custom models:', e);
  }
}

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
  const [showAddModelForm, setShowAddModelForm] = useState(false);
  const [customModels, setCustomModels] = useState<CustomModelsStorage>({});
  const [newModelForm, setNewModelForm] = useState({
    name: '',
    id: '',
  });
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [addModelSearchQuery, setAddModelSearchQuery] = useState('');
  const [selectedAddModel, setSelectedAddModel] = useState<ModelInfo | null>(null);

  // Dynamic model stores
  const dynamicModels = useStore(dynamicModelsStore);
  const dynamicModelsLoading = useStore(dynamicModelsLoadingStore);
  const dynamicModelsLoaded = useStore(dynamicModelsLoadedStore);

  // Load custom models from localStorage on mount
  useEffect(() => {
    setCustomModels(getStoredCustomModels());
  }, []);

  const providers = getAllProviders();
  const currentProvider = providers.find((p) => p.id === selectedProvider);

  // For OpenRouter: use dynamic models if loaded, otherwise hardcoded
  const defaultModels = useMemo(() => {
    if (selectedProvider === 'openrouter' && dynamicModelsLoaded && dynamicModels.length > 0) {
      return dynamicModels;
    }
    return getModelsByProvider(selectedProvider);
  }, [selectedProvider, dynamicModelsLoaded, dynamicModels]);

  const userCustomModels = customModels[selectedProvider] || [];
  const allModels = [...defaultModels, ...userCustomModels];

  // Filter models by search query
  const models = useMemo(() => {
    if (!modelSearchQuery.trim()) return allModels;
    const q = modelSearchQuery.toLowerCase();
    return allModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [allModels, modelSearchQuery]);

  const currentModel = allModels.find((m) => m.id === selectedModel);

  // Search results for add model flow
  const addModelResults = useMemo(() => {
    if (!addModelSearchQuery.trim()) return [];
    return searchDynamicModels(addModelSearchQuery).slice(0, 50);
  }, [addModelSearchQuery]);

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

  // Lazy load dynamic models when OpenRouter dropdown opens
  useEffect(() => {
    if (showModelMenu && selectedProvider === 'openrouter' && !dynamicModelsLoaded) {
      loadDynamicModels();
    }
  }, [showModelMenu, selectedProvider, dynamicModelsLoaded]);

  const handleProviderClick = (e: React.MouseEvent, providerId: string) => {
    e.stopPropagation();
    onProviderChange(providerId);
    setShowProviderMenu(false);
    setModelSearchQuery('');

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
    setModelSearchQuery('');
  };

  const handleAddModel = () => {
    setShowAddModelForm(true);
    setShowModelMenu(false);
    setAddModelSearchQuery('');
    setSelectedAddModel(null);
    setNewModelForm({ name: '', id: '' });
    // Ensure dynamic models are loaded for search
    if (!dynamicModelsLoaded) {
      loadDynamicModels();
    }
  };

  const handleSelectAddModel = (model: ModelInfo) => {
    setSelectedAddModel(model);
    setNewModelForm({ name: model.name, id: model.id });
    setAddModelSearchQuery('');
  };

  const handleSaveNewModel = async () => {
    if (!newModelForm.name || !newModelForm.id) return;

    // Add model to localStorage for immediate availability
    const updatedModels = { ...customModels };
    if (!updatedModels[selectedProvider]) {
      updatedModels[selectedProvider] = [];
    }

    // Check if model already exists
    const exists = updatedModels[selectedProvider].some(m => m.id === newModelForm.id);
    if (exists) {
      return;
    }

    const modelToAdd: ModelInfo = {
      id: newModelForm.id,
      name: newModelForm.name,
      ...(selectedAddModel ? {
        description: selectedAddModel.description,
        contextWindow: selectedAddModel.contextWindow,
        maxTokens: selectedAddModel.maxTokens,
        supportsVision: selectedAddModel.supportsVision,
        costPer1MInput: selectedAddModel.costPer1MInput,
        costPer1MOutput: selectedAddModel.costPer1MOutput,
      } : {}),
    };

    updatedModels[selectedProvider].push(modelToAdd);

    // Save to localStorage and update state
    saveCustomModels(updatedModels);
    setCustomModels(updatedModels);

    // Also save to server API for persistence
    try {
      await fetch('/api/models/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProvider,
          model: modelToAdd
        })
      });
    } catch (error) {
      logger.error('Failed to save model to server:', error);
    }

    // Reset form and close modal
    const modelId = newModelForm.id;
    setNewModelForm({ name: '', id: '' });
    setSelectedAddModel(null);
    setShowAddModelForm(false);

    // Auto-select the new model
    onModelChange(modelId);
  };

  const handleCancelAddModel = () => {
    setShowAddModelForm(false);
    setNewModelForm({ name: '', id: '' });
    setSelectedAddModel(null);
    setAddModelSearchQuery('');
  };

  const handleDeleteCustomModel = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();

    const updatedModels = { ...customModels };
    if (updatedModels[selectedProvider]) {
      updatedModels[selectedProvider] = updatedModels[selectedProvider].filter(m => m.id !== modelId);
      saveCustomModels(updatedModels);
      setCustomModels(updatedModels);

      // If deleted model was selected, select first available model
      if (selectedModel === modelId && allModels.length > 1) {
        const nextModel = allModels.find(m => m.id !== modelId);
        if (nextModel) {
          onModelChange(nextModel.id);
        }
      }
    }
  };

  const isCustomModel = (modelId: string): boolean => {
    return (customModels[selectedProvider] || []).some(m => m.id === modelId);
  };

  const formatCost = (cost: number | undefined): string => {
    if (cost === undefined) return '';
    if (cost === 0) return 'Free';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(2)}`;
    return `$${cost.toFixed(1)}`;
  };

  return (
    <div className="flex items-center gap-2 flex-1">
      {/* Provider Dropdown */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowProviderMenu(!showProviderMenu);
            setShowModelMenu(false);
          }}
          className={classNames(
            'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors h-[38px] text-sm',
            'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
            'hover:bg-bolt-elements-background-depth-3',
            'text-bolt-elements-textPrimary font-medium whitespace-nowrap'
          )}
        >
          <span>{currentProvider?.name || 'Select Provider'}</span>
          <div className="i-ph:caret-down text-xs" />
        </button>

        {/* Provider Menu */}
        {showProviderMenu && (
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => setShowProviderMenu(false)} />
            <div className="absolute bottom-full left-0 mb-1 w-80 rounded-lg shadow-xl z-[1000] overflow-hidden max-h-96 overflow-y-auto"
              style={{ zIndex: 1000, backgroundColor: 'var(--bolt-elements-bg-depth-1)', borderColor: 'var(--bolt-elements-borderColor)', border: '1px solid var(--bolt-elements-borderColor)' }}>
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={(e) => handleProviderClick(e, provider.id)}
                className={classNames(
                  'w-full flex flex-col gap-1 px-4 py-3 text-left transition-colors text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1',
                  'hover:bg-bolt-elements-background-depth-2',
                  provider.id === selectedProvider ? 'bg-bolt-elements-background-depth-2' : 'bg-bolt-elements-background-depth-1'
                )}
                style={{ backgroundColor: provider.id === selectedProvider ? 'var(--bolt-elements-bg-depth-3)' : 'var(--bolt-elements-bg-depth-1)' }}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-bolt-elements-textPrimary">
                      {provider.name}
                    </span>
                    {!provider.requiresApiKey && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                        Free
                      </span>
                    )}
                  </div>
                  {provider.id === selectedProvider && (
                    <div className="i-ph:check text-green-500" />
                  )}
                </div>
                {provider.description && (
                  <span className="text-[10px] text-bolt-elements-textTertiary leading-tight">
                    {provider.description}
                  </span>
                )}
              </button>
            ))}
            <div className="border-t" style={{ borderColor: 'var(--bolt-elements-borderColor)' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSettingsClick();
                  setShowProviderMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bolt-elements-background-depth-2 transition-colors text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1"
                style={{ backgroundColor: 'var(--bolt-elements-bg-depth-1)' }}
              >
                <div className="i-ph:gear text-xl text-bolt-elements-textSecondary" />
                <span className="text-sm text-bolt-elements-textPrimary">Manage API Keys</span>
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Model Dropdown */}
      <div className="relative flex-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowModelMenu(!showModelMenu);
            setShowProviderMenu(false);
            setModelSearchQuery('');
          }}
          className={classNames(
            'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors h-[38px] text-sm',
            'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
            'hover:bg-bolt-elements-background-depth-3',
            'text-bolt-elements-textPrimary font-medium whitespace-nowrap'
          )}
        >
          <span className="truncate">{currentModel?.name || 'Select Model'}</span>
          <div className="i-ph:caret-down text-xs flex-shrink-0" />
        </button>

        {/* Model Menu */}
        {showModelMenu && (
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => { setShowModelMenu(false); setModelSearchQuery(''); }} />
            <div className="absolute bottom-full left-0 mb-1 w-full max-w-lg rounded-lg shadow-xl z-[1000] max-h-96 overflow-hidden flex flex-col"
              style={{ zIndex: 1000, backgroundColor: 'var(--bolt-elements-bg-depth-1)', borderColor: 'var(--bolt-elements-borderColor)', border: '1px solid var(--bolt-elements-borderColor)' }}>

            {/* Search Input */}
            <div className="px-3 py-2 border-b sticky top-0" style={{ borderColor: 'var(--bolt-elements-borderColor)', backgroundColor: 'var(--bolt-elements-bg-depth-1)' }}>
              <div className="relative">
                <div className="i-ph:magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary text-sm" />
                <input
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  autoFocus
                  className="w-full pl-8 pr-3 py-1.5 rounded-md text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)', border: '1px solid var(--bolt-elements-borderColor)' }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Provider Name Header */}
            <div className="px-4 py-1.5 text-xs font-semibold text-bolt-elements-textSecondary" style={{ backgroundColor: 'var(--bolt-elements-bg-depth-1)' }}>
              {currentProvider?.name} {dynamicModelsLoaded && selectedProvider === 'openrouter' ? `(${allModels.length} models)` : ''}
            </div>

            {/* Model List */}
            <div className="overflow-y-auto flex-1">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={(e) => handleModelClick(e, model.id)}
                  className={classNames(
                    'w-full px-4 py-2.5 text-left transition-colors flex items-center justify-between group',
                    model.id === selectedModel
                      ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                      : 'bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary'
                  )}
                  style={{ backgroundColor: model.id === selectedModel ? 'var(--bolt-elements-bg-depth-3)' : 'var(--bolt-elements-bg-depth-1)' }}
                >
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{model.name}</span>
                      {/* Capability badges */}
                      {model.supportsVision && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400" title="Supports vision/images">
                          Vision
                        </span>
                      )}
                      {isCustomModel(model.id) && (
                        <span className="text-[9px] px-1 py-0.5 rounded text-bolt-elements-textSecondary" style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)' }}>
                          Custom
                        </span>
                      )}
                    </div>
                    {/* Model metadata row */}
                    <div className="flex items-center gap-2 text-[10px] text-bolt-elements-textTertiary">
                      {model.contextWindow && (
                        <span title="Context window size">
                          {model.contextWindow >= 1000000
                            ? `${(model.contextWindow / 1000000).toFixed(1)}M ctx`
                            : `${(model.contextWindow / 1000).toFixed(0)}K ctx`}
                        </span>
                      )}
                      {model.costPer1MInput !== undefined && model.costPer1MInput > 0 && (
                        <span title="Cost per 1M tokens (input/output)">
                          ${model.costPer1MInput}/{model.costPer1MOutput}
                        </span>
                      )}
                      {model.costPer1MInput === 0 && (
                        <span className="text-green-500" title="Free - runs locally">Free</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isCustomModel(model.id) && (
                      <button
                        onClick={(e) => handleDeleteCustomModel(e, model.id)}
                        className="p-1 text-bolt-elements-textTertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove custom model"
                      >
                        <div className="i-ph:trash text-sm" />
                      </button>
                    )}
                    {model.id === selectedModel && (
                      <div className="i-ph:check text-green-500" />
                    )}
                  </div>
                </button>
              ))}

              {/* Loading indicator for dynamic models */}
              {dynamicModelsLoading && selectedProvider === 'openrouter' && (
                <div className="px-4 py-3 text-center text-xs text-bolt-elements-textTertiary">
                  <div className="i-ph:spinner-gap animate-spin inline-block mr-2" />
                  Loading more models...
                </div>
              )}

              {/* No results */}
              {models.length === 0 && modelSearchQuery && (
                <div className="px-4 py-6 text-center text-sm text-bolt-elements-textTertiary">
                  No models match "{modelSearchQuery}"
                </div>
              )}
            </div>

            {/* Add Model Button */}
            <div className="border-t" style={{ borderColor: 'var(--bolt-elements-borderColor)' }}>
              <button
                onClick={handleAddModel}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bolt-elements-background-depth-2 transition-colors text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1"
                style={{ backgroundColor: 'var(--bolt-elements-bg-depth-1)' }}
              >
                <div className="i-ph:plus text-xl text-green-400" />
                <span className="text-sm text-bolt-elements-textPrimary">Add Custom Model</span>
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Add Model Form Modal */}
      {showAddModelForm && (
        <>
          <div className="fixed inset-0 z-[1001] bg-black/70" onClick={handleCancelAddModel} />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[440px] rounded-xl shadow-2xl z-[1002]"
            style={{ backgroundColor: 'var(--bolt-elements-bg-depth-1)', border: '1px solid var(--bolt-elements-borderColor)' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Add Custom Model</h3>
                <button
                  onClick={handleCancelAddModel}
                  className="text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
                >
                  <div className="i-ph:x text-xl" />
                </button>
              </div>

              {/* Model Search */}
              {selectedProvider === 'openrouter' && !selectedAddModel && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    Search OpenRouter Models
                  </label>
                  <div className="relative">
                    <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary" />
                    <input
                      type="text"
                      value={addModelSearchQuery}
                      onChange={(e) => setAddModelSearchQuery(e.target.value)}
                      placeholder="Search by name or ID..."
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                      style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)', border: '1px solid var(--bolt-elements-borderColor)' }}
                    />
                  </div>

                  {/* Search Results */}
                  {addModelSearchQuery && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--bolt-elements-borderColor)' }}>
                      {addModelResults.length > 0 ? (
                        addModelResults.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleSelectAddModel(model)}
                            className="w-full px-3 py-2 text-left hover:bg-bolt-elements-background-depth-2 transition-colors flex items-center justify-between"
                            style={{ backgroundColor: 'var(--bolt-elements-bg-depth-1)' }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-bolt-elements-textPrimary truncate">{model.name}</div>
                              <div className="flex items-center gap-2 text-[10px] text-bolt-elements-textTertiary">
                                <span className="truncate">{model.id}</span>
                                {model.contextWindow && (
                                  <span>
                                    {model.contextWindow >= 1000000
                                      ? `${(model.contextWindow / 1000000).toFixed(1)}M ctx`
                                      : `${(model.contextWindow / 1000).toFixed(0)}K ctx`}
                                  </span>
                                )}
                                {model.costPer1MInput !== undefined && model.costPer1MInput > 0 && (
                                  <span>{formatCost(model.costPer1MInput)}/M in</span>
                                )}
                              </div>
                            </div>
                            {model.supportsVision && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 flex-shrink-0 ml-2">Vision</span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-bolt-elements-textTertiary">
                          {dynamicModelsLoading ? 'Loading models...' : 'No models found'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Selected Model Info / Manual Form */}
              <div className="space-y-4">
                {selectedAddModel && (
                  <div className="p-3 rounded-lg flex items-start justify-between" style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)', border: '1px solid var(--bolt-elements-borderColor)' }}>
                    <div>
                      <div className="text-sm font-medium text-bolt-elements-textPrimary">{selectedAddModel.name}</div>
                      <div className="text-xs text-bolt-elements-textTertiary mt-1">{selectedAddModel.id}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {selectedAddModel.contextWindow && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                            {selectedAddModel.contextWindow >= 1000000
                              ? `${(selectedAddModel.contextWindow / 1000000).toFixed(1)}M context`
                              : `${(selectedAddModel.contextWindow / 1000).toFixed(0)}K context`}
                          </span>
                        )}
                        {selectedAddModel.costPer1MInput !== undefined && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                            {formatCost(selectedAddModel.costPer1MInput)}/{formatCost(selectedAddModel.costPer1MOutput)} per 1M
                          </span>
                        )}
                        {selectedAddModel.supportsVision && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Vision</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedAddModel(null); setNewModelForm({ name: '', id: '' }); }}
                      className="text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary p-1"
                    >
                      <div className="i-ph:x text-sm" />
                    </button>
                  </div>
                )}

                {!selectedAddModel && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">Model Name</label>
                      <input
                        type="text"
                        value={newModelForm.name}
                        onChange={(e) => setNewModelForm({...newModelForm, name: e.target.value})}
                        className="w-full px-3 py-2.5 rounded-lg text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                        style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)', border: '1px solid var(--bolt-elements-borderColor)' }}
                        placeholder="e.g., GPT-4 Turbo"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">Model ID</label>
                      <input
                        type="text"
                        value={newModelForm.id}
                        onChange={(e) => setNewModelForm({...newModelForm, id: e.target.value})}
                        className="w-full px-3 py-2.5 rounded-lg text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                        style={{ backgroundColor: 'var(--bolt-elements-bg-depth-2)', border: '1px solid var(--bolt-elements-borderColor)' }}
                        placeholder="e.g., gpt-4-turbo"
                      />
                      <p className="text-xs text-bolt-elements-textTertiary mt-1.5">Use the exact model ID from the provider</p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={handleCancelAddModel}
                  className="px-4 py-2.5 text-bolt-elements-textSecondary rounded-lg hover:bg-bolt-elements-background-depth-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewModel}
                  disabled={!newModelForm.name || !newModelForm.id}
                  className="px-4 py-2.5 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add Model
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Settings Gear Icon */}
      <button
        onClick={onSettingsClick}
        className={classNames(
          'p-1.5 rounded-lg bg-transparent transition-colors',
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
