/**
 * ConsolePanel - Interactive REPL panel for language-specific shells
 * Supports Node.js, Python, Ruby, and Go (via gore)
 */

import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '@nanostores/react';
import { consoleStore, REPL_LANGUAGES, type ReplLanguage, type ReplCommand } from '~/lib/stores/console';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerPost, dockerGet } from '~/lib/services/docker-api';
import { IconButton } from '~/components/ui/IconButton';

interface ConsolePanelProps {
  className?: string;
}

interface LanguageOption {
  id: ReplLanguage;
  name: string;
  icon: string;
  color: string;
  available: boolean;
}

export const ConsolePanel = memo(({ className = '' }: ConsolePanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const session = useStore(consoleStore.session);
  const isLoading = useStore(consoleStore.isLoading);
  const error = useStore(consoleStore.error);
  const selectedLanguage = useStore(consoleStore.selectedLanguage);
  const isMultilineMode = useStore(consoleStore.isMultilineMode);

  const [inputValue, setInputValue] = useState('');
  const [multilineBuffer, setMultilineBuffer] = useState('');
  const [availableLanguages, setAvailableLanguages] = useState<LanguageOption[]>([]);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [isCheckingLanguages, setIsCheckingLanguages] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // Set project ID in store
  useEffect(() => {
    if (projectId) {
      consoleStore.setProjectId(projectId);
    }
  }, [projectId]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [session?.commands]);

  // Check available languages when container is ready
  useEffect(() => {
    if (!projectId || !containerReady) return;

    const checkLanguages = async () => {
      setIsCheckingLanguages(true);
      try {
        const data = await dockerGet<{ languages: Array<{ id: ReplLanguage; name: string }> }>(
          `/api/repl/${projectId}/languages`
        );
        if (data?.languages) {
          const available = new Set(data.languages.map(l => l.id));

          setAvailableLanguages(
            (Object.keys(REPL_LANGUAGES) as ReplLanguage[]).map((lang) => ({
              id: lang,
              name: REPL_LANGUAGES[lang].displayName,
              icon: REPL_LANGUAGES[lang].icon,
              color: REPL_LANGUAGES[lang].color,
              available: available.has(lang),
            }))
          );
        }
      } catch (err) {
        console.error('[Console] Error checking languages:', err);
        // Default to all languages as potentially available
        setAvailableLanguages(
          (Object.keys(REPL_LANGUAGES) as ReplLanguage[]).map((lang) => ({
            id: lang,
            name: REPL_LANGUAGES[lang].displayName,
            icon: REPL_LANGUAGES[lang].icon,
            color: REPL_LANGUAGES[lang].color,
            available: true,
          }))
        );
      } finally {
        setIsCheckingLanguages(false);
      }
    };

    checkLanguages();
  }, [projectId, containerReady]);

  // Close language menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(e.target as Node)) {
        setShowLanguageMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Start REPL session
  const handleStartSession = useCallback(async (language: ReplLanguage) => {
    if (!projectId || !containerReady) return;

    consoleStore.setLoading(true);
    consoleStore.clearError();

    try {
      const data = await dockerPost<{ sessionId: string; welcomeMessage?: string; error?: string }>(
        `/api/repl/${projectId}/start`,
        { language }
      );

      if (!data || data.error) {
        throw new Error(data?.error || 'Failed to start REPL');
      }

      consoleStore.startSession(language);
      if (data.welcomeMessage) {
        consoleStore.addCommandResult('', data.welcomeMessage, false);
      }

      setShowLanguageMenu(false);
      inputRef.current?.focus();
    } catch (err: any) {
      consoleStore.setError(err.message);
    } finally {
      consoleStore.setLoading(false);
    }
  }, [projectId, containerReady]);

  // Stop REPL session
  const handleStopSession = useCallback(async () => {
    if (!projectId || !session) return;

    try {
      await dockerPost(`/api/repl/${projectId}/stop`, { language: session.language });
      consoleStore.stopSession();
    } catch (err: any) {
      console.error('[Console] Error stopping session:', err);
    }
  }, [projectId, session]);

  // Execute code
  const handleExecute = useCallback(async (code: string) => {
    if (!projectId || !session || !code.trim()) return;

    consoleStore.setLoading(true);

    try {
      const data = await dockerPost<{ output?: string; error?: string; isError?: boolean }>(
        `/api/repl/${projectId}/execute`,
        {
          language: session.language,
          code: code.trim(),
        }
      );

      if (data?.isError || data?.error) {
        consoleStore.addCommandResult(code, data.error || data.output || 'Error', true);
      } else {
        consoleStore.addCommandResult(code, data?.output || '', false);
      }
    } catch (err: any) {
      consoleStore.addCommandResult(code, err.message, true);
    } finally {
      consoleStore.setLoading(false);
      setInputValue('');
      setMultilineBuffer('');
      consoleStore.clearCurrentInput();
    }
  }, [projectId, session]);

  // Handle key press in input
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to execute (Shift+Enter for multi-line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const code = isMultilineMode ? multilineBuffer + '\n' + inputValue : inputValue;
      if (code.trim()) {
        handleExecute(code);
      }
      return;
    }

    // Shift+Enter for multi-line mode
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (!isMultilineMode) {
        consoleStore.setMultilineMode(true);
        setMultilineBuffer(inputValue);
        setInputValue('');
      } else {
        setMultilineBuffer(multilineBuffer + '\n' + inputValue);
        setInputValue('');
      }
      return;
    }

    // Up arrow for history navigation
    if (e.key === 'ArrowUp' && !isMultilineMode && inputValue === '') {
      e.preventDefault();
      const prev = consoleStore.navigateHistory('up');
      if (prev !== null) {
        setInputValue(prev);
      }
      return;
    }

    // Down arrow for history navigation
    if (e.key === 'ArrowDown' && !isMultilineMode) {
      e.preventDefault();
      const next = consoleStore.navigateHistory('down');
      if (next !== null) {
        setInputValue(next);
      }
      return;
    }

    // Escape to cancel multi-line mode
    if (e.key === 'Escape' && isMultilineMode) {
      e.preventDefault();
      consoleStore.setMultilineMode(false);
      setMultilineBuffer('');
      return;
    }

    // Ctrl+C to cancel current input
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      setInputValue('');
      setMultilineBuffer('');
      consoleStore.setMultilineMode(false);
      return;
    }

    // Ctrl+L to clear
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      consoleStore.clearOutput();
      return;
    }
  }, [inputValue, multilineBuffer, isMultilineMode, handleExecute]);

  // Clear output
  const handleClear = useCallback(() => {
    consoleStore.clearOutput();
  }, []);

  // Render command output with syntax highlighting
  const renderOutput = useCallback((command: ReplCommand) => {
    const langConfig = session ? REPL_LANGUAGES[session.language] : null;
    const prompt = langConfig?.prompt || '> ';
    const multilinePrompt = langConfig?.multilinePrompt || '... ';

    return (
      <div key={command.id} className="mb-2 font-mono text-xs">
        {/* Input */}
        <div className="flex">
          <span className="text-green-400 select-none">{command.isMultiline ? multilinePrompt : prompt}</span>
          <span className="text-white whitespace-pre-wrap break-all">{command.input}</span>
        </div>
        {/* Output */}
        {command.output && (
          <div
            className={`whitespace-pre-wrap break-all pl-4 ${
              command.isError ? 'text-red-400' : 'text-gray-300'
            }`}
          >
            {command.output}
          </div>
        )}
      </div>
    );
  }, [session]);

  // Get current prompt
  const getCurrentPrompt = useCallback(() => {
    if (!session) return '> ';
    const langConfig = REPL_LANGUAGES[session.language];
    return isMultilineMode ? langConfig.multilinePrompt : langConfig.prompt;
  }, [session, isMultilineMode]);

  // Variable inspection panel
  const variables = session ? consoleStore.getSessionVariables() : [];

  if (!containerReady) {
    return (
      <div className={`flex flex-col h-full bg-bolt-elements-background-depth-1 ${className}`}>
        <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
            <p className="text-sm">Waiting for container...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 bg-bolt-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <div className="relative" ref={languageMenuRef}>
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-bolt-elements-background-depth-3 transition-colors"
              disabled={isCheckingLanguages}
            >
              {session ? (
                <>
                  <span className={REPL_LANGUAGES[session.language].icon} />
                  <span>{REPL_LANGUAGES[session.language].displayName}</span>
                  <span className="w-2 h-2 rounded-full bg-green-500" title="Running" />
                </>
              ) : (
                <>
                  <span className="i-ph:terminal" />
                  <span>Select Language</span>
                </>
              )}
              <span className="i-ph:caret-down text-xs" />
            </button>

            {/* Language Dropdown */}
            {showLanguageMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg shadow-lg z-50 py-1">
                {availableLanguages.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleStartSession(lang.id)}
                    disabled={!lang.available || isLoading}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-bolt-elements-background-depth-4 transition-colors ${
                      !lang.available ? 'opacity-50 cursor-not-allowed' : ''
                    } ${session?.language === lang.id ? 'bg-blue-500/20' : ''}`}
                  >
                    <span className={lang.icon} />
                    <span className="flex-1">{lang.name}</span>
                    {!lang.available && (
                      <span className="text-xs text-bolt-elements-textTertiary">Not available</span>
                    )}
                    {session?.language === lang.id && (
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          {isLoading && (
            <span className="i-ph:spinner animate-spin text-sm text-bolt-elements-textTertiary" />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {session && (
            <>
              <IconButton
                icon="i-ph:trash"
                size="sm"
                title="Clear console (Ctrl+L)"
                onClick={handleClear}
              />
              <IconButton
                icon="i-ph:stop"
                size="sm"
                title="Stop REPL session"
                onClick={handleStopSession}
                className="text-red-400 hover:text-red-300"
              />
            </>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => consoleStore.clearError()}
            className="i-ph:x hover:text-red-300"
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Output Area */}
        <div
          ref={outputRef}
          className="flex-1 overflow-auto p-3 font-mono text-xs"
        >
          {!session ? (
            <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary">
              <span className="i-ph:terminal text-4xl mb-3" />
              <p className="text-sm mb-2">Interactive Console</p>
              <p className="text-xs text-center max-w-xs">
                Select a language above to start an interactive REPL session.
                Supports Node.js, Python, Ruby, and Go.
              </p>
              <div className="flex gap-2 mt-4">
                {availableLanguages.filter(l => l.available).slice(0, 4).map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleStartSession(lang.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 rounded text-sm transition-colors"
                    style={{ borderLeft: `3px solid ${lang.color}` }}
                  >
                    <span className={lang.icon} />
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Welcome message and command history */}
              {session.commands.map(renderOutput)}

              {/* Multi-line buffer display */}
              {isMultilineMode && multilineBuffer && (
                <div className="text-yellow-400/70 text-xs mb-1">
                  <span className="i-ph:dots-three-vertical mr-1" />
                  Multi-line mode (Shift+Enter to add line, Enter to execute, Esc to cancel)
                  <pre className="mt-1 pl-4 text-gray-400">{multilineBuffer}</pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Variables Panel (collapsible) */}
        {session && variables.length > 0 && (
          <div className="w-40 border-l border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 overflow-auto">
            <div className="px-2 py-1.5 text-xs font-medium text-bolt-elements-textTertiary border-b border-bolt-elements-borderColor">
              Variables
            </div>
            <div className="p-2 space-y-1">
              {variables.map((varName) => (
                <div
                  key={varName}
                  className="px-2 py-1 text-xs bg-bolt-elements-background-depth-3 rounded font-mono truncate"
                  title={varName}
                >
                  {varName}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      {session && (
        <div className="flex items-start gap-2 px-3 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <span className="text-green-400 font-mono text-xs select-none pt-1">
            {getCurrentPrompt()}
          </span>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter code..."
            disabled={isLoading}
            className="flex-1 bg-transparent border-none outline-none resize-none font-mono text-xs text-white placeholder-gray-500 min-h-[20px] max-h-[100px]"
            rows={1}
            style={{
              height: 'auto',
              minHeight: '20px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
            }}
          />
          <button
            onClick={() => handleExecute(isMultilineMode ? multilineBuffer + '\n' + inputValue : inputValue)}
            disabled={isLoading || !inputValue.trim()}
            className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            title="Execute (Enter)"
          >
            <span className="i-ph:play" />
          </button>
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      {session && (
        <div className="px-3 py-1 text-xs text-bolt-elements-textTertiary border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 flex gap-4">
          <span><kbd className="px-1 bg-bolt-elements-background-depth-3 rounded">Enter</kbd> Execute</span>
          <span><kbd className="px-1 bg-bolt-elements-background-depth-3 rounded">Shift+Enter</kbd> Multi-line</span>
          <span><kbd className="px-1 bg-bolt-elements-background-depth-3 rounded">Up/Down</kbd> History</span>
          <span><kbd className="px-1 bg-bolt-elements-background-depth-3 rounded">Ctrl+L</kbd> Clear</span>
        </div>
      )}
    </div>
  );
});

ConsolePanel.displayName = 'ConsolePanel';

export default ConsolePanel;
