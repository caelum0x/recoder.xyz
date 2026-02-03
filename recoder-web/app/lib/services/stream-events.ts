/**
 * Typed stream events for the AI generation pipeline.
 * Adapted from giselle's discriminated union pattern.
 *
 * Uses pure TypeScript discriminated unions (no runtime dependencies)
 * to provide type-safe event handling across the streaming pipeline.
 */

// Event types for the generation pipeline
export type StreamEventType =
  | 'connected'
  | 'text_delta'
  | 'artifact_start'
  | 'artifact_end'
  | 'action_start'
  | 'action_end'
  | 'action_status'
  | 'compile_check'
  | 'error'
  | 'done';

interface BaseEvent {
  type: StreamEventType;
  timestamp: number;
  messageId?: string;
}

export interface ConnectedEvent extends BaseEvent {
  type: 'connected';
  sessionId: string;
}

export interface TextDeltaEvent extends BaseEvent {
  type: 'text_delta';
  content: string;
}

export interface ArtifactStartEvent extends BaseEvent {
  type: 'artifact_start';
  artifactId: string;
  title: string;
}

export interface ArtifactEndEvent extends BaseEvent {
  type: 'artifact_end';
  artifactId: string;
}

export interface ActionStartEvent extends BaseEvent {
  type: 'action_start';
  actionId: string;
  actionType: 'file' | 'shell';
  filePath?: string;
}

export interface ActionEndEvent extends BaseEvent {
  type: 'action_end';
  actionId: string;
  success: boolean;
  error?: string;
}

export interface ActionStatusEvent extends BaseEvent {
  type: 'action_status';
  actionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number; // 0-100
}

export interface CompileCheckEvent extends BaseEvent {
  type: 'compile_check';
  status: 'checking' | 'clean' | 'errors';
  errors?: string[];
  filesChecked?: number;
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  category: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  suggestion?: string;
}

export interface DoneEvent extends BaseEvent {
  type: 'done';
  totalActions: number;
  successfulActions: number;
  failedActions: number;
}

export type StreamEvent =
  | ConnectedEvent
  | TextDeltaEvent
  | ArtifactStartEvent
  | ArtifactEndEvent
  | ActionStartEvent
  | ActionEndEvent
  | ActionStatusEvent
  | CompileCheckEvent
  | ErrorEvent
  | DoneEvent;

// Type guard helpers
export function isErrorEvent(event: StreamEvent): event is ErrorEvent {
  return event.type === 'error';
}

export function isActionEvent(
  event: StreamEvent,
): event is ActionStartEvent | ActionEndEvent | ActionStatusEvent {
  return (
    event.type === 'action_start' ||
    event.type === 'action_end' ||
    event.type === 'action_status'
  );
}

// Event factory
export function createStreamEvent<T extends StreamEvent['type']>(
  type: T,
  data: Omit<Extract<StreamEvent, { type: T }>, 'type' | 'timestamp'>,
): Extract<StreamEvent, { type: T }> {
  return {
    type,
    timestamp: Date.now(),
    ...data,
  } as Extract<StreamEvent, { type: T }>;
}

// Event emitter for stream events
type EventHandler = (event: StreamEvent) => void;

export class StreamEventEmitter {
  private handlers: Map<StreamEventType | '*', Set<EventHandler>> = new Map();

  on(type: StreamEventType | '*', handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  emit(event: StreamEvent): void {
    // Call specific handlers
    this.handlers.get(event.type)?.forEach((h) => h(event));
    // Call wildcard handlers
    this.handlers.get('*')?.forEach((h) => h(event));
  }

  clear(): void {
    this.handlers.clear();
  }
}

// Singleton for the global stream event bus
let _globalEmitter: StreamEventEmitter | null = null;

export function getStreamEventEmitter(): StreamEventEmitter {
  if (!_globalEmitter) {
    _globalEmitter = new StreamEventEmitter();
  }
  return _globalEmitter;
}
