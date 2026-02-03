/**
 * Workflow Types
 * Core types for generation, task, and workspace management
 * Adapted from Giselle workflow system
 */

// ============================================================
// ID Types with branded strings for type safety
// ============================================================

export type GenerationId = string & { readonly __brand: 'GenerationId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };
export type NodeId = string & { readonly __brand: 'NodeId' };
export type ConnectionId = string & { readonly __brand: 'ConnectionId' };

// ID generators with prefixes
export function generateGenerationId(): GenerationId {
  return `gen_${crypto.randomUUID()}` as GenerationId;
}

export function generateTaskId(): TaskId {
  return `task_${crypto.randomUUID()}` as TaskId;
}

export function generateWorkspaceId(): WorkspaceId {
  return `ws_${crypto.randomUUID()}` as WorkspaceId;
}

export function generateNodeId(): NodeId {
  return `nd_${crypto.randomUUID()}` as NodeId;
}

export function generateConnectionId(): ConnectionId {
  return `conn_${crypto.randomUUID()}` as ConnectionId;
}

// ============================================================
// Generation Types
// ============================================================

export type GenerationStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GenerationOrigin {
  type: 'studio' | 'task' | 'api';
  workspaceId?: WorkspaceId;
  taskId?: TaskId;
  sessionId?: string;
}

export type NodeContentType =
  | 'textGeneration'
  | 'contentGeneration'
  | 'action'
  | 'query'
  | 'trigger'
  | 'imageGeneration'
  | 'dataQuery'
  | 'appEntry'
  | 'end';

export interface OperationNode {
  id: NodeId;
  content: {
    type: NodeContentType;
    [key: string]: unknown;
  };
}

export interface GenerationContext {
  origin: GenerationOrigin;
  operationNode: OperationNode;
  inputs?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface GenerationError {
  name: string;
  message: string;
  dump?: string;
  stack?: string;
}

// Base generation interface
interface BaseGeneration {
  id: GenerationId;
  context: GenerationContext;
  createdAt: number;
}

export interface CreatedGeneration extends BaseGeneration {
  status: 'created';
}

export interface QueuedGeneration extends BaseGeneration {
  status: 'queued';
  queuedAt: number;
}

export interface RunningGeneration extends BaseGeneration {
  status: 'running';
  queuedAt: number;
  startedAt: number;
  messages: UIMessage[];
}

export interface CompletedGeneration extends BaseGeneration {
  status: 'completed';
  queuedAt: number;
  startedAt: number;
  completedAt: number;
  messages: UIMessage[];
  output?: unknown;
}

export interface FailedGeneration extends BaseGeneration {
  status: 'failed';
  queuedAt: number;
  startedAt: number;
  failedAt: number;
  messages: UIMessage[];
  error: GenerationError;
}

export interface CancelledGeneration extends BaseGeneration {
  status: 'cancelled';
  cancelledAt: number;
}

export type Generation =
  | CreatedGeneration
  | QueuedGeneration
  | RunningGeneration
  | CompletedGeneration
  | FailedGeneration
  | CancelledGeneration;

// Type guards
export function isCreatedGeneration(
  g: Generation | undefined
): g is CreatedGeneration {
  return g?.status === 'created';
}

export function isQueuedGeneration(
  g: Generation | undefined
): g is QueuedGeneration {
  return g?.status === 'queued';
}

export function isRunningGeneration(
  g: Generation | undefined
): g is RunningGeneration {
  return g?.status === 'running';
}

export function isCompletedGeneration(
  g: Generation | undefined
): g is CompletedGeneration {
  return g?.status === 'completed';
}

export function isFailedGeneration(
  g: Generation | undefined
): g is FailedGeneration {
  return g?.status === 'failed';
}

export function isCancelledGeneration(
  g: Generation | undefined
): g is CancelledGeneration {
  return g?.status === 'cancelled';
}

export function isTerminalGeneration(
  g: Generation | undefined
): g is CompletedGeneration | FailedGeneration | CancelledGeneration {
  return (
    isCompletedGeneration(g) || isFailedGeneration(g) || isCancelledGeneration(g)
  );
}

// ============================================================
// UI Message Types (Vercel AI SDK compatible)
// ============================================================

export type UIMessagePartType =
  | 'text'
  | 'tool-call'
  | 'tool-result'
  | 'image'
  | 'file'
  | 'code'
  | 'reasoning';

export interface UIMessagePart {
  type: UIMessagePartType;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  mimeType?: string;
  data?: string;
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts?: UIMessagePart[];
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Task Types
// ============================================================

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Task {
  id: TaskId;
  workspaceId: WorkspaceId;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: GenerationError;
  metadata?: Record<string, unknown>;
}

export interface NodeGenerationIndex {
  id: GenerationId;
  nodeId: NodeId;
  status: GenerationStatus;
  createdAt: number;
}

// ============================================================
// Stream Types
// ============================================================

export type StreamEndChunk =
  | { type: 'finish' }
  | { type: 'abort' }
  | { type: 'error'; errorText: string };

export function isStreamEndChunk(chunk: unknown): chunk is StreamEndChunk {
  if (
    typeof chunk !== 'object' ||
    chunk === null ||
    !('type' in chunk) ||
    typeof (chunk as Record<string, unknown>).type !== 'string'
  ) {
    return false;
  }

  const chunkType = (chunk as Record<string, unknown>).type as string;

  if (!['finish', 'abort', 'error'].includes(chunkType)) {
    return false;
  }

  if (chunkType === 'error') {
    return (
      'errorText' in chunk &&
      typeof (chunk as Record<string, unknown>).errorText === 'string'
    );
  }

  return true;
}

// ============================================================
// Stream Event Types (SSE)
// ============================================================

export type StreamEventType = 'connected' | 'data' | 'end' | 'error';

export type StreamEvent =
  | { type: 'connected' }
  | { type: 'data'; data: StreamData }
  | { type: 'end' }
  | { type: 'error'; message: string };

export interface StreamData {
  taskId: TaskId;
  generationId?: GenerationId;
  status?: TaskStatus;
  output?: unknown;
  message?: UIMessage;
}

export function parseStreamEvent(obj: unknown): StreamEvent | null {
  if (typeof obj !== 'object' || obj === null || !('type' in obj)) {
    return null;
  }

  const typed = obj as Record<string, unknown>;
  switch (typed.type) {
    case 'connected':
      return { type: 'connected' };
    case 'data':
      if ('data' in typed && typeof typed.data === 'object') {
        return { type: 'data', data: typed.data as StreamData };
      }
      return null;
    case 'end':
      return { type: 'end' };
    case 'error':
      if ('message' in typed && typeof typed.message === 'string') {
        return { type: 'error', message: typed.message };
      }
      return null;
    default:
      return null;
  }
}

// ============================================================
// Workspace Types
// ============================================================

export interface WorkspaceNode {
  id: NodeId;
  type: 'operation' | 'variable';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkspaceConnection {
  id: ConnectionId;
  sourceNodeId: NodeId;
  sourceOutputId: string;
  targetNodeId: NodeId;
  targetInputId: string;
}

export interface Workspace {
  id: WorkspaceId;
  name: string;
  nodes: WorkspaceNode[];
  connections: WorkspaceConnection[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceSettings {
  autoSave: boolean;
  saveInterval: number;
  maxUndoHistory: number;
  theme?: 'light' | 'dark' | 'system';
}
