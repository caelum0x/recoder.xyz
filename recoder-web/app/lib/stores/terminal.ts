import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newShellProcess, type ShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';
import { terminalSync } from '~/lib/terminal-sync';
import { dockerPost } from '~/lib/services/docker-api';
// NOTE: ensureContainerExists is now exported directly from workbench.ts
// Import is done dynamically in #attachDockerTerminal to avoid circular dependency at module load time

interface TerminalSession {
  terminal: ITerminal;
  process: ShellProcess;
  terminalId: string;
  isCommandRunning?: boolean;
  name: string; // Display name for the terminal tab
}

/** Cooldown duration after a keep-alive failure (ms) */
const KEEP_ALIVE_FAILURE_COOLDOWN_MS = 30_000;

export class TerminalStore {
  #terminals: TerminalSession[] = [];
  #projectId: string | null = null;
  #pendingTerminals: ITerminal[] = [];
  #keepAliveInterval?: NodeJS.Timer;
  #keepAliveFailedAt = 0;
  #terminalNameCounter = 0;
  // PERFORMANCE: Track subscription cleanup functions to prevent memory leaks
  #pendingSubscriptions = new Map<ITerminal, () => void>();

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);
  highlightTerminal: WritableAtom<boolean> = import.meta.hot?.data.highlightTerminal ?? atom(false);
  activeTerminalIndex: WritableAtom<number> = import.meta.hot?.data.activeTerminalIndex ?? atom(0);
  terminalCount: WritableAtom<number> = import.meta.hot?.data.terminalCount ?? atom(0);
  commandRunning: WritableAtom<boolean> = import.meta.hot?.data.commandRunning ?? atom(false);
  // Terminal names for UI display
  terminalNames: WritableAtom<Record<string, string>> = import.meta.hot?.data.terminalNames ?? atom({});

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
      import.meta.hot.data.highlightTerminal = this.highlightTerminal;
      import.meta.hot.data.activeTerminalIndex = this.activeTerminalIndex;
      import.meta.hot.data.terminalCount = this.terminalCount;
      import.meta.hot.data.commandRunning = this.commandRunning;
      import.meta.hot.data.terminalNames = this.terminalNames;
    }

    // Load persisted terminal names
    const names = terminalSync.getAllTerminalNames();
    if (Object.keys(names).length > 0) {
      this.terminalNames.set(names);
    }
  }

  async setProjectId(projectId: string) {
    this.#projectId = projectId;

    // Start keep-alive interval
    this.#startKeepAlive();

    // Restore terminal sessions from sync
    const savedSessions = terminalSync.getSessions(projectId);
    if (savedSessions.length > 0) {
      console.log(`[Terminal] Found ${savedSessions.length} saved sessions to restore`);
    }

    // Restore active index
    const savedIndex = terminalSync.getActiveIndex();
    if (savedIndex < this.#terminals.length) {
      this.activeTerminalIndex.set(savedIndex);
    }

    // Attach any pending terminals
    if (this.#pendingTerminals.length > 0) {
      for (const terminal of this.#pendingTerminals) {
        await this.#attachDockerTerminal(terminal);
      }
      this.#pendingTerminals = [];
    }
  }

  #startKeepAlive() {
    // Clear existing interval
    if (this.#keepAliveInterval) {
      clearInterval(this.#keepAliveInterval as NodeJS.Timeout);
    }

    // Reset failure cooldown when starting fresh
    this.#keepAliveFailedAt = 0;

    // Send keep-alive every 5 minutes
    this.#keepAliveInterval = setInterval(async () => {
      if (!this.#projectId) return;

      // Check if container is ready before sending keep-alive
      try {
        const { workbenchStore } = await import('./workbench');
        const containerReady = workbenchStore.containerReady.get();
        if (!containerReady) {
          return;
        }
      } catch {
        return;
      }

      // Skip if still in failure cooldown
      if (this.#keepAliveFailedAt > 0 && Date.now() - this.#keepAliveFailedAt < KEEP_ALIVE_FAILURE_COOLDOWN_MS) {
        return;
      }

      try {
        await dockerPost(`/api/keep-alive/${this.#projectId}`);
        this.#keepAliveFailedAt = 0;
      } catch (error) {
        this.#keepAliveFailedAt = Date.now();
        console.debug(`[Terminal] Keep-alive failed, cooling down for ${KEEP_ALIVE_FAILURE_COOLDOWN_MS / 1000}s`);
      }
    }, 5 * 60 * 1000);
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  flashTerminalHighlight() {
    this.highlightTerminal.set(true);
    setTimeout(() => this.highlightTerminal.set(false), 3000);
  }

  async attachTerminal(terminal: ITerminal, existingTerminalId?: string) {
    try {
      if (this.#projectId) {
        // Check if container is ready before connecting
        const { workbenchStore } = await import('./workbench');
        const containerReady = workbenchStore.containerReady.get();

        if (!containerReady) {
          // Wait for container to be ready
          terminal.write('\x1b[33mWaiting for container to be ready...\x1b[0m\r\n');
          this.#pendingTerminals.push(terminal);

          // PERFORMANCE: Subscribe to containerReady changes and track for cleanup
          const unsubscribe = workbenchStore.containerReady.subscribe((ready) => {
            if (ready && this.#pendingTerminals.includes(terminal)) {
              unsubscribe();
              this.#pendingSubscriptions.delete(terminal);  // Clean up tracking
              this.#pendingTerminals = this.#pendingTerminals.filter(t => t !== terminal);
              terminal.write('\x1b[32mContainer ready! Connecting...\x1b[0m\r\n');
              this.#attachDockerTerminal(terminal, existingTerminalId).catch((err) => {
                terminal.write(coloredText.red('Failed to connect: ' + err.message + '\r\n'));
              });
            }
          });
          // Track subscription for potential cleanup
          this.#pendingSubscriptions.set(terminal, unsubscribe);
          return;
        }

        await this.#attachDockerTerminal(terminal, existingTerminalId);
      } else {
        this.#pendingTerminals.push(terminal);
        terminal.write('\x1b[33mWaiting for project initialization...\x1b[0m\r\n');
      }
    } catch (error: any) {
      console.error('Failed to attach terminal:', error);
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
    }
  }

  async #attachDockerTerminal(terminal: ITerminal, existingTerminalId?: string, customName?: string) {
    // Use coordinated container creation to avoid race conditions
    try {
      // Dynamic import to avoid circular dependency at module load time
      // ensureContainerExists is now the centralized function in workbench.ts
      const { ensureContainerExists } = await import('./workbench');
      const containerReady = await ensureContainerExists(this.#projectId!);
      if (!containerReady) {
        throw new Error('Container creation failed');
      }
    } catch (e: any) {
      terminal.write(coloredText.red('Failed to initialize container: ' + e.message + '\r\n'));
      return;
    }

    // Create new shell process with unique terminal ID (or restore existing)
    const shellProcess = await newShellProcess(terminal, this.#projectId!, existingTerminalId);

    // Generate or retrieve terminal name
    this.#terminalNameCounter++;
    const terminalName = customName ||
      terminalSync.getTerminalName(shellProcess.terminalId) ||
      `Terminal ${this.#terminalNameCounter}`;

    const session: TerminalSession = {
      terminal,
      process: shellProcess,
      terminalId: shellProcess.terminalId,
      isCommandRunning: false,
      name: terminalName,
    };

    // Track command completion
    shellProcess.onCommandComplete(() => {
      session.isCommandRunning = false;
      this.#updateCommandRunningState();
    });

    this.#terminals.push(session);
    this.terminalCount.set(this.#terminals.length);

    // Update terminal names atom
    const currentNames = this.terminalNames.get();
    this.terminalNames.set({ ...currentNames, [shellProcess.terminalId]: terminalName });

    // Save session for persistence
    terminalSync.saveSession(shellProcess.terminalId, this.#projectId!);
    terminalSync.setTerminalName(shellProcess.terminalId, terminalName);

    console.log(`✅ Terminal attached: ${shellProcess.terminalId} (${terminalName}) (total: ${this.#terminals.length})`);
  }

  #updateCommandRunningState() {
    const anyRunning = this.#terminals.some(t => t.isCommandRunning);
    this.commandRunning.set(anyRunning);
  }

  // Get all terminal sessions
  getTerminals(): TerminalSession[] {
    return [...this.#terminals];
  }

  // Get active terminal session
  getActiveTerminal(): TerminalSession | undefined {
    const index = this.activeTerminalIndex.get();
    return this.#terminals[index];
  }

  // Clear the active terminal
  clearActiveTerminal() {
    const session = this.getActiveTerminal();
    if (session) {
      session.process.clear();
    }
  }

  // Kill process in active terminal (send Ctrl+C)
  killActiveProcess() {
    const session = this.getActiveTerminal();
    if (session) {
      session.process.killProcess();
      session.isCommandRunning = false;
      this.#updateCommandRunningState();
    }
  }

  // Send command to active terminal
  async sendCommand(command: string) {
    const session = this.getActiveTerminal();
    if (session) {
      session.isCommandRunning = true;
      this.#updateCommandRunningState();
      await session.process.sendCommand(command);
    }
  }

  // Close a specific terminal
  closeTerminal(index: number) {
    const session = this.#terminals[index];
    if (session) {
      session.process.kill();
      terminalSync.removeSession(session.terminalId);
      terminalSync.removeTerminalName(session.terminalId);

      // Remove from terminal names atom
      const currentNames = this.terminalNames.get();
      const { [session.terminalId]: _, ...remainingNames } = currentNames;
      this.terminalNames.set(remainingNames);

      this.#terminals.splice(index, 1);
      this.terminalCount.set(this.#terminals.length);

      // Adjust active index if needed
      const activeIndex = this.activeTerminalIndex.get();
      if (activeIndex >= this.#terminals.length) {
        this.activeTerminalIndex.set(Math.max(0, this.#terminals.length - 1));
      }
    }
  }

  // Rename a terminal
  renameTerminal(index: number, newName: string) {
    const session = this.#terminals[index];
    if (session) {
      session.name = newName;
      terminalSync.setTerminalName(session.terminalId, newName);

      // Update names atom
      const currentNames = this.terminalNames.get();
      this.terminalNames.set({ ...currentNames, [session.terminalId]: newName });
    }
  }

  // Get terminal info for tabs
  getTerminalTabs(): Array<{ id: string; name: string; isRunning: boolean }> {
    return this.#terminals.map(session => ({
      id: session.terminalId,
      name: session.name,
      isRunning: session.isCommandRunning || false,
    }));
  }

  // Launch a command in the active terminal (for REPL launcher)
  async launchCommand(command: string, newTerminalName?: string) {
    // If a new terminal name is provided, create a new terminal
    if (newTerminalName && this.#terminals.length < 3) {
      // Create new terminal with the given name - this will be done through the UI
      // For now, just send to active terminal
    }

    const session = this.getActiveTerminal();
    if (session) {
      session.isCommandRunning = true;
      this.#updateCommandRunningState();
      await session.process.sendCommand(command);
    }
  }

  // Set active terminal
  setActiveTerminal(index: number) {
    if (index >= 0 && index < this.#terminals.length) {
      this.activeTerminalIndex.set(index);
      terminalSync.setActiveIndex(index);
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      if (process.resize) {
        process.resize({ cols, rows });
      }
    }
  }

  // Cleanup on unmount
  // PERFORMANCE: Properly clean up all subscriptions and intervals to prevent memory leaks
  cleanup() {
    if (this.#keepAliveInterval) {
      clearInterval(this.#keepAliveInterval as NodeJS.Timeout);
      this.#keepAliveInterval = undefined;
    }

    // Clean up pending subscriptions to prevent memory leaks
    for (const unsubscribe of this.#pendingSubscriptions.values()) {
      unsubscribe();
    }
    this.#pendingSubscriptions.clear();
    this.#pendingTerminals = [];

    // Save all terminal states
    for (const session of this.#terminals) {
      if (this.#projectId) {
        terminalSync.saveSession(session.terminalId, this.#projectId);
      }
    }
  }
}
