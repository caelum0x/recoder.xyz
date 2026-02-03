import { z } from 'zod';

/**
 * Base action interface that all actions must implement
 */
export interface ActionDefinition<TPayload extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  /** Unique identifier for the action (e.g., "github.create.issue") */
  id: string;
  /** Human-readable label for the action */
  label: string;
  /** Description of what the action does */
  description?: string;
  /** Zod schema defining the action's payload */
  payload: TPayload;
}

/**
 * Action execution context
 */
export interface ActionContext {
  /** GitHub access token for authenticated requests */
  githubToken?: string;
  /** Repository owner (organization or user) */
  owner?: string;
  /** Repository name */
  repo?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of an action execution
 */
export interface ActionResult<T = unknown> {
  /** Whether the action was successful */
  success: boolean;
  /** The data returned by the action */
  data?: T;
  /** Error message if the action failed */
  error?: string;
  /** Additional details about the error */
  errorDetails?: unknown;
}

/**
 * Action executor function type
 */
export type ActionExecutor<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  context: ActionContext
) => Promise<ActionResult<TResult>>;

/**
 * Input field metadata for UI rendering
 */
export interface InputField {
  /** Field key in the payload */
  key: string;
  /** Human-readable label */
  label: string;
  /** Whether the field is optional */
  optional: boolean;
  /** Input type hint */
  type: 'text' | 'number' | 'textarea' | 'select';
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Registered action with executor
 */
export interface RegisteredAction<TPayload extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  definition: ActionDefinition<TPayload>;
  execute: ActionExecutor<z.infer<TPayload>>;
  getInputFields: () => InputField[];
}

/**
 * Action provider configuration
 */
export interface ActionProvider {
  /** Provider identifier (e.g., "github") */
  id: string;
  /** Provider display name */
  label: string;
  /** Provider description */
  description?: string;
  /** Icon identifier for UI */
  icon?: string;
  /** Map of action IDs to registered actions */
  actions: Record<string, RegisteredAction>;
}

/**
 * GitHub-specific types
 */

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  } | null;
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
}

export interface GitHubComment {
  id: number;
  body: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  } | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  user: {
    login: string;
    avatar_url: string;
  } | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
}

export interface GitHubDiscussion {
  id: string;
  number: number;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
  category: {
    id: string;
    name: string;
    emoji: string;
  };
}

export interface GitHubReaction {
  id: number;
  content: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes';
  user: {
    login: string;
    avatar_url: string;
  } | null;
}
