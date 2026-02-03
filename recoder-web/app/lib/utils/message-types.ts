/**
 * Message type definitions for chat and history
 * Provides structured types for different message formats
 */

/**
 * Content type enumeration for message classification
 */
export type ContentType = 'user_message' | 'thinking' | 'plan' | 'files';

/**
 * File type for messages
 */
export type FileType = {
  type: 'file';
  modified: string;
  original: string | null;
  path: string;
  basename: string;
  dirname: string;
  description: string;
  isNew?: boolean;
};

/**
 * File diff type for tracking changes
 */
export type FileDiffType = {
  modified: string;
  original: string | null;
  basename: string;
  dirname: string;
  path: string;
  additions: number;
  deletions: number;
  type: 'edit' | 'create' | 'delete';
};

/**
 * Base user message type
 */
export type UserMessageType = {
  type: 'user';
  message: string;
  planId: string;
  contentType?: ContentType;
  attachment?: {
    key: string;
    name: string;
    type: string;
  };
  /** Optional message content field, functionally identical to message field */
  content?: string;
  /** Optional message ID for identifying the message */
  id?: string;
};

/**
 * Command message type
 */
export type CommandMessageType = {
  type: 'command';
  planId: string;
  command: string;
  packages?: string[];
  description: string;
  contentType?: ContentType;
  /** Command execution output result */
  output?: string;
  /** Optional message ID */
  id?: string;
};

/**
 * Diff message type
 */
export type DiffMessageType = {
  type: 'diff';
  planId: string;
  diff: FileDiffType[];
  contentType?: ContentType;
  /** Optional message ID */
  id?: string;
};

/**
 * Plan message type
 */
export type PlanMessageType = {
  type: 'plan';
  planId: string;
  content: string;
  contentType?: ContentType;
  /** Optional message ID */
  id?: string;
};

/**
 * Thinking message type
 */
export type ThinkingMessageType = {
  type: 'thinking';
  planId: string;
  content: string;
  contentType?: ContentType;
  /** Optional message ID */
  id?: string;
  /** Optional thinking status */
  status?: string;
  /**
   * Nested content object
   * Some thinking messages may use this structure
   */
  data?: {
    content?: string | { text?: string };
  };
};

/**
 * Screenshot message type
 */
export type ScreenshotMessageType = {
  type: 'screenshot';
  planId: string;
  previewUrl: string;
  screenshotKey?: string;
  screenshotTimestamp?: number;
  contentType?: ContentType;
  /** Optional message ID */
  id?: string;
};

/**
 * Timing message type
 */
export type TimingMessageType = {
  type: 'timing';
  planId: string;
  timestamp: number;
  contentType?: ContentType;
  /** Optional message ID */
  id?: string;
};

/**
 * Error message type
 */
export type ErrorMessageType = {
  type: 'error';
  planId: string;
  message: string;
  code?: string;
  recoverable?: boolean;
  contentType?: ContentType;
  id?: string;
};

/**
 * Status message type
 */
export type StatusMessageType = {
  type: 'status';
  planId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
  contentType?: ContentType;
  id?: string;
};

/**
 * Assistant message type (AI response)
 */
export type AssistantMessageType = {
  type: 'assistant';
  planId: string;
  content: string;
  contentType?: ContentType;
  id?: string;
  model?: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
};

/**
 * Union of all message types
 */
export type MessageType =
  | UserMessageType
  | DiffMessageType
  | CommandMessageType
  | PlanMessageType
  | ThinkingMessageType
  | ScreenshotMessageType
  | TimingMessageType
  | ErrorMessageType
  | StatusMessageType
  | AssistantMessageType;

/**
 * History type (array of messages)
 */
export type HistoryType = Array<MessageType>;

/**
 * Type guards for message types
 */
export function isUserMessage(msg: MessageType): msg is UserMessageType {
  return msg.type === 'user';
}

export function isAssistantMessage(msg: MessageType): msg is AssistantMessageType {
  return msg.type === 'assistant';
}

export function isDiffMessage(msg: MessageType): msg is DiffMessageType {
  return msg.type === 'diff';
}

export function isCommandMessage(msg: MessageType): msg is CommandMessageType {
  return msg.type === 'command';
}

export function isPlanMessage(msg: MessageType): msg is PlanMessageType {
  return msg.type === 'plan';
}

export function isThinkingMessage(msg: MessageType): msg is ThinkingMessageType {
  return msg.type === 'thinking';
}

export function isScreenshotMessage(msg: MessageType): msg is ScreenshotMessageType {
  return msg.type === 'screenshot';
}

export function isTimingMessage(msg: MessageType): msg is TimingMessageType {
  return msg.type === 'timing';
}

export function isErrorMessage(msg: MessageType): msg is ErrorMessageType {
  return msg.type === 'error';
}

export function isStatusMessage(msg: MessageType): msg is StatusMessageType {
  return msg.type === 'status';
}

/**
 * Get message content regardless of type
 */
export function getMessageContent(msg: MessageType): string {
  switch (msg.type) {
    case 'user':
      return msg.content || msg.message;
    case 'assistant':
    case 'plan':
    case 'thinking':
      return msg.content;
    case 'command':
      return msg.description;
    case 'error':
      return msg.message;
    case 'status':
      return msg.message || msg.status;
    case 'diff':
      return `${msg.diff.length} file(s) changed`;
    case 'screenshot':
      return `Screenshot: ${msg.previewUrl}`;
    case 'timing':
      return `Timestamp: ${new Date(msg.timestamp).toISOString()}`;
    default:
      return '';
  }
}

/**
 * Create a user message
 */
export function createUserMessage(
  message: string,
  planId: string,
  options?: Partial<Omit<UserMessageType, 'type' | 'message' | 'planId'>>
): UserMessageType {
  return {
    type: 'user',
    message,
    planId,
    ...options,
  };
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(
  content: string,
  planId: string,
  options?: Partial<Omit<AssistantMessageType, 'type' | 'content' | 'planId'>>
): AssistantMessageType {
  return {
    type: 'assistant',
    content,
    planId,
    ...options,
  };
}

/**
 * Create an error message
 */
export function createErrorMessage(
  message: string,
  planId: string,
  options?: Partial<Omit<ErrorMessageType, 'type' | 'message' | 'planId'>>
): ErrorMessageType {
  return {
    type: 'error',
    message,
    planId,
    recoverable: true,
    ...options,
  };
}

/**
 * Create a thinking message
 */
export function createThinkingMessage(
  content: string,
  planId: string,
  options?: Partial<Omit<ThinkingMessageType, 'type' | 'content' | 'planId'>>
): ThinkingMessageType {
  return {
    type: 'thinking',
    content,
    planId,
    ...options,
  };
}

/**
 * Create a diff message
 */
export function createDiffMessage(
  diff: FileDiffType[],
  planId: string,
  options?: Partial<Omit<DiffMessageType, 'type' | 'diff' | 'planId'>>
): DiffMessageType {
  return {
    type: 'diff',
    diff,
    planId,
    ...options,
  };
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Filter messages by type
 */
export function filterMessagesByType<T extends MessageType>(
  messages: MessageType[],
  type: T['type']
): T[] {
  return messages.filter((msg) => msg.type === type) as T[];
}

/**
 * Get the latest message of a specific type
 */
export function getLatestMessageOfType<T extends MessageType>(
  messages: MessageType[],
  type: T['type']
): T | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === type) {
      return messages[i] as T;
    }
  }
  return undefined;
}

/**
 * Count messages by type
 */
export function countMessagesByType(
  messages: MessageType[]
): Record<MessageType['type'], number> {
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    counts[msg.type] = (counts[msg.type] || 0) + 1;
  }
  return counts as Record<MessageType['type'], number>;
}
