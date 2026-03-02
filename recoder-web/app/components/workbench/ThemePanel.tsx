/**
 * ThemePanel — Theme management panel for the workbench.
 * Browse built-in themes, create custom themes, generate themes via AI from screenshots.
 */

import { useState, useCallback, useRef } from 'react';
import { useThemes, type BuiltinTheme, type CustomTheme } from '~/lib/hooks/useThemes';

export function ThemePanel() {
  const {
    builtinThemes,
    customThemes,
    projectThemeId,
    createTheme,
    updateTheme,
    deleteTheme,
    setProjectTheme,
    removeProjectTheme,
    generateTheme,
    isGenerating,
    isLoading,
  } = useThemes();

  const [activeTab, setActiveTab] = useState<'library' | 'create'>('library');
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>('ai');

  // Manual create state
  const [manualName, setManualName] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');

  // AI generate state
  const [aiImages, setAiImages] = useState<string[]>([]);
  const [aiKeywords, setAiKeywords] = useState('');
  const [aiMode, setAiMode] = useState<'inspired' | 'high-fidelity'>('inspired');
  const [aiModel, setAiModel] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai' | 'google' | 'openrouter'>('openrouter');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      if (aiImages.length + newImages.length >= 5) break;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data URL prefix to get raw base64
        const base64 = result.split(',')[1];
        if (base64) {
          setAiImages(prev => [...prev, base64].slice(0, 5));
        }
      };
      reader.readAsDataURL(file);
    }
  }, [aiImages.length]);

  const handleGenerate = useCallback(async () => {
    if (!aiImages.length || !aiModel || !aiApiKey || !aiProvider) {
      setError('Please provide at least one image, model, API key, and provider');
      return;
    }
    setError('');
    try {
      const prompt = await generateTheme({
        images: aiImages,
        keywords: aiKeywords,
        generationMode: aiMode,
        model: aiModel,
        apiKey: aiApiKey,
        provider: aiProvider,
      });
      setGeneratedPrompt(prompt);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    }
  }, [aiImages, aiKeywords, aiMode, aiModel, aiApiKey, aiProvider, generateTheme]);

  const handleSaveGenerated = useCallback(async () => {
    if (!saveName.trim() || !generatedPrompt) return;
    try {
      const theme = await createTheme(saveName.trim(), 'AI Generated Theme', generatedPrompt);
      setGeneratedPrompt('');
      setSaveName('');
      setAiImages([]);
      setAiKeywords('');
      setActiveTab('library');
      // Auto-select the new theme
      await setProjectTheme(theme.id);
    } catch (err: any) {
      setError(err.message || 'Failed to save theme');
    }
  }, [saveName, generatedPrompt, createTheme, setProjectTheme]);

  const handleManualCreate = useCallback(async () => {
    if (!manualName.trim() || !manualPrompt.trim()) return;
    try {
      const theme = await createTheme(manualName.trim(), manualDescription, manualPrompt);
      setManualName('');
      setManualDescription('');
      setManualPrompt('');
      setActiveTab('library');
      await setProjectTheme(theme.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create theme');
    }
  }, [manualName, manualDescription, manualPrompt, createTheme, setProjectTheme]);

  const handleSelectTheme = useCallback(async (themeId: string) => {
    if (projectThemeId === themeId) {
      await removeProjectTheme();
    } else {
      await setProjectTheme(themeId);
    }
  }, [projectThemeId, setProjectTheme, removeProjectTheme]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab header */}
      <div className="flex border-b border-recoder-elements-borderColor">
        <button
          onClick={() => setActiveTab('library')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'library'
              ? 'text-purple-500 border-b-2 border-purple-500'
              : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary'
          }`}
        >
          Theme Library
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'create'
              ? 'text-purple-500 border-b-2 border-purple-500'
              : 'text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary'
          }`}
        >
          Create Theme
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'library' ? (
          <div className="space-y-3">
            {/* No theme option */}
            <button
              onClick={() => removeProjectTheme()}
              className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                !projectThemeId
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-recoder-elements-borderColor hover:border-purple-500/50'
              }`}
            >
              <div className="font-medium text-recoder-elements-textPrimary">No Theme</div>
              <div className="text-xs text-recoder-elements-textSecondary">AI uses default styling</div>
            </button>

            {/* Built-in themes */}
            <div className="text-xs font-medium text-recoder-elements-textSecondary mt-4 mb-1">Built-in Themes</div>
            {builtinThemes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleSelectTheme(theme.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  projectThemeId === theme.id
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-recoder-elements-borderColor hover:border-purple-500/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-recoder-elements-textPrimary">{theme.name}</span>
                  {projectThemeId === theme.id && (
                    <span className="text-purple-500 text-xs">Active</span>
                  )}
                </div>
                <div className="text-xs text-recoder-elements-textSecondary mt-0.5">{theme.description}</div>
              </button>
            ))}

            {/* Custom themes */}
            {customThemes.length > 0 && (
              <>
                <div className="text-xs font-medium text-recoder-elements-textSecondary mt-4 mb-1">Custom Themes</div>
                {customThemes.map((theme) => (
                  <div
                    key={theme.id}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      projectThemeId === theme.id
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-recoder-elements-borderColor'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => handleSelectTheme(theme.id)}
                        className="flex-1 text-left"
                      >
                        <span className="font-medium text-recoder-elements-textPrimary">{theme.name}</span>
                        {projectThemeId === theme.id && (
                          <span className="text-purple-500 text-xs ml-2">Active</span>
                        )}
                      </button>
                      <button
                        onClick={() => deleteTheme(theme.id)}
                        className="text-xs text-red-500 hover:underline ml-2"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="text-xs text-recoder-elements-textSecondary mt-0.5">{theme.description}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Create mode toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setCreateMode('ai')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  createMode === 'ai'
                    ? 'bg-purple-500/20 text-purple-500 border border-purple-500/50'
                    : 'border border-recoder-elements-borderColor text-recoder-elements-textSecondary'
                }`}
              >
                AI Generator
              </button>
              <button
                onClick={() => setCreateMode('manual')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  createMode === 'manual'
                    ? 'bg-purple-500/20 text-purple-500 border border-purple-500/50'
                    : 'border border-recoder-elements-borderColor text-recoder-elements-textSecondary'
                }`}
              >
                Manual
              </button>
            </div>

            {createMode === 'ai' ? (
              <div className="space-y-3">
                {/* Image upload */}
                <div>
                  <label className="block text-xs text-recoder-elements-textSecondary mb-1">
                    Screenshots ({aiImages.length}/5)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={aiImages.length >= 5}
                    className="w-full px-3 py-6 rounded-lg border-2 border-dashed border-recoder-elements-borderColor text-recoder-elements-textSecondary text-sm hover:border-purple-500/50 hover:text-purple-500 disabled:opacity-50 transition-colors"
                  >
                    {aiImages.length > 0
                      ? `${aiImages.length} image(s) uploaded. Click to add more.`
                      : 'Click or drag screenshots here'}
                  </button>
                  {aiImages.length > 0 && (
                    <button
                      onClick={() => setAiImages([])}
                      className="text-xs text-red-500 hover:underline mt-1"
                    >
                      Clear images
                    </button>
                  )}
                </div>

                {/* Keywords */}
                <div>
                  <label className="block text-xs text-recoder-elements-textSecondary mb-1">Keywords (optional)</label>
                  <input
                    type="text"
                    value={aiKeywords}
                    onChange={(e) => setAiKeywords(e.target.value)}
                    placeholder="e.g., dark mode, glassmorphism, startup"
                    maxLength={500}
                    className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm"
                  />
                </div>

                {/* Generation mode */}
                <div>
                  <label className="block text-xs text-recoder-elements-textSecondary mb-1">Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAiMode('inspired')}
                      className={`flex-1 px-3 py-1.5 rounded text-xs ${
                        aiMode === 'inspired'
                          ? 'bg-purple-500/20 text-purple-500 border border-purple-500/50'
                          : 'border border-recoder-elements-borderColor text-recoder-elements-textSecondary'
                      }`}
                    >
                      Inspired
                    </button>
                    <button
                      onClick={() => setAiMode('high-fidelity')}
                      className={`flex-1 px-3 py-1.5 rounded text-xs ${
                        aiMode === 'high-fidelity'
                          ? 'bg-purple-500/20 text-purple-500 border border-purple-500/50'
                          : 'border border-recoder-elements-borderColor text-recoder-elements-textSecondary'
                      }`}
                    >
                      High Fidelity
                    </button>
                  </div>
                </div>

                {/* Provider & model */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-recoder-elements-textSecondary mb-1">Provider</label>
                    <select
                      value={aiProvider}
                      onChange={(e) => setAiProvider(e.target.value as any)}
                      className="w-full px-2 py-1.5 rounded border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-xs"
                    >
                      <option value="openrouter">OpenRouter</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="google">Google</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-recoder-elements-textSecondary mb-1">Model</label>
                    <input
                      type="text"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      placeholder="e.g., gpt-4o"
                      className="w-full px-2 py-1.5 rounded border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-recoder-elements-textSecondary mb-1">API Key</label>
                  <input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder="Your API key for this provider"
                    className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm"
                  />
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !aiImages.length || !aiModel || !aiApiKey}
                  className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {isGenerating ? 'Generating...' : 'Generate Theme'}
                </button>

                {/* Generated result */}
                {generatedPrompt && (
                  <div className="space-y-2">
                    <label className="block text-xs text-recoder-elements-textSecondary">Generated Theme (editable)</label>
                    <textarea
                      value={generatedPrompt}
                      onChange={(e) => setGeneratedPrompt(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-xs font-mono resize-y"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="Theme name"
                        className="flex-1 px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm"
                      />
                      <button
                        onClick={handleSaveGenerated}
                        disabled={!saveName.trim() || isLoading}
                        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Manual create */
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-recoder-elements-textSecondary mb-1">Name</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="My Custom Theme"
                    className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-recoder-elements-textSecondary mb-1">Description</label>
                  <input
                    type="text"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="Brief description"
                    className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-recoder-elements-textSecondary mb-1">
                    Theme Prompt (wrap in &lt;theme&gt;&lt;/theme&gt;)
                  </label>
                  <textarea
                    value={manualPrompt}
                    onChange={(e) => setManualPrompt(e.target.value)}
                    rows={10}
                    placeholder={'<theme>\nDESIGN SYSTEM: ...\n\nCOLOR SYSTEM:\n- Primary: ...\n\nTYPOGRAPHY:\n...\n</theme>'}
                    className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-xs font-mono resize-y"
                  />
                </div>
                <button
                  onClick={handleManualCreate}
                  disabled={!manualName.trim() || !manualPrompt.trim() || isLoading}
                  className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  Create Theme
                </button>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
