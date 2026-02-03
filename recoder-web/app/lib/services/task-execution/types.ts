/**
 * Task Execution Types
 * Core domain types for the task execution system
 */

// ID Types with branded type pattern for type safety
export type TaskId = string & { readonly __brand: 'TaskId' };
export type SequenceId = string & { readonly __brand: 'SequenceId' };
export type StepId = string & { readonly __brand: 'StepId' };
export type GenerationId = string & { readonly __brand: 'GenerationId' };
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

// ID generators
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}${randomPart}`;
}

export const TaskIdUtils = {
  generate: (): TaskId => generateId('tsk') as TaskId,
  parse: (id: string): TaskId => id as TaskId,
};

export const SequenceIdUtils = {
  generate: (): SequenceId => generateId('seq') as SequenceId,
  parse: (id: string): SequenceId => id as SequenceId,
};

export const StepIdUtils = {
  generate: (): StepId => generateId('stp') as StepId,
  parse: (id: string): StepId => id as StepId,
};

export const GenerationIdUtils = {
  generate: (): GenerationId => generateId('gen') as GenerationId,
  parse: (id: string): GenerationId => id as GenerationId,
};

export const WorkspaceIdUtils = {
  generate: (): WorkspaceId => generateId('wsp') as WorkspaceId,
  parse: (id: string): WorkspaceId => id as WorkspaceId,
};

// Task Status
export type TaskStatus = 'created' | 'inProgress' | 'completed' | 'failed' | 'cancelled';

// Generation Status
export type GenerationStatus = 'created' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

// Usage tracking
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Duration tracking
export interface Duration {
  wallClock: number;
  totalTask: number;
}

// Step definition
export interface Step {
  id: StepId;
  name: string;
  status: GenerationStatus;
  generationId: GenerationId;
  duration: number;
  usage: TokenUsage;
}

// Sequence definition
export interface Sequence {
  id: SequenceId;
  status: GenerationStatus;
  steps: Step[];
  duration: Duration;
  usage: TokenUsage;
}

// Task annotations
export interface TaskAnnotation {
  level: 'info' | 'warning' | 'error';
  message: string;
  sequenceId?: SequenceId;
  stepId?: StepId;
}

// Step counts for tracking progress
export interface StepCounts {
  queued: number;
  inProgress: number;
  warning: number;
  completed: number;
  failed: number;
  cancelled: number;
}

// Task starter types
export type TaskStarter =
  | { type: 'run-button' }
  | { type: 'api' }
  | { type: 'trigger'; triggerId: string }
  | { type: 'scheduled' };

// Main Task type
export interface Task {
  id: TaskId;
  workspaceId: WorkspaceId;
  status: TaskStatus;
  name: string;
  starter?: TaskStarter;
  nodeIdsConnectedToEnd: string[];
  steps: StepCounts;
  trigger: string;
  duration: Duration;
  usage: TokenUsage;
  createdAt: number;
  updatedAt: number;
  annotations: TaskAnnotation[];
  sequences: Sequence[];
}

// Generation context for operations
export interface GenerationContext {
  inputs: GenerationInput[];
  operationNode?: OperationNode;
  sourceNodes?: Node[];
}

export interface GenerationInput {
  id: string;
  name: string;
  value: unknown;
}

// Node types (simplified)
export interface Node {
  id: string;
  type: string;
  name?: string;
}

export interface OperationNode extends Node {
  content: {
    type: string;
    [key: string]: unknown;
  };
  inputs: { id: string; name: string }[];
  outputs: { id: string; name: string }[];
}

// Generation types
export interface BaseGeneration {
  id: GenerationId;
  createdAt: number;
  context: GenerationContext;
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
}

export interface CompletedGeneration extends BaseGeneration {
  status: 'completed';
  queuedAt: number;
  startedAt: number;
  completedAt: number;
  result: unknown;
}

export interface FailedGeneration extends BaseGeneration {
  status: 'failed';
  queuedAt?: number;
  startedAt?: number;
  failedAt: number;
  error: string;
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
export function isCreatedGeneration(gen: Generation): gen is CreatedGeneration {
  return gen.status === 'created';
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

export function isCancelledGeneration(gen: Generation): gen is CancelledGeneration {
  return gen.status === 'cancelled';
}

// Task Index for workspace task listing
export interface TaskIndexObject {
  id: TaskId;
  status: TaskStatus;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// Logger interface
export interface TaskLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// Storage interface for persistence
export interface TaskStorage {
  getJson<T>(args: { path: string; schema?: unknown }): Promise<T>;
  setJson<T>(args: { path: string; data: T; schema?: unknown }): Promise<void>;
  deleteJson(args: { path: string }): Promise<void>;
  exists(args: { path: string }): Promise<boolean>;
}

// Task execution context
export interface TaskExecutionContext {
  storage: TaskStorage;
  logger: TaskLogger;
  waitUntil: (fn: () => Promise<void>) => void;
}

// Callbacks for generation lifecycle
export type OnGenerationComplete = (generation: CompletedGeneration) => void | Promise<void>;
export type OnGenerationError = (generation: FailedGeneration) => void | Promise<void>;
