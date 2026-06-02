/**
 * Project Settings Panel
 * Per-project configuration with tabbed interface
 */

import { useStore } from '@nanostores/react';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import {
  projectSettingsStore,
  settingsPanelOpen,
  activeSettingsTab,
  hasUnsavedChanges,
  isSaving,
  isSettingsValid,
  settingsErrors,
  closeSettingsPanel,
  setActiveTab,
  saveSettings,
  discardChanges,
  resetCategory,
  resetAllSettings,
  updateGeneralSettings,
  updateAISettings,
  updateEditorSettings,
  updatePreviewSettings,
  updateTerminalSettings,
  AVAILABLE_MODELS,
  AVAILABLE_FRAMEWORKS,
  AVAILABLE_LANGUAGES,
  AVAILABLE_SHELLS,
  DEVICE_PRESETS,
  type SettingsCategory,
} from '~/lib/stores/project-settings';

// ==================== TAB CONFIGURATION ====================

const TABS: { id: SettingsCategory; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'i-ph:gear' },
  { id: 'ai', label: 'AI', icon: 'i-ph:robot' },
  { id: 'editor', label: 'Editor', icon: 'i-ph:code' },
  { id: 'preview', label: 'Preview', icon: 'i-ph:browser' },
  { id: 'terminal', label: 'Terminal', icon: 'i-ph:terminal' },
];

// ==================== MAIN COMPONENT ====================

export function ProjectSettings() {
  const isOpen = useStore(settingsPanelOpen);
  const settings = useStore(projectSettingsStore);
  const activeTab = useStore(activeSettingsTab);
  const unsavedChanges = useStore(hasUnsavedChanges);
  const saving = useStore(isSaving);
  const valid = useStore(isSettingsValid);
  const errors = useStore(settingsErrors);

  const handleSave = useCallback(() => {
    if (valid) {
      saveSettings();
    }
  }, [valid]);

  const handleClose = useCallback(() => {
    if (unsavedChanges) {
      if (confirm('You have unsaved changes. Discard them?')) {
        discardChanges();
        closeSettingsPanel();
      }
    } else {
      closeSettingsPanel();
    }
  }, [unsavedChanges]);

  if (!isOpen || !settings) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-recoder-elements-background-depth-2 rounded-lg shadow-2xl w-[800px] max-w-[90vw] max-h-[85vh] flex flex-col overflow-hidden border border-recoder-elements-borderColor"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-recoder-elements-borderColor">
            <div className="flex items-center gap-3">
              <div className="i-ph:gear-six text-xl text-recoder-elements-textPrimary" />
              <h2 className="text-lg font-semibold text-recoder-elements-textPrimary">
                Project Settings
              </h2>
              {unsavedChanges && (
                <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                  Unsaved changes
                </span>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2 rounded-md transition-colors"
            >
              <div className="i-ph:x text-lg" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-recoder-elements-borderColor px-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={classNames(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab.id
                    ? 'border-orange-500 text-recoder-elements-textPrimary'
                    : 'border-transparent text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary'
                )}
              >
                <div className={classNames(tab.icon, 'text-base')} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && <GeneralSettingsTab />}
            {activeTab === 'ai' && <AISettingsTab />}
            {activeTab === 'editor' && <EditorSettingsTab />}
            {activeTab === 'preview' && <PreviewSettingsTab />}
            {activeTab === 'terminal' && <TerminalSettingsTab />}
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="px-6 py-3 bg-red-500/10 border-t border-red-500/20">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <div className="i-ph:warning" />
                <span>{errors.length} validation error(s)</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => resetCategory(activeTab)}
                className="px-3 py-1.5 text-sm text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-2 rounded-md transition-colors"
              >
                Reset Tab
              </button>
              <button
                onClick={resetAllSettings}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
              >
                Reset All
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary bg-recoder-elements-background-depth-2 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!valid || saving || !unsavedChanges}
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="i-ph:spinner animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <div className="i-ph:floppy-disk" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ==================== SETTINGS TABS ====================

function GeneralSettingsTab() {
  const settings = useStore(projectSettingsStore);
  if (!settings) return null;

  const { general } = settings;

  return (
    <div className="space-y-6">
      <SettingGroup title="Project Information">
        <TextInput
          label="Project Name"
          value={general.projectName}
          onChange={(value) => updateGeneralSettings({ projectName: value })}
          placeholder="My Awesome Project"
          maxLength={100}
        />
        <TextArea
          label="Description"
          value={general.description}
          onChange={(value) => updateGeneralSettings({ description: value })}
          placeholder="A brief description of your project..."
          maxLength={500}
          rows={3}
        />
      </SettingGroup>

      <SettingGroup title="Project Type">
        <SelectInput
          label="Framework"
          value={general.framework}
          onChange={(value) => updateGeneralSettings({ framework: value })}
          options={AVAILABLE_FRAMEWORKS.map((f) => ({ value: f.id, label: f.name }))}
        />
        <SelectInput
          label="Primary Language"
          value={general.language}
          onChange={(value) => updateGeneralSettings({ language: value })}
          options={AVAILABLE_LANGUAGES.map((l) => ({ value: l.id, label: l.name }))}
        />
      </SettingGroup>

      <SettingGroup title="Organization">
        <TagInput
          label="Tags"
          value={general.tags}
          onChange={(value) => updateGeneralSettings({ tags: value })}
          placeholder="Add tag..."
          maxTags={20}
        />
      </SettingGroup>
    </div>
  );
}

function AISettingsTab() {
  const settings = useStore(projectSettingsStore);
  if (!settings) return null;

  const { ai } = settings;

  return (
    <div className="space-y-6">
      <SettingGroup title="Model Configuration">
        <SelectInput
          label="AI Model"
          value={ai.model}
          onChange={(value) => updateAISettings({ model: value })}
          options={AVAILABLE_MODELS.map((m) => ({
            value: m.id,
            label: `${m.name} (${m.provider})`,
          }))}
        />
        <SliderInput
          label="Temperature"
          value={ai.temperature}
          onChange={(value) => updateAISettings({ temperature: value })}
          min={0}
          max={2}
          step={0.1}
          description="Higher values make output more creative, lower values more deterministic"
        />
        <NumberInput
          label="Max Tokens"
          value={ai.maxTokens}
          onChange={(value) => updateAISettings({ maxTokens: value })}
          min={100}
          max={128000}
          step={100}
          description="Maximum number of tokens in AI responses"
        />
      </SettingGroup>

      <SettingGroup title="System Prompt">
        <TextArea
          label="Custom System Prompt"
          value={ai.systemPrompt}
          onChange={(value) => updateAISettings({ systemPrompt: value })}
          placeholder="Optional: Override the default system prompt for this project..."
          rows={5}
          maxLength={10000}
          description="Leave empty to use the default system prompt"
        />
      </SettingGroup>

      <SettingGroup title="Behavior">
        <ToggleInput
          label="Stream Responses"
          value={ai.streamResponses}
          onChange={(value) => updateAISettings({ streamResponses: value })}
          description="Show AI responses as they are generated"
        />
        <ToggleInput
          label="Include Project Context"
          value={ai.includeContext}
          onChange={(value) => updateAISettings({ includeContext: value })}
          description="Include file content and project structure in prompts"
        />
        <ToggleInput
          label="Auto-Apply Suggestions"
          value={ai.autoApply}
          onChange={(value) => updateAISettings({ autoApply: value })}
          description="Automatically apply code changes without confirmation"
        />
      </SettingGroup>
    </div>
  );
}

function EditorSettingsTab() {
  const settings = useStore(projectSettingsStore);
  if (!settings) return null;

  const { editor } = settings;

  return (
    <div className="space-y-6">
      <SettingGroup title="Appearance">
        <SelectInput
          label="Theme"
          value={editor.theme}
          onChange={(value) => updateEditorSettings({ theme: value as 'dark' | 'light' | 'system' })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
        <NumberInput
          label="Font Size"
          value={editor.fontSize}
          onChange={(value) => updateEditorSettings({ fontSize: value })}
          min={8}
          max={32}
          step={1}
          suffix="px"
        />
      </SettingGroup>

      <SettingGroup title="Indentation">
        <NumberInput
          label="Tab Size"
          value={editor.tabSize}
          onChange={(value) => updateEditorSettings({ tabSize: value })}
          min={1}
          max={8}
          step={1}
          suffix="spaces"
        />
        <ToggleInput
          label="Use Tabs"
          value={editor.useTabs}
          onChange={(value) => updateEditorSettings({ useTabs: value })}
          description="Use tabs instead of spaces for indentation"
        />
      </SettingGroup>

      <SettingGroup title="Display">
        <ToggleInput
          label="Word Wrap"
          value={editor.wordWrap}
          onChange={(value) => updateEditorSettings({ wordWrap: value })}
          description="Wrap long lines to fit in the editor"
        />
        <ToggleInput
          label="Line Numbers"
          value={editor.lineNumbers}
          onChange={(value) => updateEditorSettings({ lineNumbers: value })}
          description="Show line numbers in the gutter"
        />
        <ToggleInput
          label="Minimap"
          value={editor.minimap}
          onChange={(value) => updateEditorSettings({ minimap: value })}
          description="Show minimap on the right side"
        />
        <ToggleInput
          label="Bracket Colors"
          value={editor.bracketColors}
          onChange={(value) => updateEditorSettings({ bracketColors: value })}
          description="Colorize matching brackets"
        />
        <ToggleInput
          label="Code Folding"
          value={editor.codeFolding}
          onChange={(value) => updateEditorSettings({ codeFolding: value })}
          description="Enable folding of code blocks"
        />
      </SettingGroup>

      <SettingGroup title="Behavior">
        <ToggleInput
          label="Format on Save"
          value={editor.formatOnSave}
          onChange={(value) => updateEditorSettings({ formatOnSave: value })}
          description="Automatically format code when saving"
        />
      </SettingGroup>
    </div>
  );
}

function PreviewSettingsTab() {
  const settings = useStore(projectSettingsStore);
  if (!settings) return null;

  const { preview } = settings;

  return (
    <div className="space-y-6">
      <SettingGroup title="Auto-Refresh">
        <ToggleInput
          label="Auto-Refresh"
          value={preview.autoRefresh}
          onChange={(value) => updatePreviewSettings({ autoRefresh: value })}
          description="Automatically refresh preview when files change"
        />
        <NumberInput
          label="Refresh Delay"
          value={preview.refreshDelay}
          onChange={(value) => updatePreviewSettings({ refreshDelay: value })}
          min={0}
          max={5000}
          step={100}
          suffix="ms"
          disabled={!preview.autoRefresh}
          description="Delay before refreshing after a file change"
        />
      </SettingGroup>

      <SettingGroup title="Device">
        <SelectInput
          label="Default Device"
          value={preview.defaultDevice}
          onChange={(value) =>
            updatePreviewSettings({ defaultDevice: value as 'desktop' | 'tablet' | 'mobile' | 'custom' })
          }
          options={DEVICE_PRESETS.map((d) => ({
            value: d.id,
            label: d.id === 'custom' ? d.name : `${d.name} (${d.width}x${d.height})`,
          }))}
        />
        {preview.defaultDevice === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Width"
              value={preview.customWidth}
              onChange={(value) => updatePreviewSettings({ customWidth: value })}
              min={320}
              max={3840}
              step={10}
              suffix="px"
            />
            <NumberInput
              label="Height"
              value={preview.customHeight}
              onChange={(value) => updatePreviewSettings({ customHeight: value })}
              min={240}
              max={2160}
              step={10}
              suffix="px"
            />
          </div>
        )}
      </SettingGroup>

      <SettingGroup title="Display">
        <SliderInput
          label="Zoom"
          value={preview.zoom}
          onChange={(value) => updatePreviewSettings({ zoom: value })}
          min={25}
          max={200}
          step={5}
          suffix="%"
        />
        <ToggleInput
          label="Show Device Frame"
          value={preview.showDeviceFrame}
          onChange={(value) => updatePreviewSettings({ showDeviceFrame: value })}
          description="Display a device frame around the preview"
        />
        <ToggleInput
          label="Responsive Mode"
          value={preview.responsiveMode}
          onChange={(value) => updatePreviewSettings({ responsiveMode: value })}
          description="Allow resizing the preview viewport"
        />
      </SettingGroup>
    </div>
  );
}

function TerminalSettingsTab() {
  const settings = useStore(projectSettingsStore);
  if (!settings) return null;

  const { terminal } = settings;

  return (
    <div className="space-y-6">
      <SettingGroup title="Shell">
        <SelectInput
          label="Default Shell"
          value={terminal.shell}
          onChange={(value) =>
            updateTerminalSettings({ shell: value as 'bash' | 'zsh' | 'sh' | 'fish' | 'powershell' })
          }
          options={AVAILABLE_SHELLS.map((s) => ({ value: s.id, label: s.name }))}
        />
      </SettingGroup>

      <SettingGroup title="Appearance">
        <NumberInput
          label="Font Size"
          value={terminal.fontSize}
          onChange={(value) => updateTerminalSettings({ fontSize: value })}
          min={8}
          max={24}
          step={1}
          suffix="px"
        />
        <TextInput
          label="Font Family"
          value={terminal.fontFamily}
          onChange={(value) => updateTerminalSettings({ fontFamily: value })}
          placeholder="Menlo, Monaco, monospace"
        />
      </SettingGroup>

      <SettingGroup title="Cursor">
        <SelectInput
          label="Cursor Style"
          value={terminal.cursorStyle}
          onChange={(value) =>
            updateTerminalSettings({ cursorStyle: value as 'block' | 'underline' | 'bar' })
          }
          options={[
            { value: 'block', label: 'Block' },
            { value: 'underline', label: 'Underline' },
            { value: 'bar', label: 'Bar' },
          ]}
        />
        <ToggleInput
          label="Cursor Blink"
          value={terminal.cursorBlink}
          onChange={(value) => updateTerminalSettings({ cursorBlink: value })}
          description="Enable cursor blinking"
        />
      </SettingGroup>

      <SettingGroup title="Behavior">
        <NumberInput
          label="Scrollback"
          value={terminal.scrollback}
          onChange={(value) => updateTerminalSettings({ scrollback: value })}
          min={100}
          max={100000}
          step={1000}
          suffix="lines"
          description="Number of lines to keep in scroll history"
        />
        <ToggleInput
          label="Terminal Bell"
          value={terminal.bell}
          onChange={(value) => updateTerminalSettings({ bell: value })}
          description="Play sound on terminal bell"
        />
        <ToggleInput
          label="Copy on Select"
          value={terminal.copyOnSelect}
          onChange={(value) => updateTerminalSettings({ copyOnSelect: value })}
          description="Automatically copy selected text to clipboard"
        />
      </SettingGroup>
    </div>
  );
}

// ==================== INPUT COMPONENTS ====================

interface SettingGroupProps {
  title: string;
  children: React.ReactNode;
}

function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-recoder-elements-textPrimary">{title}</h3>
      <div className="space-y-4 pl-1">{children}</div>
    </div>
  );
}

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  description?: string;
}

function TextInput({ label, value, onChange, placeholder, maxLength, description }: TextInputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-recoder-elements-textTertiary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-orange-500/50"
      />
      {description && (
        <p className="text-xs text-recoder-elements-textTertiary">{description}</p>
      )}
    </div>
  );
}

interface TextAreaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  description?: string;
}

function TextArea({ label, value, onChange, placeholder, maxLength, rows = 3, description }: TextAreaProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-recoder-elements-textTertiary">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
      />
      {description && (
        <p className="text-xs text-recoder-elements-textTertiary">{description}</p>
      )}
    </div>
  );
}

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  description?: string;
}

function SelectInput({ label, value, onChange, options, description }: SelectInputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-recoder-elements-textTertiary">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-orange-500/50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {description && (
        <p className="text-xs text-recoder-elements-textTertiary">{description}</p>
      )}
    </div>
  );
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  description?: string;
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  description,
}: NumberInputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-recoder-elements-textTertiary">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
        />
        {suffix && (
          <span className="text-sm text-recoder-elements-textTertiary whitespace-nowrap">{suffix}</span>
        )}
      </div>
      {description && (
        <p className="text-xs text-recoder-elements-textTertiary">{description}</p>
      )}
    </div>
  );
}

interface SliderInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  description?: string;
}

function SliderInput({ label, value, onChange, min, max, step, suffix, description }: SliderInputProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-sm text-recoder-elements-textTertiary">{label}</label>
        <span className="text-sm text-recoder-elements-textPrimary">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full h-2 bg-recoder-elements-background-depth-2 rounded-lg appearance-none cursor-pointer accent-orange-500"
      />
      {description && (
        <p className="text-xs text-recoder-elements-textTertiary">{description}</p>
      )}
    </div>
  );
}

interface ToggleInputProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}

function ToggleInput({ label, value, onChange, description }: ToggleInputProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <label className="block text-sm text-recoder-elements-textPrimary">{label}</label>
        {description && (
          <p className="text-xs text-recoder-elements-textTertiary">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={classNames(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500/50',
          value ? 'bg-orange-500' : 'bg-recoder-elements-background-depth-2'
        )}
      >
        <span
          className={classNames(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-zinc-200 shadow ring-0 transition duration-200 ease-in-out',
            value ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}

interface TagInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

function TagInput({ label, value, onChange, placeholder, maxTags = 20 }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (value.length < maxTags && !value.includes(inputValue.trim())) {
        onChange([...value, inputValue.trim()]);
        setInputValue('');
      }
    }
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm text-recoder-elements-textTertiary">{label}</label>
      <div className="flex flex-wrap gap-2 p-2 min-h-[42px] bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-md">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-recoder-elements-background-depth-2 text-recoder-elements-textPrimary rounded"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-red-400"
            >
              <div className="i-ph:x text-xs" />
            </button>
          </span>
        ))}
        {value.length < maxTags && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[100px] bg-transparent text-sm text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none"
          />
        )}
      </div>
      <p className="text-xs text-recoder-elements-textTertiary">
        Press Enter to add a tag ({value.length}/{maxTags})
      </p>
    </div>
  );
}

export default ProjectSettings;
