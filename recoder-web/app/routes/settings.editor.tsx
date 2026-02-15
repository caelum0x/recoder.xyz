/**
 * Editor Settings Page for Recoder Web
 * Configure editor preferences with real-time updates
 */

import { useState, useEffect } from 'react';
import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getEditorSettings, updateEditorSettings, type EditorSettings } from '~/lib/api/settings';
import { useAutoSaveSettings } from '~/lib/hooks/useAutoSave';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SettingsEditor');

export async function loader({ request }: LoaderFunctionArgs) {
  // Load editor settings from API
  const settings = await getEditorSettings();

  return json({
    settings: settings || {
      theme: 'dark',
      color_scheme: 'nord',
      font_family: 'JetBrains Mono',
      font_size: 14,
      line_height: 1.5,
      tab_size: 2,
      use_spaces: true,
      word_wrap: true,
      line_numbers: true,
      minimap: true,
      bracket_matching: true,
      auto_closing_brackets: true,
      format_on_save: true,
      format_on_paste: false,
      trim_trailing_whitespace: true,
      terminal_font_size: 14,
      terminal_cursor_style: 'block',
      terminal_shell: 'bash',
    },
  });
}

export default function EditorSettingsPage() {
  const { settings: initialSettings } = useLoaderData<typeof loader>();
  const [settings, setSettings] = useState<EditorSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Auto-save settings (local storage based)
  const autoSaveSettings = useAutoSaveSettings();

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');

    try {
      const success = await updateEditorSettings(settings);

      if (success) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      logger.error('Failed to save editor settings:', error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof EditorSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Editor Settings</h1>
        <p className="text-bolt-elements-textSecondary">
          Customize your coding environment
        </p>
      </div>

      {/* Save Status */}
      {saveStatus === 'success' && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
          Settings saved successfully!
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          Failed to save settings. Please try again.
        </div>
      )}

      {/* Appearance */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Appearance</h2>
        <div className="space-y-4">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <select
              value={settings.theme}
              onChange={(e) => updateSetting('theme', e.target.value)}
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto (System)</option>
            </select>
          </div>

          {/* Color Scheme */}
          <div>
            <label className="block text-sm font-medium mb-2">Color Scheme</label>
            <select
              value={settings.color_scheme}
              onChange={(e) => updateSetting('color_scheme', e.target.value)}
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            >
              <option value="nord">Nord</option>
              <option value="dracula">Dracula</option>
              <option value="monokai">Monokai</option>
              <option value="github">GitHub</option>
              <option value="solarized">Solarized</option>
            </select>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-sm font-medium mb-2">Font Family</label>
            <select
              value={settings.font_family}
              onChange={(e) => updateSetting('font_family', e.target.value)}
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            >
              <option value="JetBrains Mono">JetBrains Mono</option>
              <option value="Fira Code">Fira Code</option>
              <option value="Cascadia Code">Cascadia Code</option>
              <option value="Source Code Pro">Source Code Pro</option>
              <option value="Consolas">Consolas</option>
              <option value="Monaco">Monaco</option>
            </select>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Font Size: {settings.font_size}px
            </label>
            <input
              type="range"
              min="10"
              max="24"
              value={settings.font_size}
              onChange={(e) => updateSetting('font_size', parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Line Height */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Line Height: {settings.line_height}
            </label>
            <input
              type="range"
              min="1.0"
              max="2.5"
              step="0.1"
              value={settings.line_height}
              onChange={(e) => updateSetting('line_height', parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* Indentation */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Indentation</h2>
        <div className="space-y-4">
          {/* Tab Size */}
          <div>
            <label className="block text-sm font-medium mb-2">Tab Size</label>
            <select
              value={settings.tab_size}
              onChange={(e) => updateSetting('tab_size', parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            >
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="8">8 spaces</option>
            </select>
          </div>

          {/* Use Spaces */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Use Spaces</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                Insert spaces instead of tabs
              </div>
            </div>
            <button
              onClick={() => updateSetting('use_spaces', !settings.use_spaces)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.use_spaces ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.use_spaces ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Editor Features */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Editor Features</h2>
        <div className="space-y-4">
          {[
            { key: 'word_wrap', label: 'Word Wrap', desc: 'Wrap long lines' },
            { key: 'line_numbers', label: 'Line Numbers', desc: 'Show line numbers' },
            { key: 'minimap', label: 'Minimap', desc: 'Show code overview' },
            { key: 'bracket_matching', label: 'Bracket Matching', desc: 'Highlight matching brackets' },
            { key: 'auto_closing_brackets', label: 'Auto-Close Brackets', desc: 'Automatically close brackets' },
            { key: 'format_on_save', label: 'Format on Save', desc: 'Auto-format code when saving' },
            { key: 'format_on_paste', label: 'Format on Paste', desc: 'Auto-format pasted code' },
            { key: 'trim_trailing_whitespace', label: 'Trim Whitespace', desc: 'Remove trailing spaces on save' },
          ].map((feature) => (
            <div key={feature.key} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{feature.label}</div>
                <div className="text-sm text-bolt-elements-textSecondary">{feature.desc}</div>
              </div>
              <button
                onClick={() => updateSetting(feature.key as keyof EditorSettings, !settings[feature.key as keyof EditorSettings])}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings[feature.key as keyof EditorSettings] ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings[feature.key as keyof EditorSettings] ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Auto-Save Settings */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Auto-Save</h2>
        <p className="text-sm text-bolt-elements-textSecondary mb-4">
          Automatically save files after a period of inactivity. These settings are stored locally.
        </p>
        <div className="space-y-4">
          {/* Enable Auto-Save */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Enable Auto-Save</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                Automatically save files after you stop typing
              </div>
            </div>
            <button
              onClick={autoSaveSettings.toggle}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoSaveSettings.isEnabled ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoSaveSettings.isEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Auto-Save Delay */}
          <div className={autoSaveSettings.isEnabled ? '' : 'opacity-50 pointer-events-none'}>
            <label className="block text-sm font-medium mb-2">
              Auto-Save Delay: {(autoSaveSettings.delay / 1000).toFixed(1)}s
            </label>
            <input
              type="range"
              min="500"
              max="10000"
              step="500"
              value={autoSaveSettings.delay}
              onChange={(e) => autoSaveSettings.setDelay(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-bolt-elements-textTertiary mt-1">
              <span>0.5s</span>
              <span>5s</span>
              <span>10s</span>
            </div>
          </div>

          {/* Skip on Syntax Errors */}
          <div className={`flex items-center justify-between ${autoSaveSettings.isEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <div>
              <div className="font-medium">Skip if File Has Errors</div>
              <div className="text-sm text-bolt-elements-textSecondary">
                Don't auto-save files with syntax errors
              </div>
            </div>
            <button
              onClick={() => autoSaveSettings.setSkipOnErrors(!autoSaveSettings.skipOnErrors)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                autoSaveSettings.skipOnErrors ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoSaveSettings.skipOnErrors ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Terminal Settings */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Terminal</h2>
        <div className="space-y-4">
          {/* Terminal Font Size */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Terminal Font Size: {settings.terminal_font_size}px
            </label>
            <input
              type="range"
              min="10"
              max="24"
              value={settings.terminal_font_size}
              onChange={(e) => updateSetting('terminal_font_size', parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Cursor Style */}
          <div>
            <label className="block text-sm font-medium mb-2">Cursor Style</label>
            <select
              value={settings.terminal_cursor_style}
              onChange={(e) => updateSetting('terminal_cursor_style', e.target.value)}
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            >
              <option value="block">Block</option>
              <option value="line">Line</option>
              <option value="underline">Underline</option>
            </select>
          </div>

          {/* Shell */}
          <div>
            <label className="block text-sm font-medium mb-2">Default Shell</label>
            <select
              value={settings.terminal_shell}
              onChange={(e) => updateSetting('terminal_shell', e.target.value)}
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            >
              <option value="bash">Bash</option>
              <option value="zsh">Zsh</option>
              <option value="fish">Fish</option>
            </select>
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
