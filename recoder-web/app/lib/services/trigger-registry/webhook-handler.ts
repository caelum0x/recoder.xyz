import {
  githubEvents,
  isGitHubEventId,
  type GitHubEventId,
} from './github';
import type {
  GitHubDiscussionCommentPayload,
  GitHubDiscussionPayload,
  GitHubIssueCommentPayload,
  GitHubIssuePayload,
  GitHubPullRequestPayload,
  GitHubPullRequestReviewCommentPayload,
  GitHubPushPayload,
  GitHubWebhookPayload,
} from './types';
import {
  parseGitHubWebhookHeaders,
  validateGitHubWebhook,
  type GitHubWebhookHeaders,
} from './webhook-verification';

/**
 * Result of processing a GitHub webhook
 */
export interface WebhookProcessResult {
  success: boolean;
  eventId?: GitHubEventId;
  payload?: Record<string, unknown>;
  error?: string;
  raw?: unknown;
}

/**
 * Map GitHub webhook event + action to our internal event ID
 */
function mapGitHubEventToInternalId(
  event: string,
  action: string | undefined,
  payload: GitHubWebhookPayload
): GitHubEventId | null {
  switch (event) {
    case 'issues':
      switch (action) {
        case 'opened':
          return 'github.issue.created';
        case 'closed':
          return 'github.issue.closed';
        case 'reopened':
          return 'github.issue.reopened';
        case 'labeled':
          return 'github.issue.labeled';
        case 'unlabeled':
          return 'github.issue.unlabeled';
        case 'assigned':
          return 'github.issue.assigned';
        default:
          return null;
      }

    case 'issue_comment':
      // Check if this is a PR comment (issue_comment on a PR)
      const issueCommentPayload = payload as GitHubIssueCommentPayload;
      const isPullRequest = 'pull_request' in (issueCommentPayload.issue || {});

      if (isPullRequest) {
        switch (action) {
          case 'created':
            return 'github.pull_request_comment.created';
          default:
            return null;
        }
      }

      switch (action) {
        case 'created':
          return 'github.issue_comment.created';
        case 'edited':
          return 'github.issue_comment.edited';
        default:
          return null;
      }

    case 'pull_request':
      switch (action) {
        case 'opened':
          return 'github.pull_request.opened';
        case 'closed':
          // Check if merged
          const prPayload = payload as GitHubPullRequestPayload;
          if (prPayload.pull_request?.merged) {
            return 'github.pull_request.merged';
          }
          return 'github.pull_request.closed';
        case 'ready_for_review':
          return 'github.pull_request.ready_for_review';
        case 'labeled':
          return 'github.pull_request.labeled';
        case 'synchronize':
          return 'github.pull_request.synchronize';
        default:
          return null;
      }

    case 'pull_request_review_comment':
      switch (action) {
        case 'created':
          return 'github.pull_request_review_comment.created';
        default:
          return null;
      }

    case 'discussion':
      switch (action) {
        case 'created':
          return 'github.discussion.created';
        default:
          return null;
      }

    case 'discussion_comment':
      switch (action) {
        case 'created':
          return 'github.discussion_comment.created';
        default:
          return null;
      }

    case 'push':
      return 'github.push';

    case 'release':
      switch (action) {
        case 'published':
          return 'github.release.published';
        case 'created':
          return 'github.release.created';
        default:
          return null;
      }

    case 'workflow_run':
      switch (action) {
        case 'completed':
          return 'github.workflow_run.completed';
        default:
          return null;
      }

    case 'check_run':
      switch (action) {
        case 'completed':
          return 'github.check_run.completed';
        default:
          return null;
      }

    default:
      return null;
  }
}

/**
 * Transform raw GitHub webhook payload to our normalized payload format
 */
function transformPayload(
  eventId: GitHubEventId,
  rawPayload: GitHubWebhookPayload
): Record<string, unknown> {
  switch (eventId) {
    // Issue events
    case 'github.issue.created':
    case 'github.issue.closed':
    case 'github.issue.reopened': {
      const p = rawPayload as GitHubIssuePayload;
      return {
        issueNumber: p.issue.number,
        title: p.issue.title,
        body: p.issue.body || undefined,
      };
    }

    case 'github.issue.labeled':
    case 'github.issue.unlabeled': {
      const p = rawPayload as GitHubIssuePayload;
      return {
        issueNumber: p.issue.number,
        title: p.issue.title,
        body: p.issue.body || undefined,
        labelName: p.label?.name || '',
      };
    }

    case 'github.issue.assigned': {
      const p = rawPayload as GitHubIssuePayload & { assignee?: { login: string } };
      return {
        issueNumber: p.issue.number,
        title: p.issue.title,
        body: p.issue.body || undefined,
        assignee: p.assignee?.login || '',
      };
    }

    // Issue comment events
    case 'github.issue_comment.created':
    case 'github.issue_comment.edited': {
      const p = rawPayload as GitHubIssueCommentPayload;
      return {
        issueNumber: p.issue.number,
        issueTitle: p.issue.title,
        issueBody: p.issue.body || undefined,
        body: p.comment.body || undefined,
        commentId: p.comment.id,
        authorUsername: p.comment.user.login,
      };
    }

    // Pull request events
    case 'github.pull_request.opened':
    case 'github.pull_request.ready_for_review': {
      const p = rawPayload as GitHubPullRequestPayload;
      return {
        title: p.pull_request.title,
        body: p.pull_request.body || undefined,
        number: p.pull_request.number,
        diff: '', // Would need to fetch from diff_url
        pullRequestUrl: p.pull_request.html_url,
        headRef: p.pull_request.head.ref,
        baseRef: p.pull_request.base.ref,
        authorUsername: p.pull_request.user.login,
      };
    }

    case 'github.pull_request.closed': {
      const p = rawPayload as GitHubPullRequestPayload;
      return {
        title: p.pull_request.title,
        body: p.pull_request.body || undefined,
        number: p.pull_request.number,
        diff: '',
        pullRequestUrl: p.pull_request.html_url,
        merged: p.pull_request.merged,
      };
    }

    case 'github.pull_request.merged': {
      const p = rawPayload as GitHubPullRequestPayload & { sender?: { login: string } };
      return {
        title: p.pull_request.title,
        body: p.pull_request.body || undefined,
        number: p.pull_request.number,
        diff: '',
        pullRequestUrl: p.pull_request.html_url,
        mergedBy: p.sender?.login || '',
        mergedAt: p.pull_request.merged_at || new Date().toISOString(),
      };
    }

    case 'github.pull_request.labeled': {
      const p = rawPayload as GitHubPullRequestPayload;
      return {
        pullRequestTitle: p.pull_request.title,
        pullRequestBody: p.pull_request.body || undefined,
        pullRequestNumber: p.pull_request.number,
        labelName: p.label?.name || '',
      };
    }

    case 'github.pull_request.synchronize': {
      const p = rawPayload as GitHubPullRequestPayload & { before?: string; after?: string };
      return {
        title: p.pull_request.title,
        body: p.pull_request.body || undefined,
        number: p.pull_request.number,
        diff: '',
        pullRequestUrl: p.pull_request.html_url,
        before: p.before || '',
        after: p.after || '',
      };
    }

    // Pull request comment events
    case 'github.pull_request_comment.created': {
      const p = rawPayload as GitHubIssueCommentPayload;
      return {
        issueNumber: p.issue.number,
        issueTitle: p.issue.title,
        issueBody: p.issue.body || undefined,
        body: p.comment.body || undefined,
        diff: '',
        commentId: p.comment.id,
        authorUsername: p.comment.user.login,
      };
    }

    case 'github.pull_request_review_comment.created': {
      const p = rawPayload as GitHubPullRequestReviewCommentPayload;
      return {
        id: p.comment.id,
        body: p.comment.body,
        diff: p.comment.diff_hunk,
        previousCommentBody: '', // Would need to fetch if in_reply_to_id exists
        pullRequestNumber: p.pull_request.number,
        pullRequestTitle: p.pull_request.title,
        pullRequestBody: p.pull_request.body || undefined,
        path: p.comment.path,
        position: p.comment.position || p.comment.original_position,
      };
    }

    // Discussion events
    case 'github.discussion.created': {
      const p = rawPayload as GitHubDiscussionPayload;
      return {
        discussionNumber: p.discussion.number,
        discussionTitle: p.discussion.title,
        discussionBody: p.discussion.body,
        discussionUrl: p.discussion.html_url,
        categoryName: p.discussion.category.name,
        authorUsername: p.discussion.user.login,
      };
    }

    case 'github.discussion_comment.created': {
      const p = rawPayload as GitHubDiscussionCommentPayload;
      return {
        body: p.comment.body,
        discussionNumber: p.discussion.number,
        discussionTitle: p.discussion.title,
        discussionBody: p.discussion.body,
        discussionUrl: p.discussion.html_url,
        commentId: p.comment.id,
        parentCommentBody: '', // Would need to fetch if parent_id exists
        authorUsername: p.comment.user.login,
      };
    }

    // Push events
    case 'github.push': {
      const p = rawPayload as GitHubPushPayload;
      return {
        ref: p.ref,
        before: p.before,
        after: p.after,
        compareUrl: p.compare,
        commits: p.commits.map((c) => ({
          id: c.id,
          message: c.message,
          author: c.author.name,
          timestamp: c.timestamp,
          added: c.added,
          removed: c.removed,
          modified: c.modified,
        })),
        headCommitMessage: p.head_commit?.message || undefined,
        pusherName: p.pusher.name,
        pusherEmail: p.pusher.email,
        forced: p.forced,
      };
    }

    // Release events
    case 'github.release.published':
    case 'github.release.created': {
      const p = rawPayload as GitHubWebhookPayload & {
        release: {
          tag_name: string;
          name: string;
          body: string | null;
          draft: boolean;
          prerelease: boolean;
          html_url: string;
          author: { login: string };
        };
      };
      return {
        tagName: p.release.tag_name,
        name: p.release.name,
        body: p.release.body || undefined,
        draft: p.release.draft,
        prerelease: p.release.prerelease,
        htmlUrl: p.release.html_url,
        authorUsername: p.release.author.login,
      };
    }

    // Workflow events
    case 'github.workflow_run.completed': {
      const p = rawPayload as GitHubWebhookPayload & {
        workflow_run: {
          workflow_id: number;
          name: string;
          id: number;
          run_number: number;
          event: string;
          status: string;
          conclusion: string | null;
          head_branch: string;
          head_sha: string;
          html_url: string;
        };
      };
      return {
        workflowId: p.workflow_run.workflow_id,
        workflowName: p.workflow_run.name,
        runId: p.workflow_run.id,
        runNumber: p.workflow_run.run_number,
        event: p.workflow_run.event,
        status: p.workflow_run.status,
        conclusion: p.workflow_run.conclusion || undefined,
        headBranch: p.workflow_run.head_branch,
        headSha: p.workflow_run.head_sha,
        htmlUrl: p.workflow_run.html_url,
      };
    }

    case 'github.check_run.completed': {
      const p = rawPayload as GitHubWebhookPayload & {
        check_run: {
          id: number;
          name: string;
          status: string;
          conclusion: string | null;
          head_sha: string;
          html_url: string;
          output?: {
            title: string | null;
            summary: string | null;
            text: string | null;
          };
        };
      };
      return {
        checkRunId: p.check_run.id,
        name: p.check_run.name,
        status: p.check_run.status,
        conclusion: p.check_run.conclusion || undefined,
        headSha: p.check_run.head_sha,
        htmlUrl: p.check_run.html_url,
        output: p.check_run.output
          ? {
              title: p.check_run.output.title || undefined,
              summary: p.check_run.output.summary || undefined,
              text: p.check_run.output.text || undefined,
            }
          : undefined,
      };
    }

    default:
      return {};
  }
}

/**
 * Process a GitHub webhook request
 *
 * @param request - The incoming webhook request
 * @param secret - The webhook secret for verification
 * @param options - Processing options
 */
export async function processGitHubWebhook(
  request: Request,
  secret: string,
  options: {
    skipVerification?: boolean;
    allowedEvents?: GitHubEventId[];
  } = {}
): Promise<WebhookProcessResult> {
  // Clone request for reading body multiple times
  const clonedRequest = request.clone();

  // Validate the webhook
  if (!options.skipVerification) {
    const validation = await validateGitHubWebhook(request, secret);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }
  }

  // Parse headers and body
  const headers = parseGitHubWebhookHeaders(clonedRequest as unknown as Request);
  const body = await clonedRequest.text();
  let rawPayload: GitHubWebhookPayload;

  try {
    rawPayload = JSON.parse(body);
  } catch {
    return {
      success: false,
      error: 'Invalid JSON payload',
    };
  }

  // Map to internal event ID
  const eventId = mapGitHubEventToInternalId(
    headers.event || '',
    rawPayload.action,
    rawPayload
  );

  if (!eventId) {
    return {
      success: false,
      error: `Unsupported event: ${headers.event}${rawPayload.action ? ` (${rawPayload.action})` : ''}`,
      raw: rawPayload,
    };
  }

  // Check if event is allowed
  if (options.allowedEvents && !options.allowedEvents.includes(eventId)) {
    return {
      success: false,
      error: `Event not allowed: ${eventId}`,
      eventId,
      raw: rawPayload,
    };
  }

  // Transform the payload
  const transformedPayload = transformPayload(eventId, rawPayload);

  // Validate against schema
  const eventDef = githubEvents[eventId];

  if (eventDef) {
    const validation = eventDef.payload.safeParse(transformedPayload);

    if (!validation.success) {
      return {
        success: false,
        error: `Payload validation failed: ${validation.error.message}`,
        eventId,
        raw: rawPayload,
      };
    }
  }

  return {
    success: true,
    eventId,
    payload: transformedPayload,
    raw: rawPayload,
  };
}

/**
 * Get repository information from a webhook payload
 */
export function getRepositoryFromPayload(
  payload: GitHubWebhookPayload
): { owner: string; repo: string; fullName: string } | null {
  if (!payload.repository) {
    return null;
  }

  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    fullName: payload.repository.full_name,
  };
}

/**
 * Get sender information from a webhook payload
 */
export function getSenderFromPayload(
  payload: GitHubWebhookPayload
): { login: string; id: number } | null {
  if (!payload.sender) {
    return null;
  }

  return {
    login: payload.sender.login,
    id: payload.sender.id,
  };
}
