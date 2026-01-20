/**
 * Debug Adapter Protocol (DAP) Client
 *
 * Implements the DAP specification for communicating with debug adapters.
 * Supports Node.js (node-debug2), Python (debugpy), Go (delve), and Rust (lldb-vscode).
 *
 * @see https://microsoft.github.io/debug-adapter-protocol/
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import { createError, ErrorCode } from '../errors/index.js';

// ==================== DAP Protocol Types ====================

export interface DAPRequest {
  seq: number;
  type: 'request';
  command: string;
  arguments?: Record<string, unknown>;
}

export interface DAPResponse {
  seq: number;
  type: 'response';
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: Record<string, unknown>;
}

export interface DAPEvent {
  seq: number;
  type: 'event';
  event: string;
  body?: Record<string, unknown>;
}

export type DAPMessage = DAPRequest | DAPResponse | DAPEvent;

// ==================== DAP Capability Types ====================

export interface Capabilities {
  supportsConfigurationDoneRequest?: boolean;
  supportsFunctionBreakpoints?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsHitConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  exceptionBreakpointFilters?: ExceptionBreakpointFilter[];
  supportsStepBack?: boolean;
  supportsSetVariable?: boolean;
  supportsRestartFrame?: boolean;
  supportsGotoTargetsRequest?: boolean;
  supportsStepInTargetsRequest?: boolean;
  supportsCompletionsRequest?: boolean;
  completionTriggerCharacters?: string[];
  supportsModulesRequest?: boolean;
  additionalModuleColumns?: ColumnDescriptor[];
  supportedChecksumAlgorithms?: ChecksumAlgorithm[];
  supportsRestartRequest?: boolean;
  supportsExceptionOptions?: boolean;
  supportsValueFormattingOptions?: boolean;
  supportsExceptionInfoRequest?: boolean;
  supportTerminateDebuggee?: boolean;
  supportSuspendDebuggee?: boolean;
  supportsDelayedStackTraceLoading?: boolean;
  supportsLoadedSourcesRequest?: boolean;
  supportsLogPoints?: boolean;
  supportsTerminateThreadsRequest?: boolean;
  supportsSetExpression?: boolean;
  supportsTerminateRequest?: boolean;
  supportsDataBreakpoints?: boolean;
  supportsReadMemoryRequest?: boolean;
  supportsWriteMemoryRequest?: boolean;
  supportsDisassembleRequest?: boolean;
  supportsCancelRequest?: boolean;
  supportsBreakpointLocationsRequest?: boolean;
  supportsClipboardContext?: boolean;
  supportsSteppingGranularity?: boolean;
  supportsInstructionBreakpoints?: boolean;
  supportsExceptionFilterOptions?: boolean;
  supportsSingleThreadExecutionRequests?: boolean;
}

export interface ExceptionBreakpointFilter {
  filter: string;
  label: string;
  description?: string;
  default?: boolean;
  supportsCondition?: boolean;
  conditionDescription?: string;
}

export interface ColumnDescriptor {
  attributeName: string;
  label: string;
  format?: string;
  type?: 'string' | 'number' | 'boolean' | 'unixTimestampUTC';
  width?: number;
}

export type ChecksumAlgorithm = 'MD5' | 'SHA1' | 'SHA256' | 'timestamp';

// ==================== Breakpoint Types ====================

export interface SourceBreakpoint {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface Breakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  instructionReference?: string;
  offset?: number;
}

export interface Source {
  name?: string;
  path?: string;
  sourceReference?: number;
  presentationHint?: 'normal' | 'emphasize' | 'deemphasize';
  origin?: string;
  sources?: Source[];
  adapterData?: unknown;
  checksums?: Checksum[];
}

export interface Checksum {
  algorithm: ChecksumAlgorithm;
  checksum: string;
}

// ==================== Stack Frame Types ====================

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  canRestart?: boolean;
  instructionPointerReference?: string;
  moduleId?: number | string;
  presentationHint?: 'normal' | 'label' | 'subtle';
}

export interface Thread {
  id: number;
  name: string;
}

// ==================== Variable Types ====================

export interface Scope {
  name: string;
  presentationHint?: 'arguments' | 'locals' | 'registers' | string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  presentationHint?: VariablePresentationHint;
  evaluateName?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
}

export interface VariablePresentationHint {
  kind?: 'property' | 'method' | 'class' | 'data' | 'event' | 'baseClass' | 'innerClass' | 'interface' | 'mostDerivedClass' | 'virtual' | 'dataBreakpoint' | string;
  attributes?: ('static' | 'constant' | 'readOnly' | 'rawString' | 'hasObjectId' | 'canHaveObjectId' | 'hasSideEffects' | 'hasDataBreakpoint' | string)[];
  visibility?: 'public' | 'private' | 'protected' | 'internal' | 'final' | string;
  lazy?: boolean;
}

// ==================== Debug Adapter Configuration ====================

export type DebugLanguage = 'javascript' | 'typescript' | 'python' | 'go' | 'rust';

export interface DebugConfig {
  language: DebugLanguage;
  program: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  port?: number;
}

export interface DebugAdapterConfig {
  language: DebugLanguage;
  command: string;
  args: string[];
  launchType: 'launch' | 'attach';
  defaultPort?: number;
}

// Debug adapter configurations per language
export const DEBUG_ADAPTER_CONFIGS: Record<DebugLanguage, DebugAdapterConfig> = {
  javascript: {
    language: 'javascript',
    command: 'node',
    args: ['--inspect-brk=0'],
    launchType: 'attach',
    defaultPort: 9229,
  },
  typescript: {
    language: 'typescript',
    command: 'node',
    args: ['--inspect-brk=0', '-r', 'ts-node/register'],
    launchType: 'attach',
    defaultPort: 9229,
  },
  python: {
    language: 'python',
    command: 'python3',
    args: ['-m', 'debugpy', '--listen', '0.0.0.0:5678', '--wait-for-client'],
    launchType: 'attach',
    defaultPort: 5678,
  },
  go: {
    language: 'go',
    command: 'dlv',
    args: ['debug', '--headless', '--listen=:2345', '--api-version=2', '--accept-multiclient'],
    launchType: 'attach',
    defaultPort: 2345,
  },
  rust: {
    language: 'rust',
    command: 'lldb-vscode',
    args: [],
    launchType: 'launch',
    defaultPort: 0,
  },
};

// ==================== DAP Client Implementation ====================

export class DAPClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private process: ChildProcess | null = null;
  private buffer = '';
  private seq = 1;
  private pendingRequests: Map<number, { resolve: (response: DAPResponse) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private capabilities: Capabilities = {};
  private connected = false;
  private initialized = false;

  readonly language: DebugLanguage;
  readonly config: DebugAdapterConfig;

  constructor(language: DebugLanguage) {
    super();
    this.language = language;
    this.config = DEBUG_ADAPTER_CONFIGS[language];
    if (!this.config) {
      throw createError(ErrorCode.VALIDATION_ERROR, `Unsupported debug language: ${language}`);
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  getCapabilities(): Capabilities {
    return { ...this.capabilities };
  }

  // Connect to a debug adapter via TCP
  async connect(host: string, port: number, timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeoutId = setTimeout(() => {
        socket.destroy();
        reject(createError(ErrorCode.TIMEOUT, `Connection to debug adapter timed out after ${timeout}ms`));
      }, timeout);

      socket.on('connect', () => {
        clearTimeout(timeoutId);
        this.socket = socket;
        this.connected = true;
        this.setupSocketHandlers();
        console.log(`[DAP] Connected to debug adapter at ${host}:${port}`);
        resolve();
      });

      socket.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(createError(ErrorCode.CONNECTION_ERROR, `Failed to connect to debug adapter: ${err.message}`));
      });

      socket.connect(port, host);
    });
  }

  // Start debug adapter as a child process
  async spawn(cwd: string, env?: Record<string, string>): Promise<void> {
    const { command, args } = this.config;

    return new Promise((resolve, reject) => {
      try {
        const processEnv = { ...process.env, ...env };
        this.process = spawn(command, args, {
          cwd,
          env: processEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.on('error', (err) => {
          reject(createError(ErrorCode.SPAWN_ERROR, `Failed to spawn debug adapter: ${err.message}`));
        });

        this.process.on('exit', (code) => {
          console.log(`[DAP] Debug adapter process exited with code ${code}`);
          this.cleanup();
        });

        if (this.process.stdout) {
          this.process.stdout.on('data', (data) => {
            this.handleData(data.toString());
          });
        }

        if (this.process.stderr) {
          this.process.stderr.on('data', (data) => {
            console.error(`[DAP stderr] ${data.toString()}`);
            // Extract port from stderr for Node.js inspector
            const portMatch = data.toString().match(/Debugger listening on ws:\/\/.*:(\d+)/);
            if (portMatch) {
              this.emit('inspectorReady', parseInt(portMatch[1], 10));
            }
          });
        }

        this.connected = true;
        resolve();
      } catch (err: any) {
        reject(createError(ErrorCode.SPAWN_ERROR, err.message));
      }
    });
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('data', (data) => {
      this.handleData(data.toString());
    });

    this.socket.on('close', () => {
      console.log('[DAP] Socket closed');
      this.cleanup();
    });

    this.socket.on('error', (err) => {
      console.error(`[DAP] Socket error: ${err.message}`);
      this.emit('error', err);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    // DAP uses Content-Length headers similar to LSP
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        console.error('[DAP] Missing Content-Length header');
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) break;

      const content = this.buffer.slice(messageStart, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message = JSON.parse(content) as DAPMessage;
        this.handleMessage(message);
      } catch (err) {
        console.error('[DAP] Failed to parse message:', err);
      }
    }
  }

  private handleMessage(message: DAPMessage): void {
    switch (message.type) {
      case 'response':
        this.handleResponse(message);
        break;
      case 'event':
        this.handleEvent(message);
        break;
      case 'request':
        this.handleReverseRequest(message);
        break;
    }
  }

  private handleResponse(response: DAPResponse): void {
    const pending = this.pendingRequests.get(response.request_seq);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.request_seq);

      if (response.success) {
        pending.resolve(response);
      } else {
        pending.reject(createError(ErrorCode.DAP_ERROR, response.message || 'DAP request failed'));
      }
    }
  }

  private handleEvent(event: DAPEvent): void {
    console.log(`[DAP] Event: ${event.event}`, event.body);
    this.emit('event', event);
    this.emit(event.event, event.body);

    // Handle specific events
    switch (event.event) {
      case 'initialized':
        this.initialized = true;
        break;
      case 'terminated':
        this.cleanup();
        break;
      case 'exited':
        this.cleanup();
        break;
    }
  }

  private handleReverseRequest(request: DAPRequest): void {
    // Handle reverse requests from the debug adapter
    console.log(`[DAP] Reverse request: ${request.command}`, request.arguments);
    this.emit('reverseRequest', request);
  }

  // Send a DAP request
  async sendRequest<T = Record<string, unknown>>(command: string, args?: Record<string, unknown>, timeout = 10000): Promise<T> {
    const seq = this.seq++;
    const request: DAPRequest = {
      seq,
      type: 'request',
      command,
      arguments: args,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(seq);
        reject(createError(ErrorCode.TIMEOUT, `DAP request '${command}' timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(seq, {
        resolve: (response) => resolve(response.body as T),
        reject,
        timeout: timeoutId,
      });

      this.send(request);
    });
  }

  private send(message: DAPMessage): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
    const data = header + content;

    if (this.socket) {
      this.socket.write(data);
    } else if (this.process?.stdin) {
      this.process.stdin.write(data);
    } else {
      throw createError(ErrorCode.CONNECTION_ERROR, 'No connection to debug adapter');
    }
  }

  // ==================== DAP Protocol Methods ====================

  async initialize(args?: Partial<InitializeRequestArguments>): Promise<Capabilities> {
    const response = await this.sendRequest<Capabilities>('initialize', {
      clientID: 'recoder',
      clientName: 'Recoder.xyz',
      adapterID: this.language,
      locale: 'en-US',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: true,
      supportsMemoryReferences: true,
      supportsProgressReporting: true,
      supportsInvalidatedEvent: true,
      supportsMemoryEvent: true,
      supportsArgsCanBeInterpretedByShell: true,
      ...args,
    });
    this.capabilities = response;
    return response;
  }

  async configurationDone(): Promise<void> {
    await this.sendRequest('configurationDone');
  }

  async launch(args: LaunchRequestArguments): Promise<void> {
    await this.sendRequest('launch', args);
  }

  async attach(args: AttachRequestArguments): Promise<void> {
    await this.sendRequest('attach', args);
  }

  async disconnect(restart = false): Promise<void> {
    try {
      await this.sendRequest('disconnect', { restart }, 5000);
    } catch (err) {
      // Ignore disconnect errors
    }
    this.cleanup();
  }

  async terminate(restart = false): Promise<void> {
    await this.sendRequest('terminate', { restart });
  }

  async setBreakpoints(source: Source, breakpoints: SourceBreakpoint[]): Promise<Breakpoint[]> {
    const response = await this.sendRequest<{ breakpoints: Breakpoint[] }>('setBreakpoints', {
      source,
      breakpoints,
      sourceModified: false,
    });
    return response.breakpoints;
  }

  async setFunctionBreakpoints(breakpoints: { name: string; condition?: string; hitCondition?: string }[]): Promise<Breakpoint[]> {
    const response = await this.sendRequest<{ breakpoints: Breakpoint[] }>('setFunctionBreakpoints', {
      breakpoints,
    });
    return response.breakpoints;
  }

  async setExceptionBreakpoints(filters: string[], filterOptions?: ExceptionFilterOptions[]): Promise<Breakpoint[] | undefined> {
    const response = await this.sendRequest<{ breakpoints?: Breakpoint[] }>('setExceptionBreakpoints', {
      filters,
      filterOptions,
    });
    return response.breakpoints;
  }

  async continue(threadId: number): Promise<{ allThreadsContinued?: boolean }> {
    return this.sendRequest('continue', { threadId });
  }

  async next(threadId: number, granularity?: SteppingGranularity): Promise<void> {
    await this.sendRequest('next', { threadId, granularity });
  }

  async stepIn(threadId: number, targetId?: number, granularity?: SteppingGranularity): Promise<void> {
    await this.sendRequest('stepIn', { threadId, targetId, granularity });
  }

  async stepOut(threadId: number, granularity?: SteppingGranularity): Promise<void> {
    await this.sendRequest('stepOut', { threadId, granularity });
  }

  async stepBack(threadId: number, granularity?: SteppingGranularity): Promise<void> {
    await this.sendRequest('stepBack', { threadId, granularity });
  }

  async pause(threadId: number): Promise<void> {
    await this.sendRequest('pause', { threadId });
  }

  async threads(): Promise<Thread[]> {
    const response = await this.sendRequest<{ threads: Thread[] }>('threads');
    return response.threads;
  }

  async stackTrace(threadId: number, startFrame = 0, levels = 20): Promise<{ stackFrames: StackFrame[]; totalFrames?: number }> {
    return this.sendRequest('stackTrace', { threadId, startFrame, levels });
  }

  async scopes(frameId: number): Promise<Scope[]> {
    const response = await this.sendRequest<{ scopes: Scope[] }>('scopes', { frameId });
    return response.scopes;
  }

  async variables(variablesReference: number, filter?: 'indexed' | 'named', start?: number, count?: number): Promise<Variable[]> {
    const response = await this.sendRequest<{ variables: Variable[] }>('variables', {
      variablesReference,
      filter,
      start,
      count,
    });
    return response.variables;
  }

  async setVariable(variablesReference: number, name: string, value: string): Promise<{ value: string; type?: string; variablesReference?: number }> {
    return this.sendRequest('setVariable', { variablesReference, name, value });
  }

  async evaluate(expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover' | 'clipboard' | 'variables'): Promise<{ result: string; type?: string; presentationHint?: VariablePresentationHint; variablesReference: number }> {
    return this.sendRequest('evaluate', { expression, frameId, context });
  }

  async completions(frameId: number | undefined, text: string, column: number, line?: number): Promise<CompletionItem[]> {
    const response = await this.sendRequest<{ targets: CompletionItem[] }>('completions', {
      frameId,
      text,
      column,
      line,
    });
    return response.targets;
  }

  async source(sourceReference: number, source?: Source): Promise<{ content: string; mimeType?: string }> {
    return this.sendRequest('source', { sourceReference, source });
  }

  async loadedSources(): Promise<Source[]> {
    const response = await this.sendRequest<{ sources: Source[] }>('loadedSources');
    return response.sources;
  }

  async restart(args?: RestartArguments): Promise<void> {
    await this.sendRequest('restart', args as Record<string, unknown> | undefined);
  }

  private cleanup(): void {
    this.connected = false;
    this.initialized = false;

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    // Reject all pending requests
    for (const [seq, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(createError(ErrorCode.CONNECTION_ERROR, 'Debug session terminated'));
    }
    this.pendingRequests.clear();

    this.emit('terminated');
  }

  destroy(): void {
    this.cleanup();
    this.removeAllListeners();
  }
}

// Additional type definitions
interface InitializeRequestArguments {
  clientID?: string;
  clientName?: string;
  adapterID: string;
  locale?: string;
  linesStartAt1?: boolean;
  columnsStartAt1?: boolean;
  pathFormat?: 'path' | 'uri';
}

interface LaunchRequestArguments {
  noDebug?: boolean;
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  [key: string]: unknown;
}

interface AttachRequestArguments {
  port?: number;
  host?: string;
  processId?: number;
  [key: string]: unknown;
}

interface ExceptionFilterOptions {
  filterId: string;
  condition?: string;
}

type SteppingGranularity = 'statement' | 'line' | 'instruction';

interface CompletionItem {
  label: string;
  text?: string;
  sortText?: string;
  detail?: string;
  type?: 'method' | 'function' | 'constructor' | 'field' | 'variable' | 'class' | 'interface' | 'module' | 'property' | 'unit' | 'value' | 'enum' | 'keyword' | 'snippet' | 'text' | 'color' | 'file' | 'reference' | 'customcolor';
  start?: number;
  length?: number;
  selectionStart?: number;
  selectionLength?: number;
}

interface RestartArguments {
  arguments?: LaunchRequestArguments | AttachRequestArguments;
}

export type {
  InitializeRequestArguments,
  LaunchRequestArguments,
  AttachRequestArguments,
  ExceptionFilterOptions,
  SteppingGranularity,
  CompletionItem,
  RestartArguments,
};
