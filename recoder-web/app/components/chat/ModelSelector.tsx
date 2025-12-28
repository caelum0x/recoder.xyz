import { useEffect, useState, useCallback } from 'react';
import { getAllProviders, getModelsByProvider, type ModelInfo, type ProviderConfig } from '~/lib/models';
import { classNames } from '~/utils/classNames';

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
    console.error('Failed to save custom models:', e);
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

  // Load custom models from localStorage on mount
  useEffect(() => {
    setCustomModels(getStoredCustomModels());
  }, []);

  const providers = getAllProviders();
  const currentProvider = providers.find((p) => p.id === selectedProvider);

  // Combine default models with custom models for current provider
  const defaultModels = getModelsByProvider(selectedProvider);
  const userCustomModels = customModels[selectedProvider] || [];
  const models = [...defaultModels, ...userCustomModels];

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

  const handleAddModel = () => {
    setShowAddModelForm(true);
    setShowModelMenu(false);
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

    updatedModels[selectedProvider].push({
      id: newModelForm.id,
      name: newModelForm.name,
    });

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
          model: newModelForm
        })
      });
    } catch (error) {
      console.error('Failed to save model to server:', error);
      // Continue anyway - localStorage has the model
    }

    // Reset form and close modal
    const modelId = newModelForm.id;
    setNewModelForm({ name: '', id: '' });
    setShowAddModelForm(false);

    // Auto-select the new model
    onModelChange(modelId);
  };

  const handleCancelAddModel = () => {
    setShowAddModelForm(false);
    setNewModelForm({
      name: '',
      id: '',
    });
  };

  const handleDeleteCustomModel = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();

    const updatedModels = { ...customModels };
    if (updatedModels[selectedProvider]) {
      updatedModels[selectedProvider] = updatedModels[selectedProvider].filter(m => m.id !== modelId);
      saveCustomModels(updatedModels);
      setCustomModels(updatedModels);

      // If deleted model was selected, select first available model
      if (selectedModel === modelId && models.length > 1) {
        const nextModel = models.find(m => m.id !== modelId);
        if (nextModel) {
          onModelChange(nextModel.id);
        }
      }
    }
  };

  const isCustomModel = (modelId: string): boolean => {
    return (customModels[selectedProvider] || []).some(m => m.id === modelId);
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
            <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg shadow-xl z-[1000] overflow-hidden max-h-96 overflow-y-auto"
              style={{ zIndex: 1000, backgroundColor: '#000000', borderColor: '#000000', border: '1px solid #000000' }}>
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={(e) => handleProviderClick(e, provider.id)}
                className={classNames(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors text-white bg-black',
                  'hover:bg-gray-900',
                  provider.id === selectedProvider ? 'bg-gray-900' : 'bg-black'
                )}
                style={{ backgroundColor: provider.id === selectedProvider ? '#333333' : '#000000' }}
              >
                <span className="text-sm font-medium text-white flex-1">
                  {provider.name}
                </span>
                {provider.id === selectedProvider && (
                  <div className="i-ph:check text-green-500" />
                )}
              </button>
            ))}
            <div className="border-t" style={{ borderColor: '#000000' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSettingsClick();
                  setShowProviderMenu(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-900 transition-colors text-white bg-black"
                style={{ backgroundColor: '#000000' }}
              >
                <div className="i-ph:gear text-xl text-gray-400" />
                <span className="text-sm text-white">Manage API Keys</span>
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
            <div className="fixed inset-0 z-[999]" onClick={() => setShowModelMenu(false)} />
            <div className="absolute bottom-full left-0 mb-1 w-full max-w-lg rounded-lg shadow-xl z-[1000] max-h-96 overflow-y-auto"
              style={{ zIndex: 1000, backgroundColor: '#000000', borderColor: '#000000', border: '1px solid #000000' }}>
            {/* Provider Name Header */}
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 sticky top-0" style={{ backgroundColor: '#000000' }}>
              {currentProvider?.name}
            </div>

            {/* Model List */}
            {models.map((model) => (
              <button
                key={model.id}
                onClick={(e) => handleModelClick(e, model.id)}
                className={classNames(
                  'w-full px-4 py-2 text-left transition-colors flex items-center justify-between group',
                  model.id === selectedModel
                    ? 'bg-gray-900 text-white'
                    : 'bg-black text-gray-300 hover:bg-gray-900 hover:text-white'
                )}
                style={{ backgroundColor: model.id === selectedModel ? '#333333' : '#000000' }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm truncate">{model.name}</span>
                  {isCustomModel(model.id) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded text-gray-400" style={{ backgroundColor: '#1a1a1a' }}>
                      Custom
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isCustomModel(model.id) && (
                    <button
                      onClick={(e) => handleDeleteCustomModel(e, model.id)}
                      className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
            
            {/* Add Model Button */}
            <div className="border-t" style={{ borderColor: '#333333' }}>
              <button
                onClick={handleAddModel}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-900 transition-colors text-white bg-black"
                style={{ backgroundColor: '#000000' }}
              >
                <div className="i-ph:plus text-xl text-green-400" />
                <span className="text-sm text-white">Add Custom Model</span>
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
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 rounded-xl shadow-2xl z-[1002]"
            style={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-white">Add Custom Model</h3>
                <button
                  onClick={handleCancelAddModel}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <div className="i-ph:x text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Model Name</label>
                  <input
                    type="text"
                    value={newModelForm.name}
                    onChange={(e) => setNewModelForm({...newModelForm, name: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                    style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
                    placeholder="e.g., GPT-4 Turbo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Model ID</label>
                  <input
                    type="text"
                    value={newModelForm.id}
                    onChange={(e) => setNewModelForm({...newModelForm, id: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                    style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
                    placeholder="e.g., gpt-4-turbo"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">Use the exact model ID from the provider</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={handleCancelAddModel}
                  className="px-4 py-2.5 text-gray-300 rounded-lg hover:bg-white/5 transition-colors"
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
