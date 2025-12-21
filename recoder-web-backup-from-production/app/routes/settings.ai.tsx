/**
 * AI Settings Page for Recoder Web
 * Configure AI model preferences and behavior
 */

import { useState } from 'react';
import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getAISettings, updateAISettings, type AISettings } from '~/lib/api/settings';

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
      console.error('Failed to save AI settings:', error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof AISettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // AI Models available
  const aiModels = [
    { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (Recommended)', desc: 'Best balance of speed and capability' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus', desc: 'Most powerful, slower' },
    { value: 'claude-3-haiku', label: 'Claude 3 Haiku', desc: 'Fastest, good for simple tasks' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', desc: 'OpenAI latest model' },
    { value: 'gpt-4', label: 'GPT-4', desc: 'OpenAI powerful model' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', desc: 'Fast and economical' },
  ];

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
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Default AI Model</label>
            <div className="space-y-2">
              {aiModels.map((model) => (
                <button
                  key={model.value}
                  onClick={() => updateSetting('default_model', model.value)}
                  className={`w-full p-4 rounded-lg border transition-colors text-left ${
                    settings.default_model === model.value
                      ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-item-backgroundActive'
                      : 'border-bolt-elements-borderColor hover:bg-bolt-elements-item-backgroundHover'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{model.label}</div>
                      <div className="text-sm text-bolt-elements-textSecondary mt-1">
                        {model.desc}
                      </div>
                    </div>
                    {settings.default_model === model.value && (
                      <div className="text-bolt-elements-item-contentAccent">✓</div>
                    )}
                  </div>
                </button>
              ))}
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
          disabled={saving}
          className="px-6 py-3 bg-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-contentActive rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
