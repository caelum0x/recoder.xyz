import { z } from 'zod';
import type { GitHubEvent, InputData, PayloadFieldMeta } from './types';

/**
 * Convert a string to title case
 */
function titleCase(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// GitHub Issue Events
// ============================================================================

export const githubIssueCreatedEvent: GitHubEvent = {
  id: 'github.issue.created',
  label: 'Issue Created',
  payload: z.object({
    issueNumber: z.coerce.number(),
    title: z.string(),
    body: z.string().optional(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    title: { label: 'Issue Title' },
    body: { label: 'Issue Body', input: { multiline: true } },
  },
};

export const githubIssueClosedEvent: GitHubEvent = {
  id: 'github.issue.closed',
  label: 'Issue Closed',
  payload: z.object({
    issueNumber: z.coerce.number(),
    title: z.string(),
    body: z.string().optional(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    title: { label: 'Issue Title' },
    body: { label: 'Issue Body', input: { multiline: true } },
  },
};

export const githubIssueReopenedEvent: GitHubEvent = {
  id: 'github.issue.reopened',
  label: 'Issue Reopened',
  payload: z.object({
    issueNumber: z.coerce.number(),
    title: z.string(),
    body: z.string().optional(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    title: { label: 'Issue Title' },
    body: { label: 'Issue Body', input: { multiline: true } },
  },
};

export const githubIssueLabeledEvent: GitHubEvent = {
  id: 'github.issue.labeled',
  label: 'Issue Labeled',
  payload: z.object({
    issueNumber: z.coerce.number(),
    title: z.string(),
    body: z.string().optional(),
    labelName: z.string(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    title: { label: 'Issue Title' },
    body: { label: 'Issue Body', input: { multiline: true } },
    labelName: { label: 'Issue Label Name' },
  },
};

export const githubIssueUnlabeledEvent: GitHubEvent = {
  id: 'github.issue.unlabeled',
  label: 'Issue Unlabeled',
  payload: z.object({
    issueNumber: z.coerce.number(),
    title: z.string(),
    body: z.string().optional(),
    labelName: z.string(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    title: { label: 'Issue Title' },
    body: { label: 'Issue Body', input: { multiline: true } },
    labelName: { label: 'Issue Label Name' },
  },
};

export const githubIssueAssignedEvent: GitHubEvent = {
  id: 'github.issue.assigned',
  label: 'Issue Assigned',
  payload: z.object({
    issueNumber: z.coerce.number(),
    title: z.string(),
    body: z.string().optional(),
    assignee: z.string(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    title: { label: 'Issue Title' },
    body: { label: 'Issue Body', input: { multiline: true } },
    assignee: { label: 'Assignee Username' },
  },
};

// ============================================================================
// GitHub Issue Comment Events
// ============================================================================

export const githubIssueCommentCreatedEvent: GitHubEvent = {
  id: 'github.issue_comment.created',
  label: 'Issue Comment Created',
  payload: z.object({
    issueNumber: z.coerce.number(),
    issueTitle: z.string(),
    issueBody: z.string().optional(),
    body: z.string().optional(),
    commentId: z.coerce.number(),
    authorUsername: z.string(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    issueTitle: { label: 'Issue Title' },
    issueBody: { label: 'Issue Body', input: { multiline: true } },
    body: { label: 'Comment Body', input: { multiline: true } },
    commentId: { label: 'Comment ID' },
    authorUsername: { label: 'Comment Author' },
  },
};

export const githubIssueCommentEditedEvent: GitHubEvent = {
  id: 'github.issue_comment.edited',
  label: 'Issue Comment Edited',
  payload: z.object({
    issueNumber: z.coerce.number(),
    issueTitle: z.string(),
    issueBody: z.string().optional(),
    body: z.string().optional(),
    commentId: z.coerce.number(),
    authorUsername: z.string(),
  }),
  meta: {
    issueNumber: { label: 'Issue Number' },
    issueTitle: { label: 'Issue Title' },
    issueBody: { label: 'Issue Body', input: { multiline: true } },
    body: { label: 'Comment Body', input: { multiline: true } },
    commentId: { label: 'Comment ID' },
    authorUsername: { label: 'Comment Author' },
  },
};

// ============================================================================
// GitHub Pull Request Events
// ============================================================================

export const githubPullRequestOpenedEvent: GitHubEvent = {
  id: 'github.pull_request.opened',
  label: 'Pull Request Opened',
  payload: z.object({
    title: z.string(),
    body: z.string().optional(),
    number: z.coerce.number(),
    diff: z.string(),
    pullRequestUrl: z.string(),
    headRef: z.string(),
    baseRef: z.string(),
    authorUsername: z.string(),
  }),
  meta: {
    title: { label: 'Pull Request Title' },
    body: { label: 'Pull Request Body', input: { multiline: true } },
    number: { label: 'Pull Request Number' },
    diff: { label: 'Pull Request Diff', input: { multiline: true } },
    pullRequestUrl: { label: 'Pull Request URL' },
    headRef: { label: 'Head Branch' },
    baseRef: { label: 'Base Branch' },
    authorUsername: { label: 'Author Username' },
  },
};

export const githubPullRequestClosedEvent: GitHubEvent = {
  id: 'github.pull_request.closed',
  label: 'Pull Request Closed',
  payload: z.object({
    title: z.string(),
    body: z.string().optional(),
    number: z.coerce.number(),
    diff: z.string(),
    pullRequestUrl: z.string(),
    merged: z.boolean(),
  }),
  meta: {
    title: { label: 'Pull Request Title' },
    body: { label: 'Pull Request Body', input: { multiline: true } },
    number: { label: 'Pull Request Number' },
    diff: { label: 'Pull Request Diff', input: { multiline: true } },
    pullRequestUrl: { label: 'Pull Request URL' },
    merged: { label: 'Was Merged' },
  },
};

export const githubPullRequestMergedEvent: GitHubEvent = {
  id: 'github.pull_request.merged',
  label: 'Pull Request Merged',
  payload: z.object({
    title: z.string(),
    body: z.string().optional(),
    number: z.coerce.number(),
    diff: z.string(),
    pullRequestUrl: z.string(),
    mergedBy: z.string(),
    mergedAt: z.string(),
  }),
  meta: {
    title: { label: 'Pull Request Title' },
    body: { label: 'Pull Request Body', input: { multiline: true } },
    number: { label: 'Pull Request Number' },
    diff: { label: 'Pull Request Diff', input: { multiline: true } },
    pullRequestUrl: { label: 'Pull Request URL' },
    mergedBy: { label: 'Merged By' },
    mergedAt: { label: 'Merged At' },
  },
};

export const githubPullRequestReadyForReviewEvent: GitHubEvent = {
  id: 'github.pull_request.ready_for_review',
  label: 'Pull Request Ready for Review',
  payload: z.object({
    title: z.string(),
    body: z.string().optional(),
    number: z.coerce.number(),
    diff: z.string(),
    pullRequestUrl: z.string(),
  }),
  meta: {
    title: { label: 'Pull Request Title' },
    body: { label: 'Pull Request Body', input: { multiline: true } },
    number: { label: 'Pull Request Number' },
    diff: { label: 'Pull Request Diff', input: { multiline: true } },
    pullRequestUrl: { label: 'Pull Request URL' },
  },
};

export const githubPullRequestLabeledEvent: GitHubEvent = {
  id: 'github.pull_request.labeled',
  label: 'Pull Request Labeled',
  payload: z.object({
    pullRequestTitle: z.string(),
    pullRequestBody: z.string().optional(),
    pullRequestNumber: z.coerce.number(),
    labelName: z.string(),
  }),
  meta: {
    pullRequestTitle: { label: 'Pull Request Title' },
    pullRequestBody: { label: 'Pull Request Body', input: { multiline: true } },
    pullRequestNumber: { label: 'Pull Request Number' },
    labelName: { label: 'Pull Request Label Name' },
  },
};

export const githubPullRequestSynchronizeEvent: GitHubEvent = {
  id: 'github.pull_request.synchronize',
  label: 'Pull Request Updated',
  payload: z.object({
    title: z.string(),
    body: z.string().optional(),
    number: z.coerce.number(),
    diff: z.string(),
    pullRequestUrl: z.string(),
    before: z.string(),
    after: z.string(),
  }),
  meta: {
    title: { label: 'Pull Request Title' },
    body: { label: 'Pull Request Body', input: { multiline: true } },
    number: { label: 'Pull Request Number' },
    diff: { label: 'Pull Request Diff', input: { multiline: true } },
    pullRequestUrl: { label: 'Pull Request URL' },
    before: { label: 'Before SHA' },
    after: { label: 'After SHA' },
  },
};

// ============================================================================
// GitHub Pull Request Comment Events
// ============================================================================

export const githubPullRequestCommentCreatedEvent: GitHubEvent = {
  id: 'github.pull_request_comment.created',
  label: 'Pull Request Comment Created',
  payload: z.object({
    issueNumber: z.coerce.number(),
    issueTitle: z.string(),
    issueBody: z.string().optional(),
    body: z.string().optional(),
    diff: z.string(),
    commentId: z.coerce.number(),
    authorUsername: z.string(),
  }),
  meta: {
    issueNumber: { label: 'Pull Request Number' },
    issueTitle: { label: 'Pull Request Title' },
    issueBody: { label: 'Pull Request Body', input: { multiline: true } },
    body: { label: 'Pull Request Comment', input: { multiline: true } },
    diff: { label: 'Pull Request Diff', input: { multiline: true } },
    commentId: { label: 'Comment ID' },
    authorUsername: { label: 'Comment Author' },
  },
};

export const githubPullRequestReviewCommentCreatedEvent: GitHubEvent = {
  id: 'github.pull_request_review_comment.created',
  label: 'Pull Request Review Comment Created',
  payload: z.object({
    id: z.coerce.number(),
    body: z.string(),
    diff: z.string(),
    previousCommentBody: z.string(),
    pullRequestNumber: z.coerce.number(),
    pullRequestTitle: z.string(),
    pullRequestBody: z.string().optional(),
    path: z.string(),
    position: z.coerce.number().optional(),
  }),
  meta: {
    id: { label: 'Review Comment ID' },
    body: { label: 'Review Comment Body', input: { multiline: true } },
    diff: { label: 'Review Comment Diff' },
    previousCommentBody: { label: 'Previous Comment Body', input: { multiline: true } },
    pullRequestNumber: { label: 'Pull Request Number' },
    pullRequestTitle: { label: 'Pull Request Title' },
    pullRequestBody: { label: 'Pull Request Body', input: { multiline: true } },
    path: { label: 'File Path' },
    position: { label: 'Line Position' },
  },
};

// ============================================================================
// GitHub Discussion Events
// ============================================================================

export const githubDiscussionCreatedEvent: GitHubEvent = {
  id: 'github.discussion.created',
  label: 'Discussion Created',
  payload: z.object({
    discussionNumber: z.coerce.number(),
    discussionTitle: z.string(),
    discussionBody: z.string(),
    discussionUrl: z.string(),
    categoryName: z.string(),
    authorUsername: z.string(),
  }),
  meta: {
    discussionNumber: { label: 'Discussion Number' },
    discussionTitle: { label: 'Discussion Title' },
    discussionBody: { label: 'Discussion Body', input: { multiline: true } },
    discussionUrl: { label: 'Discussion URL' },
    categoryName: { label: 'Category Name' },
    authorUsername: { label: 'Author Username' },
  },
};

export const githubDiscussionCommentCreatedEvent: GitHubEvent = {
  id: 'github.discussion_comment.created',
  label: 'Discussion Comment Created',
  payload: z.object({
    body: z.string(),
    discussionNumber: z.coerce.number(),
    discussionTitle: z.string(),
    discussionBody: z.string(),
    discussionUrl: z.string(),
    commentId: z.coerce.number(),
    parentCommentBody: z.string(),
    authorUsername: z.string(),
  }),
  meta: {
    body: { label: 'Comment Body', input: { multiline: true } },
    discussionNumber: { label: 'Discussion Number' },
    discussionTitle: { label: 'Discussion Title' },
    discussionBody: { label: 'Discussion Body', input: { multiline: true } },
    discussionUrl: { label: 'Discussion URL' },
    commentId: { label: 'Comment ID' },
    parentCommentBody: { label: 'Parent Comment Body', input: { multiline: true } },
    authorUsername: { label: 'Author Username' },
  },
};

// ============================================================================
// GitHub Push Events
// ============================================================================

export const githubPushEvent: GitHubEvent = {
  id: 'github.push',
  label: 'Push',
  payload: z.object({
    ref: z.string(),
    before: z.string(),
    after: z.string(),
    compareUrl: z.string(),
    commits: z.array(
      z.object({
        id: z.string(),
        message: z.string(),
        author: z.string(),
        timestamp: z.string(),
        added: z.array(z.string()),
        removed: z.array(z.string()),
        modified: z.array(z.string()),
      })
    ),
    headCommitMessage: z.string().optional(),
    pusherName: z.string(),
    pusherEmail: z.string(),
    forced: z.boolean(),
  }),
  meta: {
    ref: { label: 'Git Ref (branch/tag)' },
    before: { label: 'Before SHA' },
    after: { label: 'After SHA' },
    compareUrl: { label: 'Compare URL' },
    commits: { label: 'Commits' },
    headCommitMessage: { label: 'Head Commit Message', input: { multiline: true } },
    pusherName: { label: 'Pusher Name' },
    pusherEmail: { label: 'Pusher Email' },
    forced: { label: 'Force Push' },
  },
};

// ============================================================================
// GitHub Release Events
// ============================================================================

export const githubReleasePublishedEvent: GitHubEvent = {
  id: 'github.release.published',
  label: 'Release Published',
  payload: z.object({
    tagName: z.string(),
    name: z.string(),
    body: z.string().optional(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    htmlUrl: z.string(),
    authorUsername: z.string(),
  }),
  meta: {
    tagName: { label: 'Tag Name' },
    name: { label: 'Release Name' },
    body: { label: 'Release Body', input: { multiline: true } },
    draft: { label: 'Is Draft' },
    prerelease: { label: 'Is Prerelease' },
    htmlUrl: { label: 'Release URL' },
    authorUsername: { label: 'Author Username' },
  },
};

export const githubReleaseCreatedEvent: GitHubEvent = {
  id: 'github.release.created',
  label: 'Release Created',
  payload: z.object({
    tagName: z.string(),
    name: z.string(),
    body: z.string().optional(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    htmlUrl: z.string(),
    authorUsername: z.string(),
  }),
  meta: {
    tagName: { label: 'Tag Name' },
    name: { label: 'Release Name' },
    body: { label: 'Release Body', input: { multiline: true } },
    draft: { label: 'Is Draft' },
    prerelease: { label: 'Is Prerelease' },
    htmlUrl: { label: 'Release URL' },
    authorUsername: { label: 'Author Username' },
  },
};

// ============================================================================
// GitHub Workflow Events
// ============================================================================

export const githubWorkflowRunCompletedEvent: GitHubEvent = {
  id: 'github.workflow_run.completed',
  label: 'Workflow Run Completed',
  payload: z.object({
    workflowId: z.coerce.number(),
    workflowName: z.string(),
    runId: z.coerce.number(),
    runNumber: z.coerce.number(),
    event: z.string(),
    status: z.string(),
    conclusion: z.string().optional(),
    headBranch: z.string(),
    headSha: z.string(),
    htmlUrl: z.string(),
  }),
  meta: {
    workflowId: { label: 'Workflow ID' },
    workflowName: { label: 'Workflow Name' },
    runId: { label: 'Run ID' },
    runNumber: { label: 'Run Number' },
    event: { label: 'Triggering Event' },
    status: { label: 'Status' },
    conclusion: { label: 'Conclusion' },
    headBranch: { label: 'Head Branch' },
    headSha: { label: 'Head SHA' },
    htmlUrl: { label: 'Run URL' },
  },
};

export const githubCheckRunCompletedEvent: GitHubEvent = {
  id: 'github.check_run.completed',
  label: 'Check Run Completed',
  payload: z.object({
    checkRunId: z.coerce.number(),
    name: z.string(),
    status: z.string(),
    conclusion: z.string().optional(),
    headSha: z.string(),
    htmlUrl: z.string(),
    output: z
      .object({
        title: z.string().optional(),
        summary: z.string().optional(),
        text: z.string().optional(),
      })
      .optional(),
  }),
  meta: {
    checkRunId: { label: 'Check Run ID' },
    name: { label: 'Check Name' },
    status: { label: 'Status' },
    conclusion: { label: 'Conclusion' },
    headSha: { label: 'Head SHA' },
    htmlUrl: { label: 'Check Run URL' },
    output: { label: 'Output' },
  },
};

// ============================================================================
// GitHub Events Registry
// ============================================================================

export const githubEvents = {
  // Issue events
  [githubIssueCreatedEvent.id]: githubIssueCreatedEvent,
  [githubIssueClosedEvent.id]: githubIssueClosedEvent,
  [githubIssueReopenedEvent.id]: githubIssueReopenedEvent,
  [githubIssueLabeledEvent.id]: githubIssueLabeledEvent,
  [githubIssueUnlabeledEvent.id]: githubIssueUnlabeledEvent,
  [githubIssueAssignedEvent.id]: githubIssueAssignedEvent,

  // Issue comment events
  [githubIssueCommentCreatedEvent.id]: githubIssueCommentCreatedEvent,
  [githubIssueCommentEditedEvent.id]: githubIssueCommentEditedEvent,

  // Pull request events
  [githubPullRequestOpenedEvent.id]: githubPullRequestOpenedEvent,
  [githubPullRequestClosedEvent.id]: githubPullRequestClosedEvent,
  [githubPullRequestMergedEvent.id]: githubPullRequestMergedEvent,
  [githubPullRequestReadyForReviewEvent.id]: githubPullRequestReadyForReviewEvent,
  [githubPullRequestLabeledEvent.id]: githubPullRequestLabeledEvent,
  [githubPullRequestSynchronizeEvent.id]: githubPullRequestSynchronizeEvent,

  // Pull request comment events
  [githubPullRequestCommentCreatedEvent.id]: githubPullRequestCommentCreatedEvent,
  [githubPullRequestReviewCommentCreatedEvent.id]: githubPullRequestReviewCommentCreatedEvent,

  // Discussion events
  [githubDiscussionCreatedEvent.id]: githubDiscussionCreatedEvent,
  [githubDiscussionCommentCreatedEvent.id]: githubDiscussionCommentCreatedEvent,

  // Push events
  [githubPushEvent.id]: githubPushEvent,

  // Release events
  [githubReleasePublishedEvent.id]: githubReleasePublishedEvent,
  [githubReleaseCreatedEvent.id]: githubReleaseCreatedEvent,

  // Workflow events
  [githubWorkflowRunCompletedEvent.id]: githubWorkflowRunCompletedEvent,
  [githubCheckRunCompletedEvent.id]: githubCheckRunCompletedEvent,
} as const;

export type GitHubEventId = keyof typeof githubEvents;

export const githubEventEntries = Object.values(githubEvents);

/**
 * Type guard to check if an ID is a valid GitHub event ID
 */
export function isGitHubEventId(id: unknown): id is GitHubEventId {
  return typeof id === 'string' && id in githubEvents;
}

/**
 * Get a GitHub event by its ID
 */
export function getGitHubEvent(id: string): GitHubEvent | undefined {
  return githubEvents[id as GitHubEventId];
}

/**
 * Convert a GitHub event's payload schema to input field definitions for UI rendering
 */
export function githubEventToInputFields(githubEvent: GitHubEvent): InputData[] {
  const shape = githubEvent.payload.shape;
  const meta = githubEvent.meta || {};

  return Object.keys(shape).map((key) => {
    const fieldSchema = shape[key];
    const fieldMeta: PayloadFieldMeta = meta[key] || {};
    const label = fieldMeta.label || titleCase(key);

    // Check if field is optional
    let optional = false;
    let innerSchema = fieldSchema;

    if (fieldSchema instanceof z.ZodOptional) {
      optional = true;
      innerSchema = fieldSchema.unwrap();
    }

    // Determine field type
    let type: InputData['type'] = 'text';

    if (innerSchema instanceof z.ZodNumber) {
      type = 'number';
    } else if (innerSchema instanceof z.ZodString) {
      if (fieldMeta.input?.multiline) {
        type = 'multiline-text';
      } else {
        type = 'text';
      }
    }

    return {
      key,
      label,
      optional,
      type,
    };
  });
}

/**
 * Get events grouped by category for UI display
 */
export function getGitHubEventsByCategory(): Record<string, GitHubEvent[]> {
  return {
    Issues: [
      githubIssueCreatedEvent,
      githubIssueClosedEvent,
      githubIssueReopenedEvent,
      githubIssueLabeledEvent,
      githubIssueUnlabeledEvent,
      githubIssueAssignedEvent,
    ],
    'Issue Comments': [githubIssueCommentCreatedEvent, githubIssueCommentEditedEvent],
    'Pull Requests': [
      githubPullRequestOpenedEvent,
      githubPullRequestClosedEvent,
      githubPullRequestMergedEvent,
      githubPullRequestReadyForReviewEvent,
      githubPullRequestLabeledEvent,
      githubPullRequestSynchronizeEvent,
    ],
    'Pull Request Comments': [githubPullRequestCommentCreatedEvent, githubPullRequestReviewCommentCreatedEvent],
    Discussions: [githubDiscussionCreatedEvent, githubDiscussionCommentCreatedEvent],
    Push: [githubPushEvent],
    Releases: [githubReleasePublishedEvent, githubReleaseCreatedEvent],
    'CI/CD': [githubWorkflowRunCompletedEvent, githubCheckRunCompletedEvent],
  };
}
