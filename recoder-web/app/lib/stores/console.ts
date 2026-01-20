/**
 * Console/REPL Store
 * Manages state for interactive language shells (Node.js, Python, Ruby, Go)
 */

import { atom, type WritableAtom } from 'nanostores';

export type ReplLanguage = 'nodejs' | 'python' | 'ruby' | 'go';

export interface ReplCommand {
  id: string;
  input: string;
  output: string;
  timestamp: number;
  isError: boolean;
  isMultiline: boolean;
}

export interface ReplSession {
  id: string;
  language: ReplLanguage;
  startedAt: number;
  isRunning: boolean;
  commands: ReplCommand[];
}

export interface ReplLanguageConfig {
  name: string;
  displayName: string;
  command: string;
  args: string[];
  prompt: string;
  multilinePrompt: string;
  extension: string;
  icon: string;
  color: string;
}

export const REPL_LANGUAGES: Record<ReplLanguage, ReplLanguageConfig> = {
  nodejs: {
    name: 'nodejs',
    displayName: 'Node.js',
    command: 'node',
    args: ['-i'],
    prompt: '> ',
    multilinePrompt: '... ',
    extension: '.js',
    icon: 'i-logos:nodejs-icon',
    color: '#68a063',
  },
  python: {
    name: 'python',
    displayName: 'Python',
    command: 'python3',
    args: ['-i'],
    prompt: '>>> ',
    multilinePrompt: '... ',
    extension: '.py',
    icon: 'i-logos:python',
    color: '#3776ab',
  },
  ruby: {
    name: 'ruby',
    displayName: 'Ruby',
    command: 'irb',
    args: ['--simple-prompt'],
    prompt: '>> ',
    multilinePrompt: '?> ',
    extension: '.rb',
    icon: 'i-logos:ruby',
    color: '#cc342d',
  },
  go: {
    name: 'go',
    displayName: 'Go',
    command: 'gore',
    args: [],
    prompt: 'gore> ',
    multilinePrompt: '..... ',
    extension: '.go',
    icon: 'i-logos:go',
    color: '#00add8',
  },
};

export class ConsoleStore {
  // Current session
  session: WritableAtom<ReplSession | null> = import.meta.hot?.data.consoleSession ?? atom(null);

  // UI state
  isLoading: WritableAtom<boolean> = import.meta.hot?.data.consoleLoading ?? atom(false);
  error: WritableAtom<string | null> = import.meta.hot?.data.consoleError ?? atom(null);
  showConsole: WritableAtom<boolean> = import.meta.hot?.data.showConsole ?? atom(false);
  selectedLanguage: WritableAtom<ReplLanguage> = import.meta.hot?.data.consoleLanguage ?? atom('nodejs');

  // Command history for navigation
  commandHistory: WritableAtom<string[]> = import.meta.hot?.data.commandHistory ?? atom([]);
  historyIndex: WritableAtom<number> = import.meta.hot?.data.historyIndex ?? atom(-1);

  // Current input (for multi-line support)
  currentInput: WritableAtom<string> = import.meta.hot?.data.currentInput ?? atom('');
  isMultilineMode: WritableAtom<boolean> = import.meta.hot?.data.isMultilineMode ?? atom(false);

  // Project context
  #projectId: string | null = null;

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.consoleSession = this.session;
      import.meta.hot.data.consoleLoading = this.isLoading;
      import.meta.hot.data.consoleError = this.error;
      import.meta.hot.data.showConsole = this.showConsole;
      import.meta.hot.data.consoleLanguage = this.selectedLanguage;
      import.meta.hot.data.commandHistory = this.commandHistory;
      import.meta.hot.data.historyIndex = this.historyIndex;
      import.meta.hot.data.currentInput = this.currentInput;
      import.meta.hot.data.isMultilineMode = this.isMultilineMode;
    }
  }

  setProjectId(projectId: string) {
    this.#projectId = projectId;
  }

  getProjectId(): string | null {
    return this.#projectId;
  }

  toggleConsole(value?: boolean) {
    this.showConsole.set(value !== undefined ? value : !this.showConsole.get());
  }

  setLanguage(language: ReplLanguage) {
    this.selectedLanguage.set(language);
    // Clear history index when changing language
    this.historyIndex.set(-1);
  }

  getLanguageConfig(language?: ReplLanguage): ReplLanguageConfig {
    return REPL_LANGUAGES[language || this.selectedLanguage.get()];
  }

  // Add command to history
  addToHistory(command: string) {
    if (!command.trim()) return;

    const history = this.commandHistory.get();
    // Avoid duplicates at the end
    if (history[history.length - 1] !== command) {
      this.commandHistory.set([...history, command]);
    }
    this.historyIndex.set(-1); // Reset history navigation
  }

  // Navigate history (up/down arrows)
  navigateHistory(direction: 'up' | 'down'): string | null {
    const history = this.commandHistory.get();
    if (history.length === 0) return null;

    let index = this.historyIndex.get();

    if (direction === 'up') {
      if (index === -1) {
        index = history.length - 1;
      } else if (index > 0) {
        index--;
      }
    } else {
      if (index === -1) return null;
      if (index < history.length - 1) {
        index++;
      } else {
        this.historyIndex.set(-1);
        return '';
      }
    }

    this.historyIndex.set(index);
    return history[index];
  }

  // Add command result to session
  addCommandResult(input: string, output: string, isError: boolean = false) {
    const session = this.session.get();
    if (!session) return;

    const command: ReplCommand = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      input,
      output,
      timestamp: Date.now(),
      isError,
      isMultiline: input.includes('\n'),
    };

    this.session.set({
      ...session,
      commands: [...session.commands, command],
    });

    this.addToHistory(input);
  }

  // Start a new session
  startSession(language: ReplLanguage) {
    const session: ReplSession = {
      id: `repl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      language,
      startedAt: Date.now(),
      isRunning: true,
      commands: [],
    };

    this.session.set(session);
    this.selectedLanguage.set(language);
    this.error.set(null);
  }

  // Stop current session
  stopSession() {
    const session = this.session.get();
    if (session) {
      this.session.set({
        ...session,
        isRunning: false,
      });
    }
  }

  // Clear all output
  clearOutput() {
    const session = this.session.get();
    if (session) {
      this.session.set({
        ...session,
        commands: [],
      });
    }
  }

  // Clear error
  clearError() {
    this.error.set(null);
  }

  // Set loading state
  setLoading(loading: boolean) {
    this.isLoading.set(loading);
  }

  // Set error
  setError(error: string) {
    this.error.set(error);
    this.isLoading.set(false);
  }

  // Multi-line input management
  setMultilineMode(enabled: boolean) {
    this.isMultilineMode.set(enabled);
  }

  appendToInput(text: string) {
    const current = this.currentInput.get();
    this.currentInput.set(current + text);
  }

  setCurrentInput(text: string) {
    this.currentInput.set(text);
  }

  clearCurrentInput() {
    this.currentInput.set('');
    this.isMultilineMode.set(false);
  }

  // Get variables from current session (for inspection)
  getSessionVariables(): string[] {
    const session = this.session.get();
    if (!session) return [];

    // Extract variable names from successful commands
    const variables: Set<string> = new Set();

    for (const cmd of session.commands) {
      if (!cmd.isError) {
        // Simple regex patterns for variable declarations
        const patterns: Record<ReplLanguage, RegExp[]> = {
          nodejs: [/(?:const|let|var)\s+(\w+)/g],
          python: [/^(\w+)\s*=/gm],
          ruby: [/^(\w+)\s*=/gm, /@(\w+)/g],
          go: [/(\w+)\s*:=/g],
        };

        const langPatterns = patterns[session.language] || [];
        for (const pattern of langPatterns) {
          let match;
          while ((match = pattern.exec(cmd.input)) !== null) {
            variables.add(match[1]);
          }
        }
      }
    }

    return Array.from(variables);
  }

  // Cleanup
  cleanup() {
    this.session.set(null);
    this.commandHistory.set([]);
    this.historyIndex.set(-1);
    this.currentInput.set('');
    this.isMultilineMode.set(false);
    this.error.set(null);
    this.isLoading.set(false);
  }
}

// Export singleton instance
export const consoleStore = new ConsoleStore();
