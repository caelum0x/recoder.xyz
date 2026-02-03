import { createHmac, timingSafeEqual } from "crypto";
import { GitHubWebhookUnauthorizedError } from "./errors";

/**
 * Webhook event types from GitHub
 */
export type WebhookEventName =
  | "branch_protection_rule"
  | "check_run"
  | "check_suite"
  | "code_scanning_alert"
  | "commit_comment"
  | "create"
  | "delete"
  | "deployment"
  | "deployment_status"
  | "discussion"
  | "discussion_comment"
  | "fork"
  | "gollum"
  | "installation"
  | "installation_repositories"
  | "issue_comment"
  | "issues"
  | "label"
  | "member"
  | "membership"
  | "milestone"
  | "organization"
  | "org_block"
  | "package"
  | "page_build"
  | "ping"
  | "project"
  | "project_card"
  | "project_column"
  | "public"
  | "pull_request"
  | "pull_request_review"
  | "pull_request_review_comment"
  | "pull_request_review_thread"
  | "push"
  | "release"
  | "repository"
  | "repository_dispatch"
  | "repository_import"
  | "repository_vulnerability_alert"
  | "secret_scanning_alert"
  | "security_advisory"
  | "star"
  | "status"
  | "team"
  | "team_add"
  | "watch"
  | "workflow_dispatch"
  | "workflow_job"
  | "workflow_run";

/**
 * Generic webhook event structure
 */
export interface WebhookEvent<T = unknown> {
  name: WebhookEventName;
  payload: T;
  id: string;
  signature: string;
}

/**
 * Type guard to check if an unknown value is a WebhookEvent
 */
export function isWebhookEvent(value: unknown): value is WebhookEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    "name" in obj &&
    typeof obj.name === "string" &&
    "payload" in obj &&
    typeof obj.payload === "object" &&
    obj.payload !== null
  );
}

/**
 * Verify a GitHub webhook signature
 */
function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const sig = Buffer.from(signature);
  const computed = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`
  );

  if (sig.length !== computed.length) {
    return false;
  }

  return timingSafeEqual(sig, computed);
}

/**
 * Verify a GitHub webhook request
 */
export async function verifyWebhookRequest(args: {
  secret: string;
  request: Request;
}): Promise<void> {
  const { secret, request } = args;

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const body = await request.clone().text();

  const verified = verifySignature(body, signature, secret);

  if (!verified) {
    throw new GitHubWebhookUnauthorizedError({
      message: "Invalid webhook signature",
    });
  }
}

/**
 * Parse a webhook request into an event
 */
export async function parseWebhookRequest(
  request: Request
): Promise<WebhookEvent> {
  const eventName = request.headers.get("x-github-event") as WebhookEventName;
  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const payload = await request.clone().json();

  return {
    name: eventName,
    payload,
    id: deliveryId,
    signature,
  };
}

/**
 * Handle a webhook request with verified signature and event handlers
 */
export async function handleWebhook(args: {
  secret: string;
  request: Request;
  handlers: Partial<Record<WebhookEventName, (event: WebhookEvent) => Promise<void>>>;
}): Promise<void> {
  const { secret, request, handlers } = args;

  // Verify the signature
  await verifyWebhookRequest({ secret, request });

  // Parse the event
  const event = await parseWebhookRequest(request);

  // Find and execute the handler
  const handler = handlers[event.name];
  if (handler) {
    await handler(event);
  }
}

/**
 * Create a webhook handler with type safety
 */
export function createWebhookHandler<T extends WebhookEventName>(
  eventName: T,
  handler: (event: WebhookEvent) => Promise<void>
) {
  return {
    eventName,
    handler,
  };
}

/**
 * Webhook payload types for common events
 */
export interface IssueWebhookPayload {
  action: "opened" | "edited" | "deleted" | "pinned" | "unpinned" | "closed" | "reopened" | "assigned" | "unassigned" | "labeled" | "unlabeled" | "locked" | "unlocked" | "transferred" | "milestoned" | "demilestoned";
  issue: {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    user: {
      login: string;
      id: number;
    };
    labels: Array<{
      id: number;
      name: string;
      color: string;
    }>;
    assignees: Array<{
      login: string;
      id: number;
    }>;
    milestone: {
      id: number;
      number: number;
      title: string;
    } | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
  };
  sender: {
    login: string;
    id: number;
  };
}

export interface PullRequestWebhookPayload {
  action: "opened" | "edited" | "closed" | "reopened" | "assigned" | "unassigned" | "review_requested" | "review_request_removed" | "labeled" | "unlabeled" | "synchronize" | "converted_to_draft" | "ready_for_review" | "locked" | "unlocked" | "auto_merge_enabled" | "auto_merge_disabled";
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    merged: boolean;
    merged_at: string | null;
    user: {
      login: string;
      id: number;
    };
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
    labels: Array<{
      id: number;
      name: string;
      color: string;
    }>;
    assignees: Array<{
      login: string;
      id: number;
    }>;
    requested_reviewers: Array<{
      login: string;
      id: number;
    }>;
    draft: boolean;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
  };
  sender: {
    login: string;
    id: number;
  };
}

export interface PullRequestReviewWebhookPayload {
  action: "submitted" | "edited" | "dismissed";
  review: {
    id: number;
    user: {
      login: string;
      id: number;
    };
    body: string | null;
    state: "approved" | "changes_requested" | "commented" | "dismissed" | "pending";
    submitted_at: string;
  };
  pull_request: {
    id: number;
    number: number;
    title: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
  };
  sender: {
    login: string;
    id: number;
  };
}

export interface IssueCommentWebhookPayload {
  action: "created" | "edited" | "deleted";
  issue: {
    id: number;
    number: number;
    title: string;
    state: "open" | "closed";
  };
  comment: {
    id: number;
    user: {
      login: string;
      id: number;
    };
    body: string;
    created_at: string;
    updated_at: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
  };
  sender: {
    login: string;
    id: number;
  };
}

export interface PushWebhookPayload {
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
    message: string;
    timestamp: string;
    author: {
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
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
  } | null;
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      id: number;
    };
  };
  pusher: {
    name: string;
    email: string;
  };
  sender: {
    login: string;
    id: number;
  };
}
