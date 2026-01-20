/**
 * REPL Manager - Manages interactive REPL sessions within Docker containers
 * Supports Node.js, Python, Ruby, and Go (via gore)
 */

import Docker from 'dockerode';
import { Duplex } from 'stream';

export type ReplLanguage = 'nodejs' | 'python' | 'ruby' | 'go';

export interface ReplLanguageConfig {
  name: string;
  command: string;
  args: string[];
  prompt: RegExp;
  multilinePrompt: RegExp;
  exitCommand: string;
  checkCommand: string; // Command to check if REPL is available
}

export const REPL_CONFIGS: Record<ReplLanguage, ReplLanguageConfig> = {
  nodejs: {
    name: 'Node.js',
    command: 'node',
    args: ['--interactive'],
    prompt: /^> $/m,
    multilinePrompt: /^\.\.\. $/m,
    exitCommand: '.exit',
    checkCommand: 'node --version',
  },
  python: {
    name: 'Python',
    command: 'python3',
    args: ['-u', '-i'], // -u for unbuffered output
    prompt: /^>>> $/m,
    multilinePrompt: /^\.\.\. $/m,
    exitCommand: 'exit()',
    checkCommand: 'python3 --version',
  },
  ruby: {
    name: 'Ruby',
    command: 'irb',
    args: ['--simple-prompt', '--noverbose'],
    prompt: /^>> $/m,
    multilinePrompt: /^\?> $/m,
    exitCommand: 'exit',
    checkCommand: 'ruby --version',
  },
  go: {
    name: 'Go (gore)',
    command: 'gore',
    args: [],
    prompt: /^gore> $/m,
    multilinePrompt: /^\.\.\.\.\. $/m,
    exitCommand: ':quit',
    checkCommand: 'which gore || go version',
  },
};

export interface ReplSession {
  id: string;
  projectId: string;
  language: ReplLanguage;
  containerId: string;
  stream: Duplex;
  execId: string;
  startedAt: number;
  lastActive: number;
  outputBuffer: string;
  isWaitingForPrompt: boolean;
  pendingResolve: ((output: string) => void) | null;
  pendingReject: ((error: Error) => void) | null;
}

class ReplManager {
  private docker: Docker;
  private sessions: Map<string, ReplSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.docker = new Docker();
    this.startCleanupInterval();
  }

  private startCleanupInterval() {
    // Clean up idle sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 5 * 60 * 1000);
  }

  private cleanupIdleSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActive > this.SESSION_TIMEOUT) {
        console.log(`[REPL] Cleaning up idle session: ${sessionId}`);
        this.stopSession(session.projectId, session.language).catch(console.error);
      }
    }
  }

  private getSessionKey(projectId: string, language: ReplLanguage): string {
    return `${projectId}:${language}`;
  }

  /**
   * Check if a REPL language is available in the container
   */
  async checkLanguageAvailable(containerId: string, language: ReplLanguage): Promise<boolean> {
    const config = REPL_CONFIGS[language];
    const container = this.docker.getContainer(containerId);

    try {
      const exec = await container.exec({
        Cmd: ['sh', '-c', config.checkCommand],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({});

      return new Promise((resolve) => {
        let hasOutput = false;
        stream.on('data', () => {
          hasOutput = true;
        });
        stream.on('end', () => {
          resolve(hasOutput);
        });
        stream.on('error', () => {
          resolve(false);
        });
        // Timeout after 5 seconds
        setTimeout(() => resolve(hasOutput), 5000);
      });
    } catch (error) {
      console.error(`[REPL] Error checking ${language} availability:`, error);
      return false;
    }
  }

  /**
   * Start a REPL session
   */
  async startSession(
    projectId: string,
    containerId: string,
    language: ReplLanguage
  ): Promise<{ sessionId: string; welcomeMessage: string }> {
    const sessionKey = this.getSessionKey(projectId, language);

    // Check if session already exists
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      existing.lastActive = Date.now();
      return {
        sessionId: existing.id,
        welcomeMessage: `Reconnected to existing ${REPL_CONFIGS[language].name} session`,
      };
    }

    const config = REPL_CONFIGS[language];
    const container = this.docker.getContainer(containerId);

    // For Go, check if gore is available, fallback to just running .go files
    if (language === 'go') {
      const goreAvailable = await this.checkLanguageAvailable(containerId, 'go');
      if (!goreAvailable) {
        throw new Error(
          'Go REPL (gore) is not available. Install it with: go install github.com/x-motemen/gore/cmd/gore@latest'
        );
      }
    }

    // Create exec instance for interactive REPL
    const exec = await container.exec({
      Cmd: [config.command, ...config.args],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir: '/workspace',
      Env: [
        'TERM=xterm-256color',
        'PYTHONDONTWRITEBYTECODE=1', // Prevent __pycache__ in Python
        'NODE_NO_WARNINGS=1', // Suppress Node.js warnings
      ],
    });

    const stream = await exec.start({ hijack: true, stdin: true }) as Duplex;
    const execInfo = await exec.inspect();

    const sessionId = `repl-${projectId}-${language}-${Date.now()}`;
    const session: ReplSession = {
      id: sessionId,
      projectId,
      language,
      containerId,
      stream,
      execId: execInfo.ID,
      startedAt: Date.now(),
      lastActive: Date.now(),
      outputBuffer: '',
      isWaitingForPrompt: true,
      pendingResolve: null,
      pendingReject: null,
    };

    // Set up stream handlers
    this.setupStreamHandlers(session);

    this.sessions.set(sessionKey, session);
    console.log(`[REPL] Started ${language} session for project ${projectId}`);

    // Wait for initial prompt
    const welcomeMessage = await this.waitForOutput(session, 5000);

    return { sessionId, welcomeMessage };
  }

  private setupStreamHandlers(session: ReplSession) {
    const config = REPL_CONFIGS[session.language];

    session.stream.on('data', (data: Buffer) => {
      const text = data.toString();
      session.outputBuffer += text;
      session.lastActive = Date.now();

      // Check if we have a complete prompt
      if (session.isWaitingForPrompt && session.pendingResolve) {
        // Check for prompt
        if (config.prompt.test(session.outputBuffer) || config.multilinePrompt.test(session.outputBuffer)) {
          const output = session.outputBuffer;
          session.outputBuffer = '';
          session.isWaitingForPrompt = false;
          session.pendingResolve(output);
          session.pendingResolve = null;
          session.pendingReject = null;
        }
      }
    });

    session.stream.on('error', (error: Error) => {
      console.error(`[REPL] Stream error for session ${session.id}:`, error);
      if (session.pendingReject) {
        session.pendingReject(error);
        session.pendingResolve = null;
        session.pendingReject = null;
      }
    });

    session.stream.on('end', () => {
      console.log(`[REPL] Stream ended for session ${session.id}`);
      const sessionKey = this.getSessionKey(session.projectId, session.language);
      this.sessions.delete(sessionKey);
      if (session.pendingReject) {
        session.pendingReject(new Error('REPL session ended'));
        session.pendingResolve = null;
        session.pendingReject = null;
      }
    });
  }

  private waitForOutput(session: ReplSession, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      session.isWaitingForPrompt = true;
      session.pendingResolve = resolve;
      session.pendingReject = reject;

      // Timeout
      setTimeout(() => {
        if (session.pendingResolve) {
          // Return whatever we have
          const output = session.outputBuffer;
          session.outputBuffer = '';
          session.isWaitingForPrompt = false;
          session.pendingResolve(output || '(timeout - no output)');
          session.pendingResolve = null;
          session.pendingReject = null;
        }
      }, timeoutMs);
    });
  }

  /**
   * Execute code in a REPL session
   */
  async executeCode(projectId: string, language: ReplLanguage, code: string): Promise<string> {
    const sessionKey = this.getSessionKey(projectId, language);
    const session = this.sessions.get(sessionKey);

    if (!session) {
      throw new Error(`No active ${REPL_CONFIGS[language].name} session. Start one first.`);
    }

    session.lastActive = Date.now();
    session.outputBuffer = '';

    // Write code to REPL
    session.stream.write(code + '\n');

    // Wait for output
    const output = await this.waitForOutput(session, 30000);

    // Clean up the output (remove the echoed command and prompts)
    return this.cleanOutput(output, code, language);
  }

  private cleanOutput(output: string, input: string, language: ReplLanguage): string {
    const config = REPL_CONFIGS[language];
    let cleaned = output;

    // Remove echoed input
    const inputLines = input.split('\n');
    for (const line of inputLines) {
      cleaned = cleaned.replace(line + '\r\n', '').replace(line + '\n', '');
    }

    // Remove prompts
    cleaned = cleaned.replace(config.prompt, '');
    cleaned = cleaned.replace(config.multilinePrompt, '');

    // Clean up ANSI codes for cleaner display (optional, keep some for color)
    // cleaned = cleaned.replace(/\x1b\[[0-9;]*m/g, '');

    return cleaned.trim();
  }

  /**
   * Stop a REPL session
   */
  async stopSession(projectId: string, language: ReplLanguage): Promise<void> {
    const sessionKey = this.getSessionKey(projectId, language);
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return; // Already stopped
    }

    const config = REPL_CONFIGS[language];

    try {
      // Send exit command gracefully
      session.stream.write(config.exitCommand + '\n');

      // Give it a moment to exit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // End the stream
      session.stream.end();
    } catch (error) {
      console.error(`[REPL] Error stopping session ${session.id}:`, error);
    }

    this.sessions.delete(sessionKey);
    console.log(`[REPL] Stopped ${language} session for project ${projectId}`);
  }

  /**
   * Get session status
   */
  getSession(projectId: string, language: ReplLanguage): ReplSession | undefined {
    const sessionKey = this.getSessionKey(projectId, language);
    return this.sessions.get(sessionKey);
  }

  /**
   * Get all active sessions for a project
   */
  getProjectSessions(projectId: string): ReplSession[] {
    const sessions: ReplSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * Stop all sessions for a project
   */
  async stopProjectSessions(projectId: string): Promise<void> {
    const sessions = this.getProjectSessions(projectId);
    for (const session of sessions) {
      await this.stopSession(projectId, session.language);
    }
  }

  /**
   * Get available languages for a container
   */
  async getAvailableLanguages(containerId: string): Promise<ReplLanguage[]> {
    const available: ReplLanguage[] = [];

    // Check each language in parallel
    const checks = await Promise.all(
      (Object.keys(REPL_CONFIGS) as ReplLanguage[]).map(async (lang) => {
        const isAvailable = await this.checkLanguageAvailable(containerId, lang);
        return { lang, isAvailable };
      })
    );

    for (const { lang, isAvailable } of checks) {
      if (isAvailable) {
        available.push(lang);
      }
    }

    return available;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Stop all sessions
    for (const session of this.sessions.values()) {
      await this.stopSession(session.projectId, session.language);
    }
  }
}

// Export singleton instance
export const replManager = new ReplManager();
