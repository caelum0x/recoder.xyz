import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

// Docker backend URL from environment
const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || null;

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: any }> = [];
  #globalPackagesInstalled: boolean = false;
  #projectId: string | null = null;
  #useDocker: boolean = false;
  #dockerChecked: boolean = false;
  #pendingTerminals: ITerminal[] = []; // Terminals waiting for Docker

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);
  highlightTerminal: WritableAtom<boolean> = import.meta.hot?.data.highlightTerminal ?? atom(false);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
      import.meta.hot.data.highlightTerminal = this.highlightTerminal;
    }
  }

  async #checkDockerAvailability(): Promise<boolean> {
    if (!DOCKER_URL) {
      console.log('🐳 [TerminalStore] No DOCKER_URL configured');
      return false;
    }

    try {
      console.log('🐳 [TerminalStore] Checking Docker at:', DOCKER_URL);
      const res = await fetch(`${DOCKER_URL}/health`, { signal: AbortSignal.timeout(3000) });
      this.#useDocker = res.ok;
      this.#dockerChecked = true;
      console.log('🐳 [TerminalStore] Docker available:', this.#useDocker);
      return this.#useDocker;
    } catch (e) {
      console.log('🐳 [TerminalStore] Docker check failed:', e);
      this.#useDocker = false;
      this.#dockerChecked = true;
      return false;
    }
  }

  async setProjectId(projectId: string) {
    this.#projectId = projectId;
    console.log('🐳 [TerminalStore] Project ID set:', projectId);
    
    // Check Docker availability now that we have projectId
    if (DOCKER_URL && !this.#dockerChecked) {
      await this.#checkDockerAvailability();
    }

    // Re-attach any pending terminals now that we have projectId
    if (this.#pendingTerminals.length > 0 && this.#useDocker) {
      console.log('🐳 [TerminalStore] Re-attaching', this.#pendingTerminals.length, 'pending terminals with Docker');
      for (const terminal of this.#pendingTerminals) {
        await this.#attachDockerTerminal(terminal);
      }
      this.#pendingTerminals = [];
    }
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  flashTerminalHighlight() {
    this.highlightTerminal.set(true);
    setTimeout(() => {
      this.highlightTerminal.set(false);
    }, 3000);
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      console.log('🐳 [TerminalStore] attachTerminal called, projectId:', this.#projectId, 'useDocker:', this.#useDocker, 'dockerChecked:', this.#dockerChecked);
      
      // Check Docker if not checked yet
      if (DOCKER_URL && !this.#dockerChecked) {
        await this.#checkDockerAvailability();
      }

      // Use Docker if available and projectId is set
      if (this.#useDocker && this.#projectId && DOCKER_URL) {
        console.log('🐳 [TerminalStore] Using Docker terminal');
        await this.#attachDockerTerminal(terminal);
      } else if (this.#useDocker && !this.#projectId && DOCKER_URL) {
        // Docker available but no projectId yet - queue terminal
        console.log('🐳 [TerminalStore] Docker available but no projectId - queueing terminal');
        this.#pendingTerminals.push(terminal);
        terminal.write('\x1b[33mWaiting for project initialization...\x1b[0m\r\n');
      } else {
        console.log('🐳 [TerminalStore] Using WebContainer terminal (projectId:', this.#projectId, 'useDocker:', this.#useDocker, ')');
        await this.#attachWebContainerTerminal(terminal);
      }
    } catch (error: any) {
      console.error('🐳 [TerminalStore] Failed to attach terminal:', error);
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
    }
  }

  async #attachDockerTerminal(terminal: ITerminal) {
    console.log('🐳 [TerminalStore] Creating Docker container for:', this.#projectId);
    
    // Initialize container first
    try {
      const res = await fetch(`${DOCKER_URL}/api/container`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.#projectId }),
      });
      
      if (!res.ok) {
        const err = await res.text();
        console.error('🐳 [TerminalStore] Container creation failed:', err);
        throw new Error('Failed to create Docker container: ' + err);
      }
      
      const data = await res.json();
      console.log('🐳 [TerminalStore] Container created:', data);
    } catch (e: any) {
      console.error('🐳 [TerminalStore] Container init error:', e);
      terminal.write(coloredText.red('Failed to initialize container: ' + e.message + '\r\n'));
      return;
    }

    // Now connect WebSocket terminal
    const shellProcess = await newShellProcess(
      await this.#webcontainer,
      terminal,
      this.#projectId!
    );

    this.#terminals.push({ terminal, process: shellProcess });
    console.log('🐳 [TerminalStore] Docker terminal attached successfully');
  }

  async #attachWebContainerTerminal(terminal: ITerminal) {
    const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
    this.#terminals.push({ terminal, process: shellProcess });
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      if (process.resize) {
        process.resize({ cols, rows });
      }
    }
  }

  isUsingDocker(): boolean {
    return this.#useDocker;
  }
}
