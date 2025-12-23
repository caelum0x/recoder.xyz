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
  const [showAddModelForm, setShowAddModelForm] = useState(false);
  const [newModelForm, setNewModelForm] = useState({
    name: '',
    id: '',
    description: '',
    cost: 0,
    speed: 2,
    contextLength: 8000,
    category: 'budget' as 'popular' | 'budget' | 'advanced'
  });

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

  const handleAddModel = () => {
    setShowAddModelForm(true);
    setShowModelMenu(false);
  };

  const handleSaveNewModel = async () => {
    try {
      // Add the new model to the current provider
      const response = await fetch('/api/models/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProvider,
          model: newModelForm
        })
      });

      if (response.ok) {
        // Reset form
        setNewModelForm({
          name: '',
          id: '',
          description: '',
          cost: 0,
          speed: 2,
          contextLength: 8000,
          category: 'budget'
        });
        setShowAddModelForm(false);
        
        // Auto-select the new model
        onModelChange(newModelForm.id);
      }
    } catch (error) {
      console.error('Failed to add model:', error);
    }
  };

  const handleCancelAddModel = () => {
    setShowAddModelForm(false);
    setNewModelForm({
      name: '',
      id: '',
      description: '',
      cost: 0,
      speed: 2,
      contextLength: 8000,
      category: 'budget'
    });
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
          <span>{currentProvider?.icon}</span>
          <span>{currentProvider?.name || 'Select Provider'}</span>
          {currentProvider?.recommended && (
            <span className="text-xs text-orange-400">★</span>
          )}
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
                <span className="text-xl">{provider.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {provider.name}
                    </span>
                    {provider.recommended && (
                      <span className="text-xs text-orange-400">★ Recommended</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {provider.models.length} models available
                  </div>
                </div>
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
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => setShowModelMenu(false)} />
            <div className="absolute bottom-full left-0 mb-1 w-full max-w-lg rounded-lg shadow-xl z-[1000] max-h-96 overflow-y-auto"
              style={{ zIndex: 1000, backgroundColor: '#000000', borderColor: '#000000', border: '1px solid #000000' }}>
            {/* Group by category */}
            {['popular', 'budget', 'advanced'].map((category) => {
              const categoryModels = models.filter((m) => m.category === category);

              if (categoryModels.length === 0) return null;

              return (
                <div key={category}>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase sticky top-0" style={{ backgroundColor: '#000000' }}>
                    {category === 'popular' && 'Popular Models'}
                    {category === 'budget' && 'Budget Models'}
                    {category === 'advanced' && 'Advanced Models'}
                  </div>
                  {categoryModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={(e) => handleModelClick(e, model.id)}
                      className={classNames(
                        'w-full px-4 py-3 text-left transition-colors text-white bg-black',
                        'hover:bg-gray-900',
                        model.id === selectedModel ? 'bg-gray-900' : 'bg-black'
                      )}
                      style={{ backgroundColor: model.id === selectedModel ? '#333333' : '#000000' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-white truncate">
                            {model.name}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {model.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                          <span className="text-gray-400">
                            {getSpeedIndicator(model.speed)}
                          </span>
                          <span className="text-gray-400">
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
          <div className="fixed inset-0 z-[1001] bg-black bg-opacity-50" onClick={handleCancelAddModel} />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 rounded-lg shadow-xl z-[1002]"
            style={{ backgroundColor: '#000000', borderColor: '#333333', border: '1px solid #333333' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Add Custom Model</h3>
                <button
                  onClick={handleCancelAddModel}
                  className="text-gray-400 hover:text-white"
                >
                  <div className="i-ph:x text-xl" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1">Model Name</label>
                  <input
                    type="text"
                    value={newModelForm.name}
                    onChange={(e) => setNewModelForm({...newModelForm, name: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., GPT-4 Turbo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1">Model ID</label>
                  <input
                    type="text"
                    value={newModelForm.id}
                    onChange={(e) => setNewModelForm({...newModelForm, id: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., gpt-4-turbo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1">Description</label>
                  <input
                    type="text"
                    value={newModelForm.description}
                    onChange={(e) => setNewModelForm({...newModelForm, description: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Brief description of the model"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">Cost ($/1K)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={newModelForm.cost}
                      onChange={(e) => setNewModelForm({...newModelForm, cost: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-1">Context Length</label>
                    <input
                      type="number"
                      value={newModelForm.contextLength}
                      onChange={(e) => setNewModelForm({...newModelForm, contextLength: parseInt(e.target.value) || 8000})}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">Speed</label>
                    <select
                      value={newModelForm.speed}
                      onChange={(e) => setNewModelForm({...newModelForm, speed: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value={1}>Slow</option>
                      <option value={2}>Medium</option>
                      <option value={3}>Fast</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-1">Category</label>
                    <select
                      value={newModelForm.category}
                      onChange={(e) => setNewModelForm({...newModelForm, category: e.target.value as 'popular' | 'budget' | 'advanced'})}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="budget">Budget</option>
                      <option value="popular">Popular</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={handleCancelAddModel}
                  className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewModel}
                  disabled={!newModelForm.name || !newModelForm.id}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
