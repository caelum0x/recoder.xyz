import { z } from 'zod';

/**
 * Metadata for payload fields - describes how to render inputs in the UI
 */
export interface PayloadFieldMeta {
  label?: string;
  input?: {
    multiline?: boolean;
  };
}

/**
 * Input field data for rendering forms
 */
export interface InputData {
  key: string;
  label: string;
  optional?: boolean;
  type: 'text' | 'multiline-text' | 'number';
}

/**
 * Generic GitHub event definition
 */
export interface GitHubEvent<T extends z.ZodRawShape = z.ZodRawShape> {
  id: string;
  label: string;
  payload: z.ZodObject<T>;
  meta?: Record<string, PayloadFieldMeta>;
}

/**
 * Trigger provider entry in the registry
 */
export interface TriggerEntry {
  provider: string;
  label: string;
  events: Record<string, GitHubEvent> | readonly never[];
}

/**
 * GitHub webhook payload base shape
 */
export interface GitHubWebhookPayload {
  action?: string;
  sender?: {
    login: string;
    id: number;
    avatar_url?: string;
  };
  repository?: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
    private: boolean;
    html_url: string;
  };
  organization?: {
    login: string;
    id: number;
  };
}

/**
 * GitHub issue webhook payload
 */
export interface GitHubIssuePayload extends GitHubWebhookPayload {
  issue: {
    number: number;
    title: string;
    body: string | null;
    state: string;
    user: {
      login: string;
      id: number;
    };
    labels: Array<{
      id: number;
      name: string;
      color: string;
    }>;
    html_url: string;
    created_at: string;
    updated_at: string;
  };
  label?: {
    id: number;
    name: string;
    color: string;
  };
}

/**
 * GitHub issue comment webhook payload
 */
export interface GitHubIssueCommentPayload extends GitHubWebhookPayload {
  issue: GitHubIssuePayload['issue'];
  comment: {
    id: number;
    body: string;
    user: {
      login: string;
      id: number;
    };
    html_url: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * GitHub pull request webhook payload
 */
export interface GitHubPullRequestPayload extends GitHubWebhookPayload {
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    state: string;
    merged: boolean;
    draft: boolean;
    user: {
      login: string;
      id: number;
    };
    labels: Array<{
      id: number;
      name: string;
      color: string;
    }>;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
    html_url: string;
    diff_url: string;
    created_at: string;
    updated_at: string;
    merged_at: string | null;
  };
  label?: {
    id: number;
    name: string;
    color: string;
  };
}

/**
 * GitHub pull request review comment webhook payload
 */
export interface GitHubPullRequestReviewCommentPayload extends GitHubWebhookPayload {
  pull_request: GitHubPullRequestPayload['pull_request'];
  comment: {
    id: number;
    body: string;
    diff_hunk: string;
    path: string;
    position: number | null;
    original_position: number;
    commit_id: string;
    original_commit_id: string;
    user: {
      login: string;
      id: number;
    };
    html_url: string;
    created_at: string;
    updated_at: string;
    in_reply_to_id?: number;
  };
}

/**
 * GitHub discussion webhook payload
 */
export interface GitHubDiscussionPayload extends GitHubWebhookPayload {
  discussion: {
    number: number;
    title: string;
    body: string;
    state: string;
    category: {
      id: number;
      name: string;
      slug: string;
    };
    user: {
      login: string;
      id: number;
    };
    html_url: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * GitHub discussion comment webhook payload
 */
export interface GitHubDiscussionCommentPayload extends GitHubWebhookPayload {
  discussion: GitHubDiscussionPayload['discussion'];
  comment: {
    id: number;
    body: string;
    user: {
      login: string;
      id: number;
    };
    html_url: string;
    created_at: string;
    updated_at: string;
    parent_id?: number;
  };
}

/**
 * GitHub push webhook payload
 */
export interface GitHubPushPayload extends GitHubWebhookPayload {
  ref: string;
  before: string;
  after: string;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  base_ref: string | null;
  compare: string;
  commits: Array<{
    id: string;
    tree_id: string;
    distinct: boolean;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  head_commit: {
    id: string;
    tree_id: string;
    distinct: boolean;
    message: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    committer: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  } | null;
  pusher: {
    name: string;
    email: string;
  };
}

/**
 * Supported GitHub event types for webhooks
 */
export type GitHubWebhookEventType =
  | 'push'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'issues'
  | 'issue_comment'
  | 'discussion'
  | 'discussion_comment'
  | 'create'
  | 'delete'
  | 'fork'
  | 'star'
  | 'watch'
  | 'release'
  | 'workflow_run'
  | 'check_run'
  | 'check_suite'
  | 'deployment'
  | 'deployment_status';

/**
 * Manual trigger payload
 */
export interface ManualTriggerPayload {
  triggeredBy: string;
  triggeredAt: string;
  parameters?: Record<string, unknown>;
}

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}
