import { useStore } from '@nanostores/react';
import { useState, memo } from 'react';
import { classNames } from '~/utils/classNames';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import {
  preferencesStore,
  settingsPanelOpen,
  closeSettingsPanel,
  updateEditorPreferences,
  updateTerminalPreferences,
  updateAIPreferences,
  resetEditorPreferences,
  resetTerminalPreferences,
  resetAIPreferences,
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_TERMINAL_PREFERENCES,
  DEFAULT_AI_PREFERENCES,
} from '~/lib/stores/settings';
import {
  editorConfigStore,
  updateEditorConfig,
  resetEditorConfig,
  DEFAULT_EDITOR_CONFIG,
  CURSOR_BLINKING_OPTIONS,
  SCROLLBAR_STYLE_OPTIONS,
  WHITESPACE_RENDER_OPTIONS,
} from '~/lib/stores/editor-config';

type SettingsTab = 'appearance' | 'editor' | 'terminal' | 'ai' | 'shortcuts';

// Keyboard shortcuts reference data
const KEYBOARD_SHORTCUTS = [
  { category: 'General', shortcuts: [
    { keys: ['Cmd/Ctrl', 'K'], description: 'Open command palette' },
    { keys: ['Cmd/Ctrl', ','], description: 'Open settings' },
    { keys: ['Cmd/Ctrl', 'S'], description: 'Save file' },
  ]},
  { category: 'Editor', shortcuts: [
    { keys: ['Cmd/Ctrl', 'P'], description: 'Quick open file' },
    { keys: ['Cmd/Ctrl', 'Shift', 'F'], description: 'Search in files' },
    { keys: ['Cmd/Ctrl', 'Shift', 'E'], description: 'Show file explorer' },
    { keys: ['Cmd/Ctrl', 'Shift', 'G'], description: 'Show Git panel' },
    { keys: ['Cmd/Ctrl', '/'], description: 'Toggle comment' },
    { keys: ['Cmd/Ctrl', 'D'], description: 'Select next occurrence' },
    { keys: ['Cmd/Ctrl', 'Z'], description: 'Undo' },
    { keys: ['Cmd/Ctrl', 'Shift', 'Z'], description: 'Redo' },
  ]},
  { category: 'Terminal', shortcuts: [
    { keys: ['Cmd/Ctrl', 'J'], description: 'Toggle terminal' },
    { keys: ['Cmd/Ctrl', '`'], description: 'Toggle terminal (alt)' },
    { keys: ['Ctrl', 'R'], description: 'Search command history' },
    { keys: ['Ctrl', 'C'], description: 'Cancel current command' },
  ]},
  { category: 'Navigation', shortcuts: [
    { keys: ['Cmd/Ctrl', '1'], description: 'Terminal tab' },
    { keys: ['Cmd/Ctrl', '2'], description: 'Logs tab' },
    { keys: ['Cmd/Ctrl', '3'], description: 'Problems tab' },
    { keys: ['Cmd/Ctrl', '4'], description: 'Secrets tab' },
  ]},
];

const FONT_FAMILIES = [
  { value: 'Menlo, courier-new, courier, monospace', label: 'Menlo' },
  { value: 'Monaco, monospace', label: 'Monaco' },
  { value: 'Consolas, monospace', label: 'Consolas' },
  { value: '"Fira Code", monospace', label: 'Fira Code' },
  { value: '"JetBrains Mono", monospace', label: 'JetBrains Mono' },
  { value: '"Source Code Pro", monospace', label: 'Source Code Pro' },
];

export const SettingsPanel = memo(() => {
  const isOpen = useStore(settingsPanelOpen);
  const theme = useStore(themeStore);
  const preferences = useStore(preferencesStore);
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'appearance', label: 'Appearance', icon: 'i-ph:palette' },
    { id: 'editor', label: 'Editor', icon: 'i-ph:code' },
    { id: 'terminal', label: 'Terminal', icon: 'i-ph:terminal-window' },
    { id: 'ai', label: 'AI', icon: 'i-ph:robot' },
    { id: 'shortcuts', label: 'Shortcuts', icon: 'i-ph:keyboard' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={closeSettingsPanel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-3xl max-h-[80vh] rounded-xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-recoder-elements-borderColor">
            <h2 className="text-lg font-semibold text-recoder-elements-textPrimary flex items-center gap-2">
              <div className="i-ph:gear text-xl" />
              Settings
            </h2>
            <button
              onClick={closeSettingsPanel}
              className="p-1.5 rounded-lg text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary bg-recoder-elements-background-depth-2 hover:bg-recoder-elements-background-depth-3 transition-colors"
            >
              <div className="i-ph:x text-xl" />
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 border-r border-recoder-elements-borderColor flex-shrink-0 py-2 bg-recoder-elements-background-depth-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={classNames(
                    'w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left',
                    activeTab === tab.id
                      ? 'bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary'
                      : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3'
                  )}
                >
                  <div className={classNames(tab.icon, 'text-lg')} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-recoder-elements-background-depth-1">
              {activeTab === 'appearance' && (
                <AppearanceSettings theme={theme} />
              )}
              {activeTab === 'editor' && (
                <EditorSettings preferences={preferences.editor} />
              )}
              {activeTab === 'terminal' && (
                <TerminalSettings preferences={preferences.terminal} />
              )}
              {activeTab === 'ai' && (
                <AISettings preferences={preferences.ai} />
              )}
              {activeTab === 'shortcuts' && (
                <ShortcutsReference />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

// Appearance Settings
function AppearanceSettings({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-medium text-recoder-elements-textPrimary mb-4">Theme</h3>
        <div className="flex gap-3">
          <button
            onClick={() => theme !== 'light' && toggleTheme()}
            className={classNames(
              'flex-1 p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
              theme === 'light'
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-recoder-elements-borderColor hover:border-recoder-elements-borderColor bg-black/20'
            )}
          >
            <div className="i-ph:sun text-2xl text-yellow-400" />
            <span className="text-sm text-recoder-elements-textPrimary">Light</span>
          </button>
          <button
            onClick={() => theme !== 'dark' && toggleTheme()}
            className={classNames(
              'flex-1 p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
              theme === 'dark'
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-recoder-elements-borderColor hover:border-recoder-elements-borderColor bg-black/20'
            )}
          >
            <div className="i-ph:moon-stars text-2xl text-blue-400" />
            <span className="text-sm text-recoder-elements-textPrimary">Dark</span>
          </button>
        </div>
      </div>

    </div>
  );
}

// Editor Settings
function EditorSettings({ preferences }: { preferences: typeof DEFAULT_EDITOR_PREFERENCES }) {
  const editorConfig = useStore(editorConfigStore);

  const handleResetAll = () => {
    resetEditorPreferences();
    resetEditorConfig();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-recoder-elements-textPrimary">Editor Preferences</h3>
        <button
          onClick={handleResetAll}
          className="text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors px-2 py-1 rounded hover:bg-recoder-elements-background-depth-3"
        >
          Reset to defaults
        </button>
      </div>

      {/* Clean Mode - Featured Setting */}
      <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
        <SettingRow
          label="Clean Mode"
          description="Disable error squiggles and visual noise for a cleaner editing experience"
        >
          <Toggle
            enabled={editorConfig.cleanMode}
            onChange={(enabled) => updateEditorConfig({
              cleanMode: enabled,
              showDiagnostics: enabled ? false : editorConfig.showDiagnostics
            })}
          />
        </SettingRow>
      </div>

      {/* Font Size */}
      <SettingRow
        label="Font Size"
        description="Size of text in the editor"
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="10"
            max="24"
            value={preferences.fontSize}
            onChange={(e) => updateEditorPreferences({ fontSize: parseInt(e.target.value) })}
            className="w-24 accent-amber-500"
          />
          <span className="text-sm text-recoder-elements-textPrimary w-8">{preferences.fontSize}px</span>
        </div>
      </SettingRow>

      {/* Tab Size */}
      <SettingRow
        label="Tab Size"
        description="Number of spaces per tab"
      >
        <select
          value={preferences.tabSize}
          onChange={(e) => updateEditorPreferences({ tabSize: parseInt(e.target.value) })}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm focus:outline-none focus:border-amber-500"
        >
          <option value={2}>2 spaces</option>
          <option value={4}>4 spaces</option>
          <option value={8}>8 spaces</option>
        </select>
      </SettingRow>

      {/* Word Wrap */}
      <SettingRow
        label="Word Wrap"
        description="Wrap long lines to fit in the editor"
      >
        <Toggle
          enabled={preferences.wordWrap}
          onChange={(enabled) => updateEditorPreferences({ wordWrap: enabled })}
        />
      </SettingRow>

      {/* Line Numbers */}
      <SettingRow
        label="Line Numbers"
        description="Show line numbers in the gutter"
      >
        <Toggle
          enabled={preferences.lineNumbers}
          onChange={(enabled) => updateEditorPreferences({ lineNumbers: enabled })}
        />
      </SettingRow>

      {/* Minimap */}
      <SettingRow
        label="Minimap"
        description="Show a minimap overview of the file"
      >
        <Toggle
          enabled={preferences.minimap}
          onChange={(enabled) => updateEditorPreferences({ minimap: enabled })}
        />
      </SettingRow>

      {/* Code Folding */}
      <SettingRow
        label="Code Folding"
        description="Enable folding controls for collapsible code blocks"
      >
        <Toggle
          enabled={preferences.codeFolding}
          onChange={(enabled) => updateEditorPreferences({ codeFolding: enabled })}
        />
      </SettingRow>

      {/* Sticky Scroll */}
      <SettingRow
        label="Sticky Scroll"
        description="Show current scope context at the top of the editor"
      >
        <Toggle
          enabled={preferences.stickyScroll}
          onChange={(enabled) => updateEditorPreferences({ stickyScroll: enabled })}
        />
      </SettingRow>

      {/* Indent Guides */}
      <SettingRow
        label="Indent Guides"
        description="Show vertical lines at each indentation level"
      >
        <Toggle
          enabled={preferences.indentGuides}
          onChange={(enabled) => updateEditorPreferences({ indentGuides: enabled })}
        />
      </SettingRow>

      {/* Bracket Pair Colorization */}
      <SettingRow
        label="Bracket Pair Colorization"
        description="Colorize matching brackets with rainbow colors (disable for cleaner look)"
      >
        <Toggle
          enabled={preferences.bracketPairColorization}
          onChange={(enabled) => updateEditorPreferences({ bracketPairColorization: enabled })}
        />
      </SettingRow>

      {/* Divider for Advanced Settings */}
      <div className="pt-4 border-t border-recoder-elements-borderColor">
        <h4 className="text-sm font-medium text-recoder-elements-textSecondary mb-4">Advanced Settings</h4>
      </div>

      {/* Show Diagnostics */}
      <SettingRow
        label="Show Diagnostics"
        description="Display error and warning squiggles in the editor"
      >
        <Toggle
          enabled={editorConfig.showDiagnostics && !editorConfig.cleanMode}
          onChange={(enabled) => updateEditorConfig({ showDiagnostics: enabled })}
        />
      </SettingRow>

      {/* Smooth Scrolling */}
      <SettingRow
        label="Smooth Scrolling"
        description="Enable smooth scrolling animation"
      >
        <Toggle
          enabled={editorConfig.smoothScrolling}
          onChange={(enabled) => updateEditorConfig({ smoothScrolling: enabled })}
        />
      </SettingRow>

      {/* Cursor Blinking */}
      <SettingRow
        label="Cursor Animation"
        description="Style of cursor blinking animation"
      >
        <select
          value={editorConfig.cursorBlinking}
          onChange={(e) => updateEditorConfig({ cursorBlinking: e.target.value as typeof editorConfig.cursorBlinking })}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm focus:outline-none focus:border-amber-500"
        >
          {CURSOR_BLINKING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingRow>

      {/* Scrollbar Style */}
      <SettingRow
        label="Scrollbar Style"
        description="Customize scrollbar appearance"
      >
        <select
          value={editorConfig.scrollbarStyle}
          onChange={(e) => updateEditorConfig({ scrollbarStyle: e.target.value as typeof editorConfig.scrollbarStyle })}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm focus:outline-none focus:border-amber-500"
        >
          {SCROLLBAR_STYLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingRow>

      {/* Scrollbar Size */}
      {editorConfig.scrollbarStyle === 'thin' && (
        <SettingRow
          label="Scrollbar Size"
          description="Width of the thin scrollbar"
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="4"
              max="16"
              value={editorConfig.scrollbarSize}
              onChange={(e) => updateEditorConfig({ scrollbarSize: parseInt(e.target.value) })}
              className="w-24 accent-amber-500"
            />
            <span className="text-sm text-recoder-elements-textPrimary w-8">{editorConfig.scrollbarSize}px</span>
          </div>
        </SettingRow>
      )}

      {/* Render Whitespace */}
      <SettingRow
        label="Render Whitespace"
        description="When to show whitespace characters"
      >
        <select
          value={editorConfig.renderWhitespace}
          onChange={(e) => updateEditorConfig({ renderWhitespace: e.target.value as typeof editorConfig.renderWhitespace })}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm focus:outline-none focus:border-amber-500"
        >
          {WHITESPACE_RENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingRow>

      {/* Highlight Active Line */}
      <SettingRow
        label="Highlight Active Line"
        description="Highlight the line where the cursor is"
      >
        <Toggle
          enabled={editorConfig.highlightActiveLine}
          onChange={(enabled) => updateEditorConfig({ highlightActiveLine: enabled })}
        />
      </SettingRow>

      {/* Large File Optimizations */}
      <SettingRow
        label="Large File Optimizations"
        description="Enable performance optimizations for large files"
      >
        <Toggle
          enabled={editorConfig.largeFileOptimizations}
          onChange={(enabled) => updateEditorConfig({ largeFileOptimizations: enabled })}
        />
      </SettingRow>
    </div>
  );
}

// Terminal Settings
function TerminalSettings({ preferences }: { preferences: typeof DEFAULT_TERMINAL_PREFERENCES }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-recoder-elements-textPrimary">Terminal Preferences</h3>
        <button
          onClick={resetTerminalPreferences}
          className="text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors px-2 py-1 rounded hover:bg-recoder-elements-background-depth-3"
        >
          Reset to defaults
        </button>
      </div>

      {/* Font Size */}
      <SettingRow
        label="Font Size"
        description="Size of text in the terminal"
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="10"
            max="20"
            value={preferences.fontSize}
            onChange={(e) => updateTerminalPreferences({ fontSize: parseInt(e.target.value) })}
            className="w-24 accent-amber-500"
          />
          <span className="text-sm text-recoder-elements-textPrimary w-8">{preferences.fontSize}px</span>
        </div>
      </SettingRow>

      {/* Font Family */}
      <SettingRow
        label="Font Family"
        description="Monospace font for the terminal"
      >
        <select
          value={preferences.fontFamily}
          onChange={(e) => updateTerminalPreferences({ fontFamily: e.target.value })}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm focus:outline-none focus:border-amber-500"
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </SettingRow>

      {/* Cursor Blink */}
      <SettingRow
        label="Cursor Blink"
        description="Animate the cursor in the terminal"
      >
        <Toggle
          enabled={preferences.cursorBlink}
          onChange={(enabled) => updateTerminalPreferences({ cursorBlink: enabled })}
        />
      </SettingRow>

      {/* Scrollback */}
      <SettingRow
        label="Scrollback Lines"
        description="Number of lines to keep in history"
      >
        <select
          value={preferences.scrollback}
          onChange={(e) => updateTerminalPreferences({ scrollback: parseInt(e.target.value) })}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm focus:outline-none focus:border-amber-500"
        >
          <option value={1000}>1,000 lines</option>
          <option value={5000}>5,000 lines</option>
          <option value={10000}>10,000 lines</option>
          <option value={50000}>50,000 lines</option>
        </select>
      </SettingRow>
    </div>
  );
}

// AI Settings
function AISettings({ preferences }: { preferences: typeof DEFAULT_AI_PREFERENCES }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-recoder-elements-textPrimary">AI Preferences</h3>
        <button
          onClick={resetAIPreferences}
          className="text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors px-2 py-1 rounded hover:bg-recoder-elements-background-depth-3"
        >
          Reset to defaults
        </button>
      </div>

      {/* Temperature */}
      <SettingRow
        label="Temperature"
        description="Higher values make output more random, lower values more deterministic"
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="100"
            value={preferences.temperature * 100}
            onChange={(e) => updateAIPreferences({ temperature: parseInt(e.target.value) / 100 })}
            className="w-24 accent-amber-500"
          />
          <span className="text-sm text-recoder-elements-textPrimary w-10">{preferences.temperature.toFixed(2)}</span>
        </div>
      </SettingRow>

      {/* Max Tokens */}
      <SettingRow
        label="Max Tokens"
        description="Maximum length of AI responses"
      >
        <select
          value={preferences.maxTokens}
          onChange={(e) => updateAIPreferences({ maxTokens: parseInt(e.target.value) })}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm focus:outline-none focus:border-amber-500"
        >
          <option value={1024}>1,024 tokens</option>
          <option value={2048}>2,048 tokens</option>
          <option value={4096}>4,096 tokens</option>
          <option value={8192}>8,192 tokens</option>
          <option value={16384}>16,384 tokens</option>
        </select>
      </SettingRow>

      {/* Stream Responses */}
      <SettingRow
        label="Stream Responses"
        description="Show AI responses as they are generated"
      >
        <Toggle
          enabled={preferences.streamResponses}
          onChange={(enabled) => updateAIPreferences({ streamResponses: enabled })}
        />
      </SettingRow>

      <div className="pt-4 border-t border-recoder-elements-borderColor">
        <p className="text-sm text-recoder-elements-textTertiary">
          Model selection is available in the chat interface. These settings apply to all models.
        </p>
      </div>
    </div>
  );
}

// Shortcuts Reference
function ShortcutsReference() {
  return (
    <div className="space-y-6">
      <h3 className="text-base font-medium text-recoder-elements-textPrimary">Keyboard Shortcuts</h3>

      {KEYBOARD_SHORTCUTS.map((category) => (
        <div key={category.category}>
          <h4 className="text-sm font-medium text-recoder-elements-textSecondary mb-2">{category.category}</h4>
          <div className="space-y-1">
            {category.shortcuts.map((shortcut, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-recoder-elements-background-depth-2"
              >
                <span className="text-sm text-recoder-elements-textSecondary">{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, keyIdx) => (
                    <span key={keyIdx}>
                      <kbd className="px-2 py-1 text-xs rounded bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary border border-recoder-elements-borderColor">
                        {key}
                      </kbd>
                      {keyIdx < shortcut.keys.length - 1 && (
                        <span className="text-recoder-elements-textTertiary mx-0.5">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="pt-4 border-t border-recoder-elements-borderColor">
        <p className="text-sm text-recoder-elements-textTertiary">
          Some shortcuts may vary based on your operating system. "Cmd" is for Mac, "Ctrl" is for Windows/Linux.
        </p>
      </div>
    </div>
  );
}

// Reusable Components
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-recoder-elements-borderColor">
      <div className="flex-1 mr-4">
        <div className="text-sm font-medium text-recoder-elements-textPrimary">{label}</div>
        <div className="text-xs text-recoder-elements-textTertiary mt-0.5">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={classNames(
        'relative w-11 h-6 rounded-full transition-colors',
        enabled ? 'bg-amber-500' : 'bg-recoder-elements-background-depth-3'
      )}
    >
      <span
        className={classNames(
          'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}
