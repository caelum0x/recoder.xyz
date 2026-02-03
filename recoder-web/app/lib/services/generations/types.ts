/**
 * Generation Types
 * Core type definitions for the content generation system
 */

import type { z } from 'zod';

// =============================================================================
// ID Types
// =============================================================================

export type GenerationId = string & { readonly __brand: 'GenerationId' };
export type NodeId = string & { readonly __brand: 'NodeId' };
export type OutputId = string & { readonly __brand: 'OutputId' };
export type TaskId = string & { readonly __brand: 'TaskId' };
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };
export type FileId = string & { readonly __brand: 'FileId' };
export type ImageId = string & { readonly __brand: 'ImageId' };
export type SecretId = string & { readonly __brand: 'SecretId' };

// ID Generators
let idCounter = 0;
const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const counter = (idCounter++).toString(36);
  return `${prefix}_${timestamp}${random}${counter}`;
};

export const GenerationIdGenerator = {
  generate: (): GenerationId => generateId('gen') as GenerationId,
  parse: (id: string): GenerationId => id as GenerationId,
};

export const NodeIdGenerator = {
  generate: (): NodeId => generateId('nd') as NodeId,
  parse: (id: string): NodeId => id as NodeId,
};

export const OutputIdGenerator = {
  generate: (): OutputId => generateId('otp') as OutputId,
  parse: (id: string): OutputId => id as OutputId,
};

export const TaskIdGenerator = {
  generate: (): TaskId => generateId('tsk') as TaskId,
  parse: (id: string): TaskId => id as TaskId,
};

export const ImageIdGenerator = {
  generate: (): ImageId => generateId('img') as ImageId,
  parse: (id: string): ImageId => id as ImageId,
};

// =============================================================================
// Generation Status Types
// =============================================================================

export type GenerationStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// =============================================================================
// Base Generation Types
// =============================================================================

export interface GenerationError {
  name: string;
  message: string;
  dump?: unknown;
}

export interface GenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export interface GenerationOutput {
  type: 'generated-text' | 'generated-image' | 'reasoning' | 'source' | 'query-result';
  outputId: OutputId;
  content?: string;
  contents?: Image[];
  sources?: unknown[];
}

export interface Image {
  id: ImageId;
  contentType: string;
  filename: string;
  pathname: string;
}

// =============================================================================
// Message Types
// =============================================================================

export interface MessagePart {
  type: 'text' | 'file' | 'image';
  text?: string;
  data?: Uint8Array | ArrayBuffer;
  filename?: string;
  mediaType?: string;
  image?: Uint8Array;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessagePart[];
  createdAt?: Date;
}

export interface ModelMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | MessagePart[];
}

// =============================================================================
// Generation Context Types
// =============================================================================

export type GenerationOriginType = 'studio' | 'api' | 'stage' | 'github-app';

export interface GenerationOrigin {
  type: GenerationOriginType;
  workspaceId: WorkspaceId;
  taskId?: TaskId;
}

export interface NodeOutput {
  id: OutputId;
  accessor: string;
  label?: string;
}

export interface Node {
  id: NodeId;
  type: string;
  outputs: NodeOutput[];
  content: NodeContent;
}

export type NodeContentType =
  | 'text'
  | 'textGeneration'
  | 'contentGeneration'
  | 'imageGeneration'
  | 'file'
  | 'webPage'
  | 'query'
  | 'action'
  | 'trigger'
  | 'end'
  | 'appEntry'
  | 'dataStore'
  | 'dataQuery'
  | 'github'
  | 'vectorStore';

export interface NodeContent {
  type: NodeContentType;
  text?: string;
  prompt?: string;
  llm?: LanguageModelData;
  languageModel?: ContentLanguageModel;
  tools?: ToolConfiguration[];
  category?: 'text' | 'image' | 'pdf';
  files?: FileData[];
  webpages?: WebPageData[];
  state?: { status: string; dataStoreId?: string };
}

export interface FileData {
  id: FileId;
  name: string;
  type: string;
  status: 'uploaded' | 'pending' | 'error';
  originalFileIdForCopy?: FileId;
}

export interface WebPageData {
  title: string;
  url: string;
  status: 'fetched' | 'pending' | 'error';
  fileId?: FileId;
}

// =============================================================================
// Language Model Types
// =============================================================================

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'fal' | 'perplexity';

export interface LanguageModelData {
  id: string;
  provider: LLMProvider;
  configurations: Record<string, unknown>;
}

export interface ContentLanguageModel {
  id: string;
  provider: LLMProvider;
  configuration: Record<string, unknown>;
}

export interface ToolConfiguration {
  name: string;
  configuration: Record<string, unknown>;
}

// =============================================================================
// Generation Context
// =============================================================================

export interface GenerationContext {
  origin: GenerationOrigin;
  operationNode: Node;
  sourceNodes: Node[];
  inputs?: GenerationInput[];
}

export interface GenerationInput {
  type: 'parameters' | 'text' | 'files';
  items: ParameterItem[];
}

export interface ParameterItem {
  name: string;
  type: 'string' | 'number' | 'files';
  value: unknown;
}

// =============================================================================
// Generation State Types
// =============================================================================

export interface BaseGeneration {
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
  startedAt: number;
  messages: Message[];
}

export interface CompletedGeneration extends BaseGeneration {
  status: 'completed';
  startedAt: number;
  completedAt: number;
  messages: Message[];
  outputs: GenerationOutput[];
  usage?: GenerationUsage;
}

export interface FailedGeneration extends BaseGeneration {
  status: 'failed';
  startedAt?: number;
  failedAt: number;
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

// =============================================================================
// Generation Index Types
// =============================================================================

export interface NodeGenerationIndex {
  id: GenerationId;
  nodeId: NodeId;
  status: GenerationStatus;
  createdAt: number;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  cancelledAt?: number;
}

// =============================================================================
// Type Guards
// =============================================================================

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

export function isTextGenerationNode(node: Node): boolean {
  return node.content.type === 'textGeneration';
}

export function isContentGenerationNode(node: Node): boolean {
  return node.content.type === 'contentGeneration';
}

export function isImageGenerationNode(node: Node): boolean {
  return node.content.type === 'imageGeneration';
}

// =============================================================================
// Callback Types
// =============================================================================

export interface GenerationMetadata {
  [key: string]: string | number | GenerationMetadata | null | undefined;
}

export interface OnGenerationCompleteEvent {
  generation: CompletedGeneration;
  inputMessages: ModelMessage[];
  outputFileBlobs: OutputFileBlob[];
  providerMetadata?: unknown;
  generationMetadata?: GenerationMetadata;
}

export interface OnGenerationErrorEvent {
  generation: FailedGeneration;
  inputMessages: ModelMessage[];
  generationMetadata?: GenerationMetadata;
}

export type OnGenerationComplete = (event: OnGenerationCompleteEvent) => void | Promise<void>;
export type OnGenerationError = (event: OnGenerationErrorEvent) => void | Promise<void>;

export interface OutputFileBlob {
  id: ImageId;
  outputId: OutputId;
  contentType: string;
  bytes: Uint8Array;
}

// =============================================================================
// Storage Types
// =============================================================================

export interface GenerationStorage {
  exists(path: string): Promise<boolean>;
  getJson<T>(params: { path: string; schema?: unknown }): Promise<T>;
  setJson<T>(params: { path: string; data: T; schema?: unknown }): Promise<void>;
  getBlob(path: string, options?: { range?: { start?: number; end?: number } }): Promise<Uint8Array>;
  setBlob(path: string, data: Uint8Array): Promise<void>;
  contentLength(path: string): Promise<number>;
}

// =============================================================================
// Context Types
// =============================================================================

export interface GenerationLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(error: Error | string, message?: string): void;
}

export interface GenerationContextConfig {
  storage: GenerationStorage;
  logger: GenerationLogger;
  vault?: {
    decrypt(token: string): Promise<string | undefined>;
  };
  waitUntil?: (fn: () => Promise<void>) => void;
  fetchUsageLimitsFn?: (workspaceId: WorkspaceId) => Promise<UsageLimits>;
  onConsumeAgentTime?: (
    workspaceId: WorkspaceId,
    startedAt: number,
    completedAt: number,
    durationMs: number,
  ) => Promise<void>;
  callbacks?: {
    buildAiGatewayHeaders?: (params: {
      generation: RunningGeneration;
      metadata?: GenerationMetadata;
    }) => Promise<Record<string, string> | undefined>;
  };
  generateContentProcess?: {
    type: 'self' | 'external';
    process?: (params: {
      context: GenerationContextConfig;
      generation: RunningGeneration;
      metadata?: GenerationMetadata;
    }) => Promise<void>;
  };
}

export interface UsageLimits {
  featureTier: string;
  resourceLimits: {
    agentTime: {
      used: number;
      limit: number;
    };
  };
}

// =============================================================================
// Tool Types
// =============================================================================

export interface PreparedToolSet {
  toolSet: Record<string, unknown>;
  cleanupFunctions: Array<() => void | Promise<void>>;
}

export type DataContent = Uint8Array | ArrayBuffer | string;

export interface FilePart {
  type: 'file';
  data: DataContent;
  filename: string;
  mediaType: string;
}

export interface ImagePart {
  type: 'image';
  image: DataContent;
  mediaType?: string;
}

export interface TextPart {
  type: 'text';
  text: string;
}

export type AppEntryResolver = (
  nodeId: NodeId,
  outputId: OutputId,
) => Promise<(TextPart | FilePart | ImagePart)[]>;

export type FileResolver = (fileId: FileId) => Promise<DataContent>;

export type GenerationContentResolver = (
  nodeId: NodeId,
  outputId: OutputId,
) => Promise<string | undefined>;

export type ImageGenerationResolver = (
  nodeId: NodeId,
  outputId: OutputId,
) => Promise<ImagePart[] | undefined>;
