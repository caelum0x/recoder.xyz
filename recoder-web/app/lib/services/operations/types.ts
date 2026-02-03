/**
 * Operations Types
 * Core type definitions for the operations system
 */

// ============================================================================
// IDs and Basic Types
// ============================================================================

/** Branded type for unique node identifiers */
export type NodeId = string & { readonly __brand: 'NodeId' };

/** Branded type for unique output identifiers */
export type OutputId = string & { readonly __brand: 'OutputId' };

/** Branded type for unique action identifiers */
export type ActionId = string & { readonly __brand: 'ActionId' };

/** Branded type for unique query identifiers */
export type QueryId = string & { readonly __brand: 'QueryId' };

/** Branded type for unique generation identifiers */
export type GenerationId = string & { readonly __brand: 'GenerationId' };

/** Branded type for task identifiers */
export type TaskId = string & { readonly __brand: 'TaskId' };

// ============================================================================
// ID Generators
// ============================================================================

let nodeIdCounter = 0;
let outputIdCounter = 0;
let actionIdCounter = 0;
let queryIdCounter = 0;
let generationIdCounter = 0;
let taskIdCounter = 0;

export function createNodeId(): NodeId {
  return `nd-${Date.now()}-${++nodeIdCounter}` as NodeId;
}

export function createOutputId(): OutputId {
  return `otp-${Date.now()}-${++outputIdCounter}` as OutputId;
}

export function createActionId(): ActionId {
  return `act-${Date.now()}-${++actionIdCounter}` as ActionId;
}

export function createQueryId(): QueryId {
  return `qry-${Date.now()}-${++queryIdCounter}` as QueryId;
}

export function createGenerationId(): GenerationId {
  return `gen-${Date.now()}-${++generationIdCounter}` as GenerationId;
}

export function createTaskId(): TaskId {
  return `tsk-${Date.now()}-${++taskIdCounter}` as TaskId;
}

// ============================================================================
// Provider Types
// ============================================================================

/** Action providers supported by the system */
export type ActionProvider =
  | 'shell'
  | 'file'
  | 'docker'
  | 'github'
  | 'database'
  | 'api'
  | 'custom';

/** Query providers supported by the system */
export type QueryProvider =
  | 'file-search'
  | 'code-search'
  | 'database'
  | 'vector-store'
  | 'api'
  | 'custom';

/** Data query providers */
export type DataQueryProvider =
  | 'sqlite'
  | 'postgres'
  | 'mysql'
  | 'mongodb'
  | 'redis'
  | 'custom';

// ============================================================================
// Generation Types
// ============================================================================

/** Status of a generation */
export type GenerationStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Base generation interface */
export interface BaseGeneration {
  id: GenerationId;
  nodeId: NodeId;
  status: GenerationStatus;
  createdAt: number;
}

/** Created generation - initial state */
export interface CreatedGeneration extends BaseGeneration {
  status: 'created';
}

/** Queued generation - waiting to be executed */
export interface QueuedGeneration extends BaseGeneration {
  status: 'queued';
  queuedAt: number;
  context: GenerationContext;
}

/** Running generation - currently executing */
export interface RunningGeneration extends BaseGeneration {
  status: 'running';
  queuedAt: number;
  startedAt: number;
  context: GenerationContext;
}

/** Completed generation - successfully finished */
export interface CompletedGeneration extends BaseGeneration {
  status: 'completed';
  queuedAt: number;
  startedAt: number;
  completedAt: number;
  context: GenerationContext;
  outputs: GenerationOutput[];
  inputMessages: InputMessage[];
}

/** Failed generation - encountered an error */
export interface FailedGeneration extends BaseGeneration {
  status: 'failed';
  queuedAt: number;
  startedAt: number;
  failedAt: number;
  context: GenerationContext;
  error: GenerationError;
}

/** Cancelled generation - stopped before completion */
export interface CancelledGeneration extends BaseGeneration {
  status: 'cancelled';
  cancelledAt: number;
}

/** Union of all generation states */
export type Generation =
  | CreatedGeneration
  | QueuedGeneration
  | RunningGeneration
  | CompletedGeneration
  | FailedGeneration
  | CancelledGeneration;

/** Type guards */
export function isQueuedGeneration(gen: Generation): gen is QueuedGeneration {
  return gen.status === 'queued';
}

export function isRunningGeneration(gen: Generation): gen is RunningGeneration {
  return gen.status === 'running';
}

export function isCompletedGeneration(gen: Generation): gen is CompletedGeneration {
  return gen.status === 'completed';
}

export function isFailedGeneration(gen: Generation): gen is FailedGeneration {
  return gen.status === 'failed';
}

// ============================================================================
// Generation Context
// ============================================================================

/** Context provided to a generation for execution */
export interface GenerationContext {
  operationNode: OperationNode;
  sourceNodes: SourceNode[];
  connections: Connection[];
  origin: GenerationOrigin;
  metadata?: Record<string, unknown>;
}

/** Origin information for a generation */
export interface GenerationOrigin {
  taskId?: TaskId;
  triggeredBy?: 'user' | 'system' | 'schedule' | 'webhook';
  parentGenerationId?: GenerationId;
}

// ============================================================================
// Output Types
// ============================================================================

/** Types of generation outputs */
export type GenerationOutputType =
  | 'generated-text'
  | 'generated-file'
  | 'query-result'
  | 'data-query-result'
  | 'action-result'
  | 'source'
  | 'error';

/** Base output interface */
export interface BaseGenerationOutput {
  type: GenerationOutputType;
  outputId: OutputId;
}

/** Text output from a generation */
export interface GeneratedTextOutput extends BaseGenerationOutput {
  type: 'generated-text';
  content: string;
}

/** File output from a generation */
export interface GeneratedFileOutput extends BaseGenerationOutput {
  type: 'generated-file';
  path: string;
  content: string;
  mimeType?: string;
}

/** Query result output */
export interface QueryResultOutput extends BaseGenerationOutput {
  type: 'query-result';
  content: QueryResult[];
}

/** Data query result output */
export interface DataQueryResultOutput extends BaseGenerationOutput {
  type: 'data-query-result';
  content: DataQueryResult;
}

/** Action result output */
export interface ActionResultOutput extends BaseGenerationOutput {
  type: 'action-result';
  content: unknown;
}

/** Source reference output */
export interface SourceOutput extends BaseGenerationOutput {
  type: 'source';
  sources: SourceReference[];
}

/** Error output */
export interface ErrorOutput extends BaseGenerationOutput {
  type: 'error';
  error: GenerationError;
}

/** Union of all output types */
export type GenerationOutput =
  | GeneratedTextOutput
  | GeneratedFileOutput
  | QueryResultOutput
  | DataQueryResultOutput
  | ActionResultOutput
  | SourceOutput
  | ErrorOutput;

// ============================================================================
// Node Types
// ============================================================================

/** Types of operation nodes */
export type OperationNodeType =
  | 'action'
  | 'query'
  | 'data-query'
  | 'text-generation'
  | 'content-generation'
  | 'trigger'
  | 'custom';

/** Base operation node */
export interface OperationNode {
  id: NodeId;
  type: 'operation';
  content: OperationNodeContent;
  inputs: NodeInput[];
  outputs: NodeOutput[];
}

/** Operation node content varies by type */
export type OperationNodeContent =
  | ActionNodeContent
  | QueryNodeContent
  | DataQueryNodeContent
  | TextGenerationNodeContent
  | TriggerNodeContent
  | CustomNodeContent;

/** Action node content */
export interface ActionNodeContent {
  type: 'action';
  command: ActionCommand;
}

/** Query node content */
export interface QueryNodeContent {
  type: 'query';
  query: string;
  maxResults?: number;
  similarityThreshold?: number;
}

/** Data query node content */
export interface DataQueryNodeContent {
  type: 'data-query';
  query: string;
}

/** Text generation node content */
export interface TextGenerationNodeContent {
  type: 'text-generation';
  prompt: string;
  model?: string;
  temperature?: number;
}

/** Trigger node content */
export interface TriggerNodeContent {
  type: 'trigger';
  triggerType: 'manual' | 'schedule' | 'webhook' | 'event';
  config: Record<string, unknown>;
}

/** Custom node content */
export interface CustomNodeContent {
  type: 'custom';
  handler: string;
  config: Record<string, unknown>;
}

// ============================================================================
// Source Node Types
// ============================================================================

/** Types of source/variable nodes */
export type SourceNodeType =
  | 'text'
  | 'file'
  | 'dataStore'
  | 'vectorStore'
  | 'webPage'
  | 'github'
  | 'textGeneration'
  | 'contentGeneration'
  | 'imageGeneration'
  | 'query'
  | 'dataQuery'
  | 'trigger'
  | 'action'
  | 'appEntry'
  | 'end';

/** Source node (provides data to operations) */
export interface SourceNode {
  id: NodeId;
  type: 'variable' | 'operation';
  content: SourceNodeContent;
  outputs: NodeOutput[];
}

/** Source node content */
export type SourceNodeContent =
  | TextSourceContent
  | FileSourceContent
  | DataStoreSourceContent
  | VectorStoreSourceContent
  | TextGenerationSourceContent
  | ContentGenerationSourceContent
  | WebPageSourceContent
  | GitHubSourceContent
  | QuerySourceContent
  | DataQuerySourceContent
  | TriggerSourceContent
  | ActionSourceContent
  | AppEntrySourceContent
  | EndSourceContent;

/** Text source content */
export interface TextSourceContent {
  type: 'text';
  text: string;
}

/** File source content */
export interface FileSourceContent {
  type: 'file';
  path: string;
  content?: string;
}

/** Data store source content */
export interface DataStoreSourceContent {
  type: 'dataStore';
  state: DataStoreState;
}

/** Vector store source content */
export interface VectorStoreSourceContent {
  type: 'vectorStore';
  source: VectorStoreSource;
}

/** Text generation source content */
export interface TextGenerationSourceContent {
  type: 'textGeneration';
}

/** Content generation source content */
export interface ContentGenerationSourceContent {
  type: 'contentGeneration';
}

/** Web page source content */
export interface WebPageSourceContent {
  type: 'webPage';
  url: string;
}

/** GitHub source content */
export interface GitHubSourceContent {
  type: 'github';
  repository?: string;
}

/** Query source content */
export interface QuerySourceContent {
  type: 'query';
}

/** Data query source content */
export interface DataQuerySourceContent {
  type: 'dataQuery';
}

/** Trigger source content */
export interface TriggerSourceContent {
  type: 'trigger';
}

/** Action source content */
export interface ActionSourceContent {
  type: 'action';
}

/** App entry source content */
export interface AppEntrySourceContent {
  type: 'appEntry';
}

/** End source content */
export interface EndSourceContent {
  type: 'end';
}

/** Image generation source content */
export interface ImageGenerationSourceContent {
  type: 'imageGeneration';
}

// ============================================================================
// Action Types
// ============================================================================

/** Action command configuration */
export interface ActionCommand {
  provider: ActionProvider;
  state: ActionState;
}

/** State of an action */
export type ActionState =
  | ActionUnconfiguredState
  | ActionConfiguredState;

/** Unconfigured action state */
export interface ActionUnconfiguredState {
  status: 'unconfigured';
}

/** Configured action state */
export interface ActionConfiguredState {
  status: 'configured';
  commandId: string;
  payload: Record<string, unknown>;
}

// ============================================================================
// Connection Types
// ============================================================================

/** Connection between nodes */
export interface Connection {
  id: string;
  outputNode: { id: NodeId };
  outputId: OutputId;
  inputNode: { id: NodeId };
  inputId: string;
}

/** Node input definition */
export interface NodeInput {
  id: string;
  accessor: string;
  label?: string;
  required?: boolean;
}

/** Node output definition */
export interface NodeOutput {
  id: OutputId;
  accessor: string;
  label?: string;
}

// ============================================================================
// Input Message Types
// ============================================================================

/** Input message for a generation */
export interface InputMessage {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent[];
}

/** Message content types */
export type MessageContent =
  | TextMessageContent
  | FileMessageContent
  | ImageMessageContent;

/** Text message content */
export interface TextMessageContent {
  type: 'text';
  text: string;
}

/** File message content */
export interface FileMessageContent {
  type: 'file';
  path: string;
  content: string;
}

/** Image message content */
export interface ImageMessageContent {
  type: 'image';
  url: string;
  alt?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/** Generation error structure */
export interface GenerationError {
  name: string;
  message: string;
  code?: string;
  details?: unknown;
}

/** Custom error for action execution */
export class ActionExecutionError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string = 'ACTION_ERROR', details?: unknown) {
    super(message);
    this.name = 'ActionExecutionError';
    this.code = code;
    this.details = details;
  }
}

/** Custom error for query execution */
export class QueryExecutionError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string = 'QUERY_ERROR', details?: unknown) {
    super(message);
    this.name = 'QueryExecutionError';
    this.code = code;
    this.details = details;
  }
}

/** Custom error for data query execution */
export class DataQueryError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string = 'DATA_QUERY_ERROR', details?: unknown) {
    super(message);
    this.name = 'DataQueryError';
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Query Result Types
// ============================================================================

/** Query result from vector store or search */
export interface QueryResult {
  type: 'vector-store';
  source: VectorStoreSource;
  records: QueryRecord[];
}

/** Individual query record */
export interface QueryRecord {
  chunkContent: string;
  chunkIndex: number;
  score: number;
  metadata: Record<string, string>;
  additional?: unknown;
}

/** Data query result from database */
export interface DataQueryResult {
  type: 'data-query';
  dataStoreId: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  query: string;
}

// ============================================================================
// Vector Store Types
// ============================================================================

/** Vector store source configuration */
export type VectorStoreSource =
  | FileVectorStoreSource
  | DocumentVectorStoreSource;

/** File-based vector store */
export interface FileVectorStoreSource {
  provider: 'file';
  state: VectorStoreState;
}

/** Document vector store */
export interface DocumentVectorStoreSource {
  provider: 'document';
  state: DocumentVectorStoreState;
}

/** Vector store state */
export interface VectorStoreState {
  status: 'unconfigured' | 'configured';
  embeddingProfileId?: string;
}

/** Document vector store state */
export interface DocumentVectorStoreState extends VectorStoreState {
  status: 'configured';
  documentVectorStoreId: string;
}

// ============================================================================
// Data Store Types
// ============================================================================

/** Data store state */
export interface DataStoreState {
  status: 'unconfigured' | 'configured';
  dataStoreId?: string;
  provider?: DataQueryProvider;
}

// ============================================================================
// Source Reference Types
// ============================================================================

/** Reference to a source document or file */
export interface SourceReference {
  id: string;
  type: 'file' | 'document' | 'url';
  path?: string;
  url?: string;
  title?: string;
  excerpt?: string;
}

// ============================================================================
// Execution Context
// ============================================================================

/** Context for executing operations */
export interface ExecutionContext {
  projectId: string;
  workDir: string;
  userId?: string;
  sessionId?: string;
  storage?: StorageAdapter;
  callbacks?: ExecutionCallbacks;
}

/** Storage adapter interface */
export interface StorageAdapter {
  get(path: string): Promise<string | undefined>;
  set(path: string, value: string): Promise<void>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/** Execution callbacks */
export interface ExecutionCallbacks {
  onProgress?: (progress: ExecutionProgress) => void;
  onOutput?: (output: GenerationOutput) => void;
  onError?: (error: GenerationError) => void;
  onComplete?: (generation: CompletedGeneration) => void;
}

/** Execution progress */
export interface ExecutionProgress {
  stage: 'starting' | 'running' | 'finishing';
  percentage?: number;
  message?: string;
}

// ============================================================================
// Type Guards for Node Types
// ============================================================================

export function isActionNode(node: OperationNode): node is OperationNode & { content: ActionNodeContent } {
  return node.content.type === 'action';
}

export function isQueryNode(node: OperationNode): node is OperationNode & { content: QueryNodeContent } {
  return node.content.type === 'query';
}

export function isDataQueryNode(node: OperationNode): node is OperationNode & { content: DataQueryNodeContent } {
  return node.content.type === 'data-query';
}

export function isTextNode(node: SourceNode): node is SourceNode & { content: TextSourceContent } {
  return node.content.type === 'text';
}

export function isDataStoreNode(node: SourceNode): node is SourceNode & { content: DataStoreSourceContent } {
  return node.content.type === 'dataStore';
}

export function isVectorStoreNode(node: SourceNode): node is SourceNode & { content: VectorStoreSourceContent } {
  return node.content.type === 'vectorStore';
}
