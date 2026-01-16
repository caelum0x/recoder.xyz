import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newShellProcess, type ShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';
import { terminalSync } from '~/lib/terminal-sync';
// NOTE: ensureContainerExists is imported dynamically to avoid circular dependency
// terminal.ts -> useChatHistory.ts -> workbench.ts -> terminal.ts

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';

interface TerminalSession {
  terminal: ITerminal;
  process: ShellProcess;
  terminalId: string;
  isCommandRunning?: boolean;
}

export class TerminalStore {
  #terminals: TerminalSession[] = [];
  #projectId: string | null = null;
  #pendingTerminals: ITerminal[] = [];
  #keepAliveInterval?: NodeJS.Timer;

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);
  highlightTerminal: WritableAtom<boolean> = import.meta.hot?.data.highlightTerminal ?? atom(false);
  activeTerminalIndex: WritableAtom<number> = import.meta.hot?.data.activeTerminalIndex ?? atom(0);
  terminalCount: WritableAtom<number> = import.meta.hot?.data.terminalCount ?? atom(0);
  commandRunning: WritableAtom<boolean> = import.meta.hot?.data.commandRunning ?? atom(false);

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
      import.meta.hot.data.highlightTerminal = this.highlightTerminal;
      import.meta.hot.data.activeTerminalIndex = this.activeTerminalIndex;
      import.meta.hot.data.terminalCount = this.terminalCount;
      import.meta.hot.data.commandRunning = this.commandRunning;
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

    // Send keep-alive every 5 minutes
    this.#keepAliveInterval = setInterval(async () => {
      if (this.#projectId) {
        try {
          await fetch(`${DOCKER_URL}/api/keep-alive/${this.#projectId}`, {
            method: 'POST',
          });
          console.log('[Terminal] Keep-alive sent');
        } catch (error) {
          console.warn('[Terminal] Keep-alive failed:', error);
        }
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

          // Subscribe to containerReady changes
          const unsubscribe = workbenchStore.containerReady.subscribe((ready) => {
            if (ready && this.#pendingTerminals.includes(terminal)) {
              unsubscribe();
              this.#pendingTerminals = this.#pendingTerminals.filter(t => t !== terminal);
              terminal.write('\x1b[32mContainer ready! Connecting...\x1b[0m\r\n');
              this.#attachDockerTerminal(terminal, existingTerminalId).catch((err) => {
                terminal.write(coloredText.red('Failed to connect: ' + err.message + '\r\n'));
              });
            }
          });
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

  async #attachDockerTerminal(terminal: ITerminal, existingTerminalId?: string) {
    // Use coordinated container creation to avoid race conditions
    try {
      // Dynamic import to avoid circular dependency
      const { ensureContainerExists } = await import('~/lib/persistence/useChatHistory');
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
    const session: TerminalSession = {
      terminal,
      process: shellProcess,
      terminalId: shellProcess.terminalId,
      isCommandRunning: false,
    };

    // Track command completion
    shellProcess.onCommandComplete(() => {
      session.isCommandRunning = false;
      this.#updateCommandRunningState();
    });
    
    this.#terminals.push(session);
    this.terminalCount.set(this.#terminals.length);

    // Save session for persistence
    terminalSync.saveSession(shellProcess.terminalId, this.#projectId!);
    
    console.log(`✅ Terminal attached: ${shellProcess.terminalId} (total: ${this.#terminals.length})`);
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
      this.#terminals.splice(index, 1);
      this.terminalCount.set(this.#terminals.length);
      
      // Adjust active index if needed
      const activeIndex = this.activeTerminalIndex.get();
      if (activeIndex >= this.#terminals.length) {
        this.activeTerminalIndex.set(Math.max(0, this.#terminals.length - 1));
      }
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
  cleanup() {
    if (this.#keepAliveInterval) {
      clearInterval(this.#keepAliveInterval as NodeJS.Timeout);
    }
    
    // Save all terminal states
    for (const session of this.#terminals) {
      if (this.#projectId) {
        terminalSync.saveSession(session.terminalId, this.#projectId);
      }
    }
  }
}
