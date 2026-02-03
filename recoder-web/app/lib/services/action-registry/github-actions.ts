import { z } from 'zod';
import { createGitHubClient } from './github-api';
import type {
  ActionContext,
  ActionDefinition,
  ActionResult,
  GitHubComment,
  GitHubDiscussion,
  GitHubIssue,
  GitHubPullRequest,
  GitHubReaction,
  InputField,
  RegisteredAction,
} from './types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a string to title case
 */
function titleCase(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Extract input fields from a Zod schema for UI rendering
 */
function extractInputFields<T extends z.ZodObject<z.ZodRawShape>>(schema: T): InputField[] {
  const shape = schema.shape;
  return Object.keys(shape).map((key) => {
    const field = shape[key];
    const isOptional = field.isOptional();

    // Determine field type based on Zod type
    let type: InputField['type'] = 'text';
    if (field instanceof z.ZodNumber || field._def.typeName === 'ZodNumber') {
      type = 'number';
    } else if (key === 'body' || key === 'description') {
      type = 'textarea';
    }

    // Try to get label from description or generate from key
    const description = field._def.description;
    const label = description || titleCase(key);

    return {
      key,
      label,
      optional: isOptional,
      type,
      placeholder: `Enter ${label.toLowerCase()}`,
    };
  });
}

/**
 * Create a registered action from a definition and executor
 */
function createRegisteredAction<TPayload extends z.ZodObject<z.ZodRawShape>, TResult>(
  definition: ActionDefinition<TPayload>,
  executor: (payload: z.infer<TPayload>, context: ActionContext) => Promise<ActionResult<TResult>>
): RegisteredAction<TPayload> {
  return {
    definition,
    execute: executor as any,
    getInputFields: () => extractInputFields(definition.payload),
  };
}

// ============================================================================
// Issue Actions
// ============================================================================

export const createIssueAction = createRegisteredAction(
  {
    id: 'github.create.issue',
    label: 'Create Issue',
    description: 'Create a new issue in the repository',
    payload: z.object({
      title: z.string().describe('Issue title'),
      body: z.string().describe('Issue body/description'),
      labels: z.array(z.string()).optional().describe('Labels to add'),
      assignees: z.array(z.string()).optional().describe('Users to assign'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubIssue>> => {
    const client = createGitHubClient(context);
    return client.createIssue(payload.title, payload.body, payload.labels, payload.assignees);
  }
);

export const updateIssueAction = createRegisteredAction(
  {
    id: 'github.update.issue',
    label: 'Update Issue',
    description: 'Update an existing issue',
    payload: z.object({
      issueNumber: z.coerce.number().describe('Issue number'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body'),
      state: z.enum(['open', 'closed']).optional().describe('Issue state'),
      labels: z.array(z.string()).optional().describe('Labels to set'),
      assignees: z.array(z.string()).optional().describe('Users to assign'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubIssue>> => {
    const client = createGitHubClient(context);
    const { issueNumber, ...updates } = payload;
    return client.updateIssue(issueNumber, updates);
  }
);

export const getIssueAction = createRegisteredAction(
  {
    id: 'github.get.issue',
    label: 'Get Issue',
    description: 'Get details of an issue',
    payload: z.object({
      issueNumber: z.coerce.number().describe('Issue number'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubIssue>> => {
    const client = createGitHubClient(context);
    return client.getIssue(payload.issueNumber);
  }
);

export const createIssueCommentAction = createRegisteredAction(
  {
    id: 'github.create.issueComment',
    label: 'Create Issue Comment',
    description: 'Add a comment to an issue',
    payload: z.object({
      issueNumber: z.coerce.number().describe('Issue number'),
      body: z.string().describe('Comment body'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubComment>> => {
    const client = createGitHubClient(context);
    return client.createIssueComment(payload.issueNumber, payload.body);
  }
);

export const updateIssueCommentAction = createRegisteredAction(
  {
    id: 'github.update.issueComment',
    label: 'Update Issue Comment',
    description: 'Update an existing comment on an issue',
    payload: z.object({
      commentId: z.coerce.number().describe('Comment ID'),
      body: z.string().describe('New comment body'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubComment>> => {
    const client = createGitHubClient(context);
    return client.updateIssueComment(payload.commentId, payload.body);
  }
);

export const deleteIssueCommentAction = createRegisteredAction(
  {
    id: 'github.delete.issueComment',
    label: 'Delete Issue Comment',
    description: 'Delete a comment from an issue',
    payload: z.object({
      commentId: z.coerce.number().describe('Comment ID'),
    }),
  },
  async (payload, context): Promise<ActionResult<void>> => {
    const client = createGitHubClient(context);
    return client.deleteIssueComment(payload.commentId);
  }
);

export const addIssueReactionAction = createRegisteredAction(
  {
    id: 'github.add.issueReaction',
    label: 'Add Issue Reaction',
    description: 'Add a reaction to an issue',
    payload: z.object({
      issueNumber: z.coerce.number().describe('Issue number'),
      reaction: z.enum(['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes']).describe('Reaction type'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubReaction>> => {
    const client = createGitHubClient(context);
    return client.addIssueReaction(payload.issueNumber, payload.reaction);
  }
);

export const addIssueCommentReactionAction = createRegisteredAction(
  {
    id: 'github.add.issueCommentReaction',
    label: 'Add Issue Comment Reaction',
    description: 'Add a reaction to an issue comment',
    payload: z.object({
      commentId: z.coerce.number().describe('Comment ID'),
      reaction: z.enum(['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes']).describe('Reaction type'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubReaction>> => {
    const client = createGitHubClient(context);
    return client.addIssueCommentReaction(payload.commentId, payload.reaction);
  }
);

// ============================================================================
// Pull Request Actions
// ============================================================================

export const createPullRequestAction = createRegisteredAction(
  {
    id: 'github.create.pullRequest',
    label: 'Create Pull Request',
    description: 'Create a new pull request',
    payload: z.object({
      title: z.string().describe('Pull request title'),
      body: z.string().describe('Pull request body'),
      head: z.string().describe('Branch containing changes'),
      base: z.string().describe('Branch to merge into'),
      draft: z.boolean().optional().describe('Create as draft'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubPullRequest>> => {
    const client = createGitHubClient(context);
    return client.createPullRequest(payload.title, payload.body, payload.head, payload.base, payload.draft);
  }
);

export const updatePullRequestAction = createRegisteredAction(
  {
    id: 'github.update.pullRequest',
    label: 'Update Pull Request',
    description: 'Update an existing pull request',
    payload: z.object({
      pullNumber: z.coerce.number().describe('Pull request number'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body'),
      state: z.enum(['open', 'closed']).optional().describe('Pull request state'),
      base: z.string().optional().describe('New base branch'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubPullRequest>> => {
    const client = createGitHubClient(context);
    const { pullNumber, ...updates } = payload;
    return client.updatePullRequest(pullNumber, updates);
  }
);

export const getPullRequestAction = createRegisteredAction(
  {
    id: 'github.get.pullRequest',
    label: 'Get Pull Request',
    description: 'Get details of a pull request',
    payload: z.object({
      pullNumber: z.coerce.number().describe('Pull request number'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubPullRequest>> => {
    const client = createGitHubClient(context);
    return client.getPullRequest(payload.pullNumber);
  }
);

export const createPullRequestCommentAction = createRegisteredAction(
  {
    id: 'github.create.pullRequestComment',
    label: 'Create Pull Request Comment',
    description: 'Add a comment to a pull request',
    payload: z.object({
      pullNumber: z.coerce.number().describe('Pull request number'),
      body: z.string().describe('Comment body'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubComment>> => {
    const client = createGitHubClient(context);
    return client.createPullRequestComment(payload.pullNumber, payload.body);
  }
);

export const createPullRequestReviewCommentAction = createRegisteredAction(
  {
    id: 'github.create.pullRequestReviewComment',
    label: 'Create Review Comment',
    description: 'Add a review comment to specific code in a pull request',
    payload: z.object({
      pullNumber: z.coerce.number().describe('Pull request number'),
      body: z.string().describe('Comment body'),
      commitId: z.string().describe('Commit SHA'),
      path: z.string().describe('File path'),
      line: z.coerce.number().describe('Line number'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubComment>> => {
    const client = createGitHubClient(context);
    return client.createPullRequestReviewComment(
      payload.pullNumber,
      payload.body,
      payload.commitId,
      payload.path,
      payload.line
    );
  }
);

export const replyToPullRequestReviewCommentAction = createRegisteredAction(
  {
    id: 'github.reply.pullRequestReviewComment',
    label: 'Reply to Review Comment',
    description: 'Reply to a review comment on a pull request',
    payload: z.object({
      pullNumber: z.coerce.number().describe('Pull request number'),
      commentId: z.coerce.number().describe('Comment ID to reply to'),
      body: z.string().describe('Reply body'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubComment>> => {
    const client = createGitHubClient(context);
    return client.replyToPullRequestReviewComment(payload.pullNumber, payload.commentId, payload.body);
  }
);

export const addPullRequestReactionAction = createRegisteredAction(
  {
    id: 'github.add.pullRequestReaction',
    label: 'Add Pull Request Reaction',
    description: 'Add a reaction to a pull request',
    payload: z.object({
      pullNumber: z.coerce.number().describe('Pull request number'),
      reaction: z.enum(['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes']).describe('Reaction type'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubReaction>> => {
    const client = createGitHubClient(context);
    return client.addPullRequestReaction(payload.pullNumber, payload.reaction);
  }
);

// ============================================================================
// Discussion Actions
// ============================================================================

export const getDiscussionAction = createRegisteredAction(
  {
    id: 'github.get.discussion',
    label: 'Get Discussion',
    description: 'Get details of a discussion',
    payload: z.object({
      discussionNumber: z.coerce.number().describe('Discussion number'),
    }),
  },
  async (payload, context): Promise<ActionResult<GitHubDiscussion>> => {
    const client = createGitHubClient(context);
    return client.getDiscussion(payload.discussionNumber);
  }
);

export const createDiscussionCommentAction = createRegisteredAction(
  {
    id: 'github.create.discussionComment',
    label: 'Create Discussion Comment',
    description: 'Add a comment to a discussion',
    payload: z.object({
      discussionNumber: z.coerce.number().describe('Discussion number'),
      body: z.string().describe('Comment body'),
      replyToId: z.string().optional().describe('Comment ID to reply to (GraphQL node ID)'),
    }),
  },
  async (payload, context): Promise<ActionResult<{ id: string; body: string; url: string }>> => {
    const client = createGitHubClient(context);
    return client.createDiscussionComment(payload.discussionNumber, payload.body, payload.replyToId);
  }
);

export const addDiscussionReactionAction = createRegisteredAction(
  {
    id: 'github.add.discussionReaction',
    label: 'Add Discussion Reaction',
    description: 'Add a reaction to a discussion',
    payload: z.object({
      discussionNumber: z.coerce.number().describe('Discussion number'),
      reaction: z.enum(['THUMBS_UP', 'THUMBS_DOWN', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES']).describe('Reaction type'),
    }),
  },
  async (payload, context): Promise<ActionResult<{ id: string }>> => {
    const client = createGitHubClient(context);
    return client.addDiscussionReaction(payload.discussionNumber, payload.reaction);
  }
);

// ============================================================================
// GitHub Actions Registry
// ============================================================================

export const githubActions = {
  // Issues
  [createIssueAction.definition.id]: createIssueAction,
  [updateIssueAction.definition.id]: updateIssueAction,
  [getIssueAction.definition.id]: getIssueAction,
  [createIssueCommentAction.definition.id]: createIssueCommentAction,
  [updateIssueCommentAction.definition.id]: updateIssueCommentAction,
  [deleteIssueCommentAction.definition.id]: deleteIssueCommentAction,
  [addIssueReactionAction.definition.id]: addIssueReactionAction,
  [addIssueCommentReactionAction.definition.id]: addIssueCommentReactionAction,

  // Pull Requests
  [createPullRequestAction.definition.id]: createPullRequestAction,
  [updatePullRequestAction.definition.id]: updatePullRequestAction,
  [getPullRequestAction.definition.id]: getPullRequestAction,
  [createPullRequestCommentAction.definition.id]: createPullRequestCommentAction,
  [createPullRequestReviewCommentAction.definition.id]: createPullRequestReviewCommentAction,
  [replyToPullRequestReviewCommentAction.definition.id]: replyToPullRequestReviewCommentAction,
  [addPullRequestReactionAction.definition.id]: addPullRequestReactionAction,

  // Discussions
  [getDiscussionAction.definition.id]: getDiscussionAction,
  [createDiscussionCommentAction.definition.id]: createDiscussionCommentAction,
  [addDiscussionReactionAction.definition.id]: addDiscussionReactionAction,
} as const;

export type GitHubActions = typeof githubActions;
export type GitHubActionId = keyof GitHubActions;

export const githubActionEntries = Object.values(githubActions);

export function isGitHubActionId(id: string): boolean {
  return id in githubActions;
}

/**
 * Get input fields for a GitHub action
 */
export function getGitHubActionInputFields(actionId: GitHubActionId): InputField[] {
  const action = githubActions[actionId];
  return action.getInputFields();
}
