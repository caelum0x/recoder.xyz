/**
 * Debug Adapter Protocol (DAP) Client
 *
 * Implements the DAP specification for communicating with debug adapters.
 * Supports Node.js (node-debug2), Python (debugpy), Go (delve), and Rust (lldb-vscode).
 *
 * @see https://microsoft.github.io/debug-adapter-protocol/
 */
import { EventEmitter } from 'events';
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
export declare const DEBUG_ADAPTER_CONFIGS: Record<DebugLanguage, DebugAdapterConfig>;
export declare class DAPClient extends EventEmitter {
    private socket;
    private process;
    private buffer;
    private seq;
    private pendingRequests;
    private capabilities;
    private connected;
    private initialized;
    readonly language: DebugLanguage;
    readonly config: DebugAdapterConfig;
    constructor(language: DebugLanguage);
    get isConnected(): boolean;
    get isInitialized(): boolean;
    getCapabilities(): Capabilities;
    connect(host: string, port: number, timeout?: number): Promise<void>;
    spawn(cwd: string, env?: Record<string, string>): Promise<void>;
    private setupSocketHandlers;
    private handleData;
    private handleMessage;
    private handleResponse;
    private handleEvent;
    private handleReverseRequest;
    sendRequest<T = Record<string, unknown>>(command: string, args?: Record<string, unknown>, timeout?: number): Promise<T>;
    private send;
    initialize(args?: Partial<InitializeRequestArguments>): Promise<Capabilities>;
    configurationDone(): Promise<void>;
    launch(args: LaunchRequestArguments): Promise<void>;
    attach(args: AttachRequestArguments): Promise<void>;
    disconnect(restart?: boolean): Promise<void>;
    terminate(restart?: boolean): Promise<void>;
    setBreakpoints(source: Source, breakpoints: SourceBreakpoint[]): Promise<Breakpoint[]>;
    setFunctionBreakpoints(breakpoints: {
        name: string;
        condition?: string;
        hitCondition?: string;
    }[]): Promise<Breakpoint[]>;
    setExceptionBreakpoints(filters: string[], filterOptions?: ExceptionFilterOptions[]): Promise<Breakpoint[] | undefined>;
    continue(threadId: number): Promise<{
        allThreadsContinued?: boolean;
    }>;
    next(threadId: number, granularity?: SteppingGranularity): Promise<void>;
    stepIn(threadId: number, targetId?: number, granularity?: SteppingGranularity): Promise<void>;
    stepOut(threadId: number, granularity?: SteppingGranularity): Promise<void>;
    stepBack(threadId: number, granularity?: SteppingGranularity): Promise<void>;
    pause(threadId: number): Promise<void>;
    threads(): Promise<Thread[]>;
    stackTrace(threadId: number, startFrame?: number, levels?: number): Promise<{
        stackFrames: StackFrame[];
        totalFrames?: number;
    }>;
    scopes(frameId: number): Promise<Scope[]>;
    variables(variablesReference: number, filter?: 'indexed' | 'named', start?: number, count?: number): Promise<Variable[]>;
    setVariable(variablesReference: number, name: string, value: string): Promise<{
        value: string;
        type?: string;
        variablesReference?: number;
    }>;
    evaluate(expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover' | 'clipboard' | 'variables'): Promise<{
        result: string;
        type?: string;
        presentationHint?: VariablePresentationHint;
        variablesReference: number;
    }>;
    completions(frameId: number | undefined, text: string, column: number, line?: number): Promise<CompletionItem[]>;
    source(sourceReference: number, source?: Source): Promise<{
        content: string;
        mimeType?: string;
    }>;
    loadedSources(): Promise<Source[]>;
    restart(args?: RestartArguments): Promise<void>;
    private cleanup;
    destroy(): void;
}
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
export type { InitializeRequestArguments, LaunchRequestArguments, AttachRequestArguments, ExceptionFilterOptions, SteppingGranularity, CompletionItem, RestartArguments, };
