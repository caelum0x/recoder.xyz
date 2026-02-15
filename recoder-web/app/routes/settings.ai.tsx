/**
 * AI Settings Page for Recoder Web
 * Configure AI model preferences and behavior
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getAISettings, updateAISettings, type AISettings } from '~/lib/api/settings';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SettingsAI');

export async function loader({ request }: LoaderFunctionArgs) {
  // Load AI settings from API
  const settings = await getAISettings();

  return json({
    settings: settings || {
      default_model: 'claude-3.5-sonnet',
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.9,
      streaming_enabled: true,
      code_validation: true,
      auto_fix_errors: false,
      include_file_tree: true,
      max_context_files: 10,
    },
  });
}

export default function AISettingsPage() {
  const { settings: initialSettings } = useLoaderData<typeof loader>();
  const [settings, setSettings] = useState<AISettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    if (modelWarning) {
      setSaveStatus('error');
      return;
    }

    setSaving(true);
    setSaveStatus('idle');

    try {
      const success = await updateAISettings(settings);

      if (success) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      logger.error('Failed to save AI settings:', error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof AISettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateModel = (value: string) => {
    updateSetting('default_model', normalizeModel(value, provider));
  };

  const providers = [
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic' },
  ] as const;

  type ProviderId = typeof providers[number]['id'];

  const inferProvider = (modelId: string): ProviderId => {
    if (modelId.includes('/')) {
      const prefix = modelId.split('/')[0];
      if (prefix === 'openai' || prefix === 'anthropic' || prefix === 'openrouter') {
        return prefix as ProviderId;
      }
    }

    if (modelId.startsWith('claude')) {
      return 'anthropic';
    }

    if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) {
      return 'openai';
    }

    return 'openrouter';
  };

  const normalizeModel = (modelId: string, targetProvider: ProviderId) => {
    const trimmed = modelId.trim();
    if (!trimmed) {
      return trimmed;
    }

    if (targetProvider === 'openrouter') {
      return trimmed.includes('/') ? trimmed : `openai/${trimmed}`;
    }

    if (trimmed.includes('/')) {
      return trimmed.split('/').slice(1).join('/');
    }

    return trimmed;
  };

  const [provider, setProvider] = useState<ProviderId>(() => inferProvider(settings.default_model));
  const [modelQuery, setModelQuery] = useState('');
  const [modelsLoading, setModelsLoading] = useState<Record<ProviderId, boolean>>({
    openrouter: false,
    openai: false,
    anthropic: false,
  });
  const [modelsError, setModelsError] = useState<Record<ProviderId, string | null>>({
    openrouter: null,
    openai: null,
    anthropic: null,
  });
  const [modelsByProvider, setModelsByProvider] = useState<Record<ProviderId, { id: string; name?: string; description?: string }[]>>({
    openrouter: [],
    openai: [],
    anthropic: [],
  });

  const modelValue = settings.default_model?.trim() ?? '';
  const modelWarning = (() => {
    if (!modelValue) {
      return null;
    }

    if (provider === 'openrouter' && !modelValue.includes('/')) {
      return 'OpenRouter models should include a provider prefix (example: openai/gpt-5-nano).';
    }

    if (provider !== 'openrouter' && modelValue.includes('/')) {
      return 'OpenAI/Anthropic models should not include a provider prefix.';
    }

    return null;
  })();

  const recommendedModels: Record<ProviderId, { id: string; label: string; desc: string }[]> = {
    openrouter: [
      { id: 'openai/gpt-5-nano', label: 'GPT-5 Nano', desc: 'Fast and affordable default' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', desc: 'Balanced reasoning' },
    ],
    openai: [
      { id: 'gpt-5-nano', label: 'GPT-5 Nano', desc: 'Fast and affordable default' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Balanced speed and quality' },
    ],
    anthropic: [
      { id: 'claude-3.5-sonnet-latest', label: 'Claude 3.5 Sonnet', desc: 'Balanced reasoning' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', desc: 'Fast responses' },
    ],
  };

  const providerHints: Record<ProviderId, { help: string; examples: string[] }> = {
    openrouter: {
      help: 'Use provider/model slugs from OpenRouter.',
      examples: ['openai/gpt-5-nano', 'anthropic/claude-3.5-sonnet'],
    },
    openai: {
      help: 'Use OpenAI model IDs (no provider prefix).',
      examples: ['gpt-5-nano', 'gpt-4o-mini'],
    },
    anthropic: {
      help: 'Use Anthropic model IDs.',
      examples: ['claude-3.5-sonnet-latest', 'claude-3-5-haiku-latest'],
    },
  };

  useEffect(() => {
    setModelQuery('');
  }, [provider]);

  const loadModels = useCallback(async (targetProvider: ProviderId, force = false) => {
    const existing = modelsByProvider[targetProvider];
    const loading = modelsLoading[targetProvider];

    if (!force && (existing.length > 0 || loading)) {
      return;
    }

    let endpoint = '/api/models/list';
    if (targetProvider === 'openai') {
      endpoint = '/api/models/openai';
    }
    if (targetProvider === 'anthropic') {
      endpoint = '/api/models/anthropic';
    }

    setModelsLoading((prev) => ({ ...prev, [targetProvider]: true }));
    setModelsError((prev) => ({ ...prev, [targetProvider]: null }));

    try {
      const response = await fetch(endpoint);
      const data = await response.json() as { models?: any[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load models');
      }

      const models = (data.models ?? []).map((model: any) => ({
        id: model.id ?? model,
        name: model.name ?? undefined,
        description: model.description ?? undefined,
      }));

      setModelsByProvider((prev) => ({ ...prev, [targetProvider]: models }));
    } catch (error) {
      setModelsError((prev) => ({
        ...prev,
        [targetProvider]: (error as Error).message || `Unable to load ${targetProvider} models.`,
      }));
    } finally {
      setModelsLoading((prev) => ({ ...prev, [targetProvider]: false }));
    }
  }, [modelsByProvider, modelsLoading]);

  useEffect(() => {
    loadModels(provider);
  }, [provider, loadModels]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      void loadModels(provider, true);
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [provider, loadModels]);

  useEffect(() => {
    const handleFocus = () => {
      void loadModels(provider, true);
    };

    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('focus', handleFocus);

    return () => window.removeEventListener('focus', handleFocus);
  }, [provider, loadModels]);

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    const models = modelsByProvider[provider] ?? [];

    if (!query) {
      return models.slice(0, 16);
    }

    return models.filter((model) =>
      model.id.toLowerCase().includes(query) ||
      model.name?.toLowerCase().includes(query)
    ).slice(0, 16);
  }, [modelQuery, modelsByProvider, provider]);

  const setRecommendedModel = () => {
    const recommended = recommendedModels[provider]?.[0]?.id;
    if (recommended) {
      updateSetting('default_model', normalizeModel(recommended, provider));
    }
  };

  const selectModel = (modelId: string) => {
    updateSetting('default_model', normalizeModel(modelId, provider));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">AI Settings</h1>
        <p className="text-bolt-elements-textSecondary">
          Configure AI model preferences and behavior
        </p>
      </div>

      {/* Save Status */}
      {saveStatus === 'success' && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
          AI settings saved successfully!
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          Failed to save AI settings. Please try again.
        </div>
      )}

      {/* Model Selection */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Model Selection</h2>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {providers.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setProvider(item.id);
                  setModelQuery('');
                }}
                className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                  provider === item.id
                    ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-item-backgroundActive'
                    : 'border-bolt-elements-borderColor hover:bg-bolt-elements-item-backgroundHover'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Default AI Model</label>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {recommendedModels[provider].map((model) => (
                <button
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    settings.default_model === normalizeModel(model.id, provider)
                      ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-item-backgroundActive'
                      : 'border-bolt-elements-borderColor hover:bg-bolt-elements-item-backgroundHover'
                  }`}
                >
                  {model.label}
                </button>
              ))}
              <button
                onClick={setRecommendedModel}
                className="rounded-full px-3 py-1 text-xs border border-bolt-elements-borderColor hover:bg-bolt-elements-item-backgroundHover"
              >
                Use recommended
              </button>
            </div>
            <input
              type="text"
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              placeholder={`Search ${providers.find((p) => p.id === provider)?.label} models`}
              className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background px-3 py-2 text-sm"
            />
            {modelQuery.trim() && (
              <div className="mt-2">
                <button
                  onClick={() => selectModel(modelQuery)}
                  className="rounded-full px-3 py-1 text-xs border border-bolt-elements-borderColor hover:bg-bolt-elements-item-backgroundHover"
                >
                  Use search as model
                </button>
              </div>
            )}
            <p className="mt-2 text-xs text-bolt-elements-textSecondary">
              {providerHints[provider].help} Examples: {providerHints[provider].examples.join(', ')}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {providerHints[provider].examples.map((example) => (
                <button
                  key={example}
                  onClick={() => selectModel(example)}
                  className="rounded-full px-3 py-1 text-xs border border-bolt-elements-borderColor hover:bg-bolt-elements-item-backgroundHover"
                >
                  {example}
                </button>
              ))}
            </div>
            {modelWarning && (
              <p className="mt-2 text-sm text-amber-400">{modelWarning}</p>
            )}
            {modelsError[provider] && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-400">
                <span>{modelsError[provider]}</span>
                <button
                  className="rounded-full border border-red-400/40 px-2 py-0.5 text-xs text-red-300 transition hover:border-red-300 hover:bg-red-500/10"
                  onClick={() => void loadModels(provider, true)}
                >
                  Retry
                </button>
              </div>
            )}
            {modelsLoading[provider] && (
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">Loading models...</p>
            )}
            {settings.default_model && (
              <p className="mt-2 text-xs text-bolt-elements-textSecondary">
                Selected model: {settings.default_model}
              </p>
            )}
            <div className="mt-3 space-y-2">
              {filteredModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                  className={`w-full p-3 rounded-lg border transition-colors text-left ${
                    settings.default_model === normalizeModel(model.id, provider)
                      ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-item-backgroundActive'
                      : 'border-bolt-elements-borderColor hover:bg-bolt-elements-item-backgroundHover'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{model.name ?? model.id}</div>
                      {model.description ? (
                        <div className="text-sm text-bolt-elements-textSecondary mt-1">
                          {model.description}
                        </div>
                      ) : null}
                    </div>
                    {settings.default_model === normalizeModel(model.id, provider) && (
                      <div className="text-bolt-elements-item-contentAccent">✓</div>
                    )}
                  </div>
                </button>
              ))}
              {!modelsLoading[provider] && filteredModels.length === 0 && !modelsError[provider] && (
                <p className="text-sm text-bolt-elements-textSecondary">
                  No models found. Try a different search or provider.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Model Parameters */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Model Parameters</h2>
        <div className="space-y-6">
          {/* Temperature */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Temperature</label>
              <span className="text-sm text-bolt-elements-textSecondary">
                {settings.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.temperature}
              onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-bolt-elements-textSecondary mt-1">
              <span>More focused</span>
              <span>More creative</span>
            </div>
            <p className="text-xs text-bolt-elements-textSecondary mt-2">
              Controls randomness. Lower = more deterministic, Higher = more creative
            </p>
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Max Tokens</label>
              <span className="text-sm text-bolt-elements-textSecondary">
                {settings.max_tokens}
              </span>
            </div>
            <input
              type="range"
              min="1024"
              max="8192"
              step="256"
              value={settings.max_tokens}
              onChange={(e) => updateSetting('max_tokens', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-bolt-elements-textSecondary mt-1">
              <span>1K</span>
              <span>8K</span>
            </div>
            <p className="text-xs text-bolt-elements-textSecondary mt-2">
              Maximum length of AI responses. Higher = longer responses but slower
            </p>
          </div>

          {/* Top P */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Top P (Nucleus Sampling)</label>
              <span className="text-sm text-bolt-elements-textSecondary">
                {settings.top_p.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.top_p}
              onChange={(e) => updateSetting('top_p', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-bolt-elements-textSecondary mt-1">
              <span>Conservative</span>
              <span>Diverse</span>
            </div>
            <p className="text-xs text-bolt-elements-textSecondary mt-2">
              Controls diversity of responses. Lower = more conservative, Higher = more diverse
            </p>
          </div>
        </div>
      </section>

      {/* AI Behavior */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">AI Behavior</h2>
        <div className="space-y-4">
          {/* Streaming */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Response Streaming</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                Show AI responses as they're generated (recommended)
              </div>
            </div>
            <button
              onClick={() => updateSetting('streaming_enabled', !settings.streaming_enabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.streaming_enabled ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.streaming_enabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Code Validation */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Code Validation</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                Validate generated code for syntax errors
              </div>
            </div>
            <button
              onClick={() => updateSetting('code_validation', !settings.code_validation)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.code_validation ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.code_validation ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Auto Fix Errors */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Auto-Fix Errors</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                Automatically attempt to fix detected errors
              </div>
            </div>
            <button
              onClick={() => updateSetting('auto_fix_errors', !settings.auto_fix_errors)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.auto_fix_errors ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.auto_fix_errors ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Context Settings */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Context & Memory</h2>
        <div className="space-y-4">
          {/* Include File Tree */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Include File Tree</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                Send project structure to AI for better context
              </div>
            </div>
            <button
              onClick={() => updateSetting('include_file_tree', !settings.include_file_tree)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.include_file_tree ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.include_file_tree ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Max Context Files */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium">Max Context Files</label>
              <span className="text-sm text-bolt-elements-textSecondary">
                {settings.max_context_files}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={settings.max_context_files}
              onChange={(e) => updateSetting('max_context_files', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-bolt-elements-textSecondary mt-1">
              <span>1 file</span>
              <span>50 files</span>
            </div>
            <p className="text-xs text-bolt-elements-textSecondary mt-2">
              Maximum number of files to include in AI context
            </p>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={handleSave}
          disabled={saving || Boolean(modelWarning)}
          className="px-6 py-3 bg-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-contentActive rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
