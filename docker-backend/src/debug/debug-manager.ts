/**
 * Debug Session Manager
 *
 * Manages debug sessions for projects, including:
 * - Starting/stopping debug adapters per language
 * - Managing breakpoints across files
 * - WebSocket communication with frontend
 * - Session state and cleanup
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess, exec } from 'child_process';
import Docker from 'dockerode';
import { v4 as uuid } from 'uuid';
import {
  DAPClient,
  DebugLanguage,
  DebugConfig,
  DEBUG_ADAPTER_CONFIGS,
  Breakpoint,
  SourceBreakpoint,
  Source,
  StackFrame,
  Scope,
  Variable,
  Thread,
  Capabilities,
} from './dap-client.js';
import { createError, ErrorCode } from '../errors/index.js';

// ==================== Types ====================

export interface DebugSession {
  id: string;
  projectId: string;
  containerId: string;
  language: DebugLanguage;
  client: DAPClient;
  process?: ChildProcess;
  port: number;
  state: DebugSessionState;
  config: DebugConfig;
  breakpoints: Map<string, FileBreakpoints>;
  createdAt: Date;
  lastActivity: Date;
}

export interface FileBreakpoints {
  path: string;
  breakpoints: SourceBreakpoint[];
  verified: Breakpoint[];
}

export type DebugSessionState =
  | 'initializing'
  | 'configured'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'terminated';

export interface DebugEvent {
  type: 'stopped' | 'continued' | 'exited' | 'terminated' | 'thread' | 'output' | 'breakpoint' | 'module' | 'loadedSource' | 'process' | 'capabilities' | 'progressStart' | 'progressUpdate' | 'progressEnd' | 'invalidated' | 'memory';
  sessionId: string;
  body: Record<string, unknown>;
}

// ==================== Debug Manager ====================

class DebugManager extends EventEmitter {
  private docker: Docker;
  private sessions: Map<string, DebugSession> = new Map();
  private sessionsByProject: Map<string, Set<string>> = new Map();
  private portPool: Set<number> = new Set();
  private nextPort = 10000;
  private readonly maxPort = 10999;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  constructor() {
    super();
    this.docker = new Docker();
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 60000); // Check every minute
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      const inactive = now - session.lastActivity.getTime();
      if (inactive > this.sessionTimeout) {
        console.log(`[DebugManager] Cleaning up stale session ${sessionId}`);
        this.terminateSession(sessionId).catch(err => {
          console.warn(`[DebugManager] Failed to cleanup stale session ${sessionId}: ${err.message}`);
        });
      }
    }
  }

  private allocatePort(): number {
    for (let port = this.nextPort; port <= this.maxPort; port++) {
      if (!this.portPool.has(port)) {
        this.portPool.add(port);
        this.nextPort = port + 1;
        if (this.nextPort > this.maxPort) {
          this.nextPort = 10000;
        }
        return port;
      }
    }
    throw createError(ErrorCode.RESOURCE_EXHAUSTED, 'No available ports for debug session');
  }

  private releasePort(port: number): void {
    this.portPool.delete(port);
  }

  /**
   * Start a debug session for a project
   */
  async startSession(
    projectId: string,
    containerId: string,
    config: DebugConfig
  ): Promise<DebugSession> {
    const sessionId = uuid();
    const port = this.allocatePort();

    console.log(`[DebugManager] Starting debug session ${sessionId} for project ${projectId}`);

    // Create DAP client
    const client = new DAPClient(config.language);

    // Set up event forwarding
    this.setupClientEvents(sessionId, client);

    // Create session
    const session: DebugSession = {
      id: sessionId,
      projectId,
      containerId,
      language: config.language,
      client,
      port,
      state: 'initializing',
      config,
      breakpoints: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Track by project
    if (!this.sessionsByProject.has(projectId)) {
      this.sessionsByProject.set(projectId, new Set());
    }
    this.sessionsByProject.get(projectId)!.add(sessionId);

    try {
      // Start debug adapter in container
      await this.startDebugAdapter(session);

      // Initialize DAP connection
      await this.initializeSession(session);

      return session;
    } catch (err) {
      // Cleanup on failure
      await this.terminateSession(sessionId);
      throw err;
    }
  }

  private setupClientEvents(sessionId: string, client: DAPClient): void {
    client.on('event', (event) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivity = new Date();
      }

      const debugEvent: DebugEvent = {
        type: event.event as DebugEvent['type'],
        sessionId,
        body: event.body || {},
      };
      this.emit('debugEvent', debugEvent);
    });

    client.on('stopped', (body) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.state = 'paused';
      }
    });

    client.on('continued', () => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.state = 'running';
      }
    });

    client.on('terminated', () => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.state = 'terminated';
      }
    });

    client.on('error', (err) => {
      console.error(`[DebugSession ${sessionId}] Error:`, err);
    });
  }

  private async startDebugAdapter(session: DebugSession): Promise<void> {
    const { language, config, port, containerId } = session;
    const adapterConfig = DEBUG_ADAPTER_CONFIGS[language];

    let command: string;
    let args: string[];

    switch (language) {
      case 'javascript':
      case 'typescript':
        // Node.js with inspector
        command = 'node';
        args = [`--inspect-brk=0.0.0.0:${port}`];
        if (language === 'typescript') {
          args.push('-r', 'ts-node/register');
        }
        args.push(config.program);
        if (config.args) {
          args.push(...config.args);
        }
        break;

      case 'python':
        // Python with debugpy
        command = 'python3';
        args = [
          '-m', 'debugpy',
          '--listen', `0.0.0.0:${port}`,
          '--wait-for-client',
        ];
        if (config.stopOnEntry) {
          args.push('--stop-on-entry');
        }
        args.push(config.program);
        if (config.args) {
          args.push(...config.args);
        }
        break;

      case 'go':
        // Go with Delve
        command = 'dlv';
        args = [
          'debug',
          '--headless',
          `--listen=:${port}`,
          '--api-version=2',
          '--accept-multiclient',
        ];
        args.push('--', config.program);
        if (config.args) {
          args.push(...config.args);
        }
        break;

      case 'rust':
        // Rust with lldb-vscode (CodeLLDB)
        // First compile with debug symbols
        await this.execInContainer(containerId, ['cargo', 'build']);
        command = 'lldb-vscode';
        args = [];
        break;

      default:
        throw createError(ErrorCode.VALIDATION_ERROR, `Unsupported debug language: ${language}`);
    }

    // Execute debug command in container
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: [command, ...args],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      WorkingDir: config.cwd || '/workspace',
      Env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : undefined,
    });

    // Start the exec and capture output
    const stream = await exec.start({ hijack: true, stdin: true });

    // Wait for debug adapter to be ready
    await this.waitForDebugAdapter(session, stream);
  }

  private async waitForDebugAdapter(session: DebugSession, stream: NodeJS.ReadableStream): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(createError(ErrorCode.TIMEOUT, 'Debug adapter failed to start within timeout'));
      }, 30000);

      let output = '';

      const checkReady = () => {
        switch (session.language) {
          case 'javascript':
          case 'typescript':
            return output.includes('Debugger listening on');
          case 'python':
            return output.includes('Debugpy') || output.includes('Waiting for debugger');
          case 'go':
            return output.includes('API server listening');
          default:
            return true;
        }
      };

      stream.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log(`[Debug ${session.id}] ${chunk}`);

        if (checkReady()) {
          clearTimeout(timeout);
          resolve();
        }
      });

      stream.on('error', (err) => {
        clearTimeout(timeout);
        reject(createError(ErrorCode.SPAWN_ERROR, `Debug adapter error: ${err.message}`));
      });
    });
  }

  private async initializeSession(session: DebugSession): Promise<void> {
    const { client, language, config, port, containerId } = session;

    // Get container IP
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    const containerIP = info.NetworkSettings.IPAddress || '127.0.0.1';

    // Connect to debug adapter
    await client.connect(containerIP, port);

    // Initialize DAP session
    const capabilities = await client.initialize({
      adapterID: language,
    });

    console.log(`[DebugManager] Session ${session.id} initialized with capabilities:`, Object.keys(capabilities));

    // Attach to the running process
    if (language === 'javascript' || language === 'typescript') {
      await client.attach({
        port,
        host: containerIP,
      });
    } else if (language === 'python') {
      await client.attach({
        host: containerIP,
        port,
      });
    } else if (language === 'go') {
      await client.attach({
        host: containerIP,
        port,
        mode: 'remote',
      });
    } else if (language === 'rust') {
      await client.launch({
        program: config.program,
        args: config.args,
        cwd: config.cwd,
        stopOnEntry: config.stopOnEntry,
      });
    }

    // Configuration done
    await client.configurationDone();

    session.state = 'configured';
  }

  private async execInContainer(containerId: string, cmd: string[]): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: false });
    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (data: Buffer) => {
        output += data.toString();
      });
      stream.on('end', () => resolve(output));
      stream.on('error', reject);
    });
  }

  /**
   * Terminate a debug session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    console.log(`[DebugManager] Terminating session ${sessionId}`);

    try {
      if (session.client.isConnected) {
        await session.client.disconnect();
      }
    } catch (err) {
      // Ignore disconnect errors
    }

    session.client.destroy();
    this.releasePort(session.port);

    // Remove from tracking
    this.sessions.delete(sessionId);
    const projectSessions = this.sessionsByProject.get(session.projectId);
    if (projectSessions) {
      projectSessions.delete(sessionId);
      if (projectSessions.size === 0) {
        this.sessionsByProject.delete(session.projectId);
      }
    }

    this.emit('sessionTerminated', sessionId);
  }

  /**
   * Terminate all sessions for a project
   */
  async terminateProjectSessions(projectId: string): Promise<void> {
    const sessions = this.sessionsByProject.get(projectId);
    if (!sessions) return;

    const promises = Array.from(sessions).map(sessionId =>
      this.terminateSession(sessionId)
    );
    await Promise.all(promises);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a project
   */
  getProjectSessions(projectId: string): DebugSession[] {
    const sessionIds = this.sessionsByProject.get(projectId);
    if (!sessionIds) return [];
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is DebugSession => s !== undefined);
  }

  // ==================== Debug Operations ====================

  /**
   * Set breakpoints for a file
   */
  async setBreakpoints(sessionId: string, filePath: string, breakpoints: SourceBreakpoint[]): Promise<Breakpoint[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    const source: Source = {
      path: filePath,
      name: filePath.split('/').pop(),
    };

    const verified = await session.client.setBreakpoints(source, breakpoints);

    // Store breakpoints
    session.breakpoints.set(filePath, {
      path: filePath,
      breakpoints,
      verified,
    });

    return verified;
  }

  /**
   * Clear all breakpoints for a file
   */
  async clearBreakpoints(sessionId: string, filePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    const source: Source = {
      path: filePath,
      name: filePath.split('/').pop(),
    };

    await session.client.setBreakpoints(source, []);
    session.breakpoints.delete(filePath);
  }

  /**
   * Continue execution
   */
  async continue(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    // Get first thread if not specified
    if (threadId === undefined) {
      const threads = await session.client.threads();
      if (threads.length === 0) {
        throw createError(ErrorCode.DAP_ERROR, 'No threads available');
      }
      threadId = threads[0].id;
    }

    await session.client.continue(threadId);
    session.state = 'running';
  }

  /**
   * Step over (next)
   */
  async stepOver(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    if (threadId === undefined) {
      const threads = await session.client.threads();
      threadId = threads[0]?.id ?? 1;
    }

    await session.client.next(threadId);
  }

  /**
   * Step into
   */
  async stepInto(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    if (threadId === undefined) {
      const threads = await session.client.threads();
      threadId = threads[0]?.id ?? 1;
    }

    await session.client.stepIn(threadId);
  }

  /**
   * Step out
   */
  async stepOut(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    if (threadId === undefined) {
      const threads = await session.client.threads();
      threadId = threads[0]?.id ?? 1;
    }

    await session.client.stepOut(threadId);
  }

  /**
   * Pause execution
   */
  async pause(sessionId: string, threadId?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();

    if (threadId === undefined) {
      const threads = await session.client.threads();
      threadId = threads[0]?.id ?? 1;
    }

    await session.client.pause(threadId);
    session.state = 'paused';
  }

  /**
   * Restart debug session
   */
  async restart(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    await session.client.restart();
    session.state = 'running';
  }

  /**
   * Get threads
   */
  async getThreads(sessionId: string): Promise<Thread[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    return session.client.threads();
  }

  /**
   * Get stack trace
   */
  async getStackTrace(sessionId: string, threadId: number): Promise<StackFrame[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    const result = await session.client.stackTrace(threadId);
    return result.stackFrames;
  }

  /**
   * Get scopes for a stack frame
   */
  async getScopes(sessionId: string, frameId: number): Promise<Scope[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    return session.client.scopes(frameId);
  }

  /**
   * Get variables
   */
  async getVariables(sessionId: string, variablesReference: number): Promise<Variable[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    return session.client.variables(variablesReference);
  }

  /**
   * Evaluate expression
   */
  async evaluate(sessionId: string, expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover'): Promise<{ result: string; type?: string; variablesReference: number }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    return session.client.evaluate(expression, frameId, context);
  }

  /**
   * Set variable value
   */
  async setVariable(sessionId: string, variablesReference: number, name: string, value: string): Promise<{ value: string; type?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    session.lastActivity = new Date();
    return session.client.setVariable(variablesReference, name, value);
  }

  /**
   * Get session capabilities
   */
  getCapabilities(sessionId: string): Capabilities {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw createError(ErrorCode.NOT_FOUND, `Debug session ${sessionId} not found`);
    }

    return session.client.getCapabilities();
  }

  /**
   * Get debug manager stats
   */
  getStats(): { activeSessions: number; sessionsByLanguage: Record<string, number>; portPoolSize: number } {
    const sessionsByLanguage: Record<string, number> = {};
    for (const session of this.sessions.values()) {
      sessionsByLanguage[session.language] = (sessionsByLanguage[session.language] || 0) + 1;
    }

    return {
      activeSessions: this.sessions.size,
      sessionsByLanguage,
      portPoolSize: this.portPool.size,
    };
  }

  /**
   * Cleanup all sessions
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    const promises = Array.from(this.sessions.keys()).map(sessionId =>
      this.terminateSession(sessionId)
    );
    await Promise.all(promises);
  }
}

// Export singleton instance
export const debugManager = new DebugManager();
