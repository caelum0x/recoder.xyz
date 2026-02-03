/**
 * Workflow Types
 *
 * Core type definitions for the workflow system, adapted from giselle protocol
 */

import { z } from 'zod';

// ============================================
// ID Types (branded types for type safety)
// ============================================

export type NodeId = string & { readonly __brand: 'NodeId' };
export type InputId = string & { readonly __brand: 'InputId' };
export type OutputId = string & { readonly __brand: 'OutputId' };
export type ConnectionId = string & { readonly __brand: 'ConnectionId' };
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type GenerationId = string & { readonly __brand: 'GenerationId' };
export type TriggerId = string & { readonly __brand: 'TriggerId' };
export type SequenceId = string & { readonly __brand: 'SequenceId' };
export type StepId = string & { readonly __brand: 'StepId' };

// ID generators
let idCounter = 0;
const generateId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;

export const NodeIdGenerator = {
  generate: (): NodeId => generateId('nd') as NodeId,
  schema: z.string().startsWith('nd_'),
};

export const InputIdGenerator = {
  generate: (): InputId => generateId('inp') as InputId,
  schema: z.string().startsWith('inp_'),
};

export const OutputIdGenerator = {
  generate: (): OutputId => generateId('otp') as OutputId,
  schema: z.string().startsWith('otp_'),
};

export const ConnectionIdGenerator = {
  generate: (): ConnectionId => generateId('con') as ConnectionId,
  schema: z.string().startsWith('con_'),
};

export const WorkflowIdGenerator = {
  generate: (): WorkflowId => generateId('wf') as WorkflowId,
  schema: z.string().startsWith('wf_'),
};

export const TaskIdGenerator = {
  generate: (): TaskId => generateId('tsk') as TaskId,
  schema: z.string().startsWith('tsk_'),
};

export const GenerationIdGenerator = {
  generate: (): GenerationId => generateId('gen') as GenerationId,
  schema: z.string().startsWith('gen_'),
};

export const TriggerIdGenerator = {
  generate: (): TriggerId => generateId('trg') as TriggerId,
  schema: z.string().startsWith('trg_'),
};

export const SequenceIdGenerator = {
  generate: (): SequenceId => generateId('sqn') as SequenceId,
  schema: z.string().startsWith('sqn_'),
};

export const StepIdGenerator = {
  generate: (): StepId => generateId('stp') as StepId,
  schema: z.string().startsWith('stp_'),
};

// ============================================
// Node Types
// ============================================

/** Node type classification */
export type NodeType = 'operation' | 'variable';

/** Operation node content types */
export type OperationNodeContentType =
  | 'textGeneration'
  | 'imageGeneration'
  | 'contentGeneration'
  | 'codeExecution'
  | 'trigger'
  | 'action'
  | 'query'
  | 'dataQuery'
  | 'appEntry'
  | 'end';

/** Variable node content types */
export type VariableNodeContentType =
  | 'text'
  | 'file'
  | 'github'
  | 'vectorStore'
  | 'dataStore'
  | 'webPage';

/** All node content types */
export type NodeContentType = OperationNodeContentType | VariableNodeContentType;

/** Input definition for a node */
export interface NodeInput {
  id: InputId;
  label: string;
  accessor: string;
  isRequired?: boolean;
}

/** Output definition for a node */
export interface NodeOutput {
  id: OutputId;
  label: string;
  accessor: string;
}

/** Base node properties */
export interface NodeBase {
  id: NodeId;
  name?: string;
  type: NodeType;
  inputs: NodeInput[];
  outputs: NodeOutput[];
}

// ============================================
// Operation Node Contents
// ============================================

/** Text generation node content */
export interface TextGenerationContent {
  type: 'textGeneration';
  llm: {
    id: string;
    provider: string;
  };
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Image generation node content */
export interface ImageGenerationContent {
  type: 'imageGeneration';
  llm: {
    id: string;
    provider: string;
  };
  prompt?: string;
  size?: string;
}

/** Content generation node content (unified generation) */
export interface ContentGenerationContent {
  type: 'contentGeneration';
  version: 'v1';
  prompt: string;
  languageModel: {
    provider: string;
    id: string;
    configuration: Record<string, unknown>;
  };
  tools: string[];
}

/** Code execution node content */
export interface CodeExecutionContent {
  type: 'codeExecution';
  code: string;
  language: 'javascript' | 'typescript' | 'python';
}

/** Trigger node content */
export interface TriggerContent {
  type: 'trigger';
  provider: 'github' | 'manual' | 'webhook' | 'schedule';
  state: {
    status: 'unconfigured' | 'configured' | 'active';
    triggerId?: TriggerId;
    config?: Record<string, unknown>;
  };
}

/** Action node content */
export interface ActionContent {
  type: 'action';
  command: {
    provider: 'github';
    state: {
      status: 'unconfigured' | 'configured';
      actionId?: string;
    };
    config?: Record<string, unknown>;
  };
}

/** Query node content (for RAG) */
export interface QueryContent {
  type: 'query';
  query: string;
  maxResults: number;
  similarityThreshold: number;
}

/** Data query node content */
export interface DataQueryContent {
  type: 'dataQuery';
  query: string;
  dataStoreId?: string;
}

/** App entry node content */
export interface AppEntryContent {
  type: 'appEntry';
  status: 'unconfigured' | 'configured';
  draftApp?: {
    name: string;
    description: string;
    iconName: string;
    parameters: Array<{
      id: string;
      name: string;
      type: 'text' | 'multiline-text' | 'number' | 'files';
      required: boolean;
    }>;
  };
}

/** End node content */
export interface EndContent {
  type: 'end';
}

// ============================================
// Variable Node Contents
// ============================================

/** Text variable content */
export interface TextVariableContent {
  type: 'text';
  text: string;
}

/** File variable content */
export interface FileVariableContent {
  type: 'file';
  category: 'document' | 'image' | 'code';
  files: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    status: 'pending' | 'uploading' | 'ready' | 'error';
  }>;
}

/** GitHub variable content */
export interface GitHubVariableContent {
  type: 'github';
  objectReferences: Array<{
    type: 'issue' | 'pull_request' | 'discussion' | 'repository';
    id: string;
    owner: string;
    repo: string;
    number?: number;
  }>;
}

/** Vector store variable content */
export interface VectorStoreContent {
  type: 'vectorStore';
  source: {
    provider: 'github' | 'document';
    state: {
      status: 'unconfigured' | 'configured' | 'indexing' | 'ready' | 'error';
      error?: string;
    };
    config?: Record<string, unknown>;
  };
}

/** Data store variable content */
export interface DataStoreContent {
  type: 'dataStore';
  state: {
    status: 'unconfigured' | 'configured';
    dataStoreId?: string;
  };
}

/** Web page variable content */
export interface WebPageContent {
  type: 'webPage';
  webpages: Array<{
    url: string;
    title?: string;
    status: 'fetching' | 'ready' | 'error';
    content?: string;
    error?: string;
  }>;
}

// ============================================
// Node Definitions
// ============================================

/** Operation node content union */
export type OperationNodeContent =
  | TextGenerationContent
  | ImageGenerationContent
  | ContentGenerationContent
  | CodeExecutionContent
  | TriggerContent
  | ActionContent
  | QueryContent
  | DataQueryContent
  | AppEntryContent
  | EndContent;

/** Variable node content union */
export type VariableNodeContent =
  | TextVariableContent
  | FileVariableContent
  | GitHubVariableContent
  | VectorStoreContent
  | DataStoreContent
  | WebPageContent;

/** Operation node */
export interface OperationNode extends NodeBase {
  type: 'operation';
  content: OperationNodeContent;
}

/** Variable node */
export interface VariableNode extends NodeBase {
  type: 'variable';
  content: VariableNodeContent;
}

/** Union of all node types */
export type WorkflowNode = OperationNode | VariableNode;

// ============================================
// Connection & Workspace
// ============================================

/** Connection between nodes */
export interface Connection {
  id: ConnectionId;
  sourceNodeId: NodeId;
  sourceOutputId: OutputId;
  targetNodeId: NodeId;
  targetInputId: InputId;
}

/** Node UI state */
export interface NodeUIState {
  position: { x: number; y: number };
  selected: boolean;
  highlighted: boolean;
  measured?: { width: number; height: number };
}

/** Viewport state */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** UI state for the workflow */
export interface WorkflowUIState {
  nodeState: Record<string, NodeUIState>;
  viewport: Viewport;
  inspectedNodeId?: NodeId;
  selectedConnectionIds: ConnectionId[];
}

/** Workflow definition */
export interface Workflow {
  id: WorkflowId;
  name: string;
  schemaVersion: string;
  nodes: WorkflowNode[];
  connections: Connection[];
  ui: WorkflowUIState;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// Task & Generation
// ============================================

/** Generation status */
export type GenerationStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Generation context */
export interface GenerationContext {
  workflowId: WorkflowId;
  nodeId: NodeId;
  operationNode: OperationNode;
  triggerData?: Record<string, unknown>;
}

/** Base generation */
export interface GenerationBase {
  id: GenerationId;
  context: GenerationContext;
  outputs?: Array<{
    outputId: OutputId;
    type: string;
    content: unknown;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  error?: {
    message: string;
    code?: string;
  };
}

/** Queued generation */
export interface QueuedGeneration extends GenerationBase {
  status: 'queued';
  queuedAt: number;
}

/** Running generation */
export interface RunningGeneration extends GenerationBase {
  status: 'running';
  startedAt: number;
}

/** Completed generation */
export interface CompletedGeneration extends GenerationBase {
  status: 'completed';
  completedAt: number;
}

/** Failed generation */
export interface FailedGeneration extends GenerationBase {
  status: 'failed';
  failedAt: number;
}

/** Cancelled generation */
export interface CancelledGeneration extends GenerationBase {
  status: 'cancelled';
  cancelledAt: number;
}

/** Union of all generation states */
export type Generation =
  | (GenerationBase & { status: 'created' })
  | QueuedGeneration
  | RunningGeneration
  | CompletedGeneration
  | FailedGeneration
  | CancelledGeneration;

/** Step in a task execution */
export interface TaskStep {
  id: StepId;
  status: GenerationStatus;
  name: string;
  generationId: GenerationId;
  duration: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/** Sequence of steps */
export interface TaskSequence {
  id: SequenceId;
  steps: TaskStep[];
  status: GenerationStatus;
  duration: {
    wallClock: number;
    totalTask: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/** Task status */
export type TaskStatus =
  | 'created'
  | 'inProgress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Task starter types */
export type TaskStarter =
  | { type: 'run-button' }
  | { type: 'github-trigger'; triggerId: TriggerId; end?: { type: 'endNode' | 'none'; appId?: string } }
  | { type: 'app'; appId: string }
  | { type: 'api'; apiKey: string };

/** Task definition */
export interface Task {
  id: TaskId;
  starter: TaskStarter;
  workflowId: WorkflowId;
  name: string;
  status: TaskStatus;
  steps: {
    queued: number;
    inProgress: number;
    completed: number;
    warning: number;
    cancelled: number;
    failed: number;
  };
  trigger: string;
  duration: {
    wallClock: number;
    totalTask: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  createdAt: number;
  updatedAt: number;
  sequences: TaskSequence[];
}

// ============================================
// Trigger Types
// ============================================

/** Trigger provider types */
export type TriggerProvider = 'github' | 'manual' | 'webhook' | 'schedule';

/** Trigger configuration */
export interface TriggerConfig {
  id: TriggerId;
  provider: TriggerProvider;
  workflowId: WorkflowId;
  nodeId: NodeId;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** GitHub trigger event types */
export type GitHubEventType =
  | 'issue.created'
  | 'issue.closed'
  | 'issue.labeled'
  | 'issue_comment.created'
  | 'pull_request.opened'
  | 'pull_request.closed'
  | 'pull_request.labeled'
  | 'pull_request.ready_for_review'
  | 'pull_request_comment.created'
  | 'pull_request_review_comment.created'
  | 'discussion.created'
  | 'discussion_comment.created';

/** GitHub trigger data */
export interface GitHubTriggerData {
  event: GitHubEventType;
  repositoryNodeId: string;
  installationId: number;
  payload: Record<string, unknown>;
}

// ============================================
// Type Guards
// ============================================

export function isOperationNode(node: WorkflowNode): node is OperationNode {
  return node.type === 'operation';
}

export function isVariableNode(node: WorkflowNode): node is VariableNode {
  return node.type === 'variable';
}

export function isTextGenerationNode(node: WorkflowNode): node is OperationNode & { content: TextGenerationContent } {
  return isOperationNode(node) && node.content.type === 'textGeneration';
}

export function isImageGenerationNode(node: WorkflowNode): node is OperationNode & { content: ImageGenerationContent } {
  return isOperationNode(node) && node.content.type === 'imageGeneration';
}

export function isTriggerNode(node: WorkflowNode): node is OperationNode & { content: TriggerContent } {
  return isOperationNode(node) && node.content.type === 'trigger';
}

export function isActionNode(node: WorkflowNode): node is OperationNode & { content: ActionContent } {
  return isOperationNode(node) && node.content.type === 'action';
}

export function isQueryNode(node: WorkflowNode): node is OperationNode & { content: QueryContent } {
  return isOperationNode(node) && node.content.type === 'query';
}

export function isEndNode(node: WorkflowNode): node is OperationNode & { content: EndContent } {
  return isOperationNode(node) && node.content.type === 'end';
}

export function isTextNode(node: WorkflowNode): node is VariableNode & { content: TextVariableContent } {
  return isVariableNode(node) && node.content.type === 'text';
}

export function isFileNode(node: WorkflowNode): node is VariableNode & { content: FileVariableContent } {
  return isVariableNode(node) && node.content.type === 'file';
}

export function isVectorStoreNode(node: WorkflowNode): node is VariableNode & { content: VectorStoreContent } {
  return isVariableNode(node) && node.content.type === 'vectorStore';
}

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
