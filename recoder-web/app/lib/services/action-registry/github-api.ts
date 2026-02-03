import type {
  ActionContext,
  ActionResult,
  GitHubComment,
  GitHubDiscussion,
  GitHubIssue,
  GitHubPullRequest,
  GitHubReaction,
} from './types';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';

/**
 * GitHub API client for making authenticated requests
 */
class GitHubAPIClient {
  private token: string;
  private owner: string;
  private repo: string;

  constructor(context: ActionContext) {
    if (!context.githubToken) {
      throw new Error('GitHub token is required');
    }
    if (!context.owner || !context.repo) {
      throw new Error('Repository owner and name are required');
    }
    this.token = context.githubToken;
    this.owner = context.owner;
    this.repo = context.repo;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private get graphqlHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<ActionResult<T>> {
    try {
      const url = `${GITHUB_API_BASE}${endpoint}`;
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
          errorDetails: errorData,
        };
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return { success: true, data: undefined as T };
      }

      const data = await response.json() as T;
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorDetails: error,
      };
    }
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<ActionResult<T>> {
    try {
      const response = await fetch(GITHUB_GRAPHQL_API, {
        method: 'POST',
        headers: this.graphqlHeaders,
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `GitHub GraphQL API error: ${response.status} ${response.statusText}`,
          errorDetails: errorData,
        };
      }

      const result = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
      if (result.errors) {
        return {
          success: false,
          error: result.errors[0]?.message || 'GraphQL error',
          errorDetails: result.errors,
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorDetails: error,
      };
    }
  }

  // ============================================================================
  // Issues
  // ============================================================================

  async createIssue(title: string, body: string, labels?: string[], assignees?: string[]): Promise<ActionResult<GitHubIssue>> {
    return this.request<GitHubIssue>('POST', `/repos/${this.owner}/${this.repo}/issues`, {
      title,
      body,
      labels,
      assignees,
    });
  }

  async updateIssue(
    issueNumber: number,
    updates: { title?: string; body?: string; state?: 'open' | 'closed'; labels?: string[]; assignees?: string[] }
  ): Promise<ActionResult<GitHubIssue>> {
    return this.request<GitHubIssue>('PATCH', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, updates);
  }

  async getIssue(issueNumber: number): Promise<ActionResult<GitHubIssue>> {
    return this.request<GitHubIssue>('GET', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`);
  }

  async createIssueComment(issueNumber: number, body: string): Promise<ActionResult<GitHubComment>> {
    return this.request<GitHubComment>('POST', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`, { body });
  }

  async updateIssueComment(commentId: number, body: string): Promise<ActionResult<GitHubComment>> {
    return this.request<GitHubComment>('PATCH', `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`, { body });
  }

  async deleteIssueComment(commentId: number): Promise<ActionResult<void>> {
    return this.request<void>('DELETE', `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`);
  }

  async addIssueReaction(
    issueNumber: number,
    reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'
  ): Promise<ActionResult<GitHubReaction>> {
    return this.request<GitHubReaction>('POST', `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/reactions`, {
      content: reaction,
    });
  }

  async addIssueCommentReaction(
    commentId: number,
    reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'
  ): Promise<ActionResult<GitHubReaction>> {
    return this.request<GitHubReaction>('POST', `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}/reactions`, {
      content: reaction,
    });
  }

  // ============================================================================
  // Pull Requests
  // ============================================================================

  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string,
    draft?: boolean
  ): Promise<ActionResult<GitHubPullRequest>> {
    return this.request<GitHubPullRequest>('POST', `/repos/${this.owner}/${this.repo}/pulls`, {
      title,
      body,
      head,
      base,
      draft,
    });
  }

  async updatePullRequest(
    pullNumber: number,
    updates: { title?: string; body?: string; state?: 'open' | 'closed'; base?: string }
  ): Promise<ActionResult<GitHubPullRequest>> {
    return this.request<GitHubPullRequest>('PATCH', `/repos/${this.owner}/${this.repo}/pulls/${pullNumber}`, updates);
  }

  async getPullRequest(pullNumber: number): Promise<ActionResult<GitHubPullRequest>> {
    return this.request<GitHubPullRequest>('GET', `/repos/${this.owner}/${this.repo}/pulls/${pullNumber}`);
  }

  async createPullRequestComment(pullNumber: number, body: string): Promise<ActionResult<GitHubComment>> {
    // PR comments use the issues API
    return this.request<GitHubComment>('POST', `/repos/${this.owner}/${this.repo}/issues/${pullNumber}/comments`, { body });
  }

  async createPullRequestReviewComment(
    pullNumber: number,
    body: string,
    commitId: string,
    path: string,
    line: number
  ): Promise<ActionResult<GitHubComment>> {
    return this.request<GitHubComment>('POST', `/repos/${this.owner}/${this.repo}/pulls/${pullNumber}/comments`, {
      body,
      commit_id: commitId,
      path,
      line,
    });
  }

  async replyToPullRequestReviewComment(pullNumber: number, commentId: number, body: string): Promise<ActionResult<GitHubComment>> {
    return this.request<GitHubComment>('POST', `/repos/${this.owner}/${this.repo}/pulls/${pullNumber}/comments/${commentId}/replies`, {
      body,
    });
  }

  async addPullRequestReaction(
    pullNumber: number,
    reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'
  ): Promise<ActionResult<GitHubReaction>> {
    // PR reactions use the issues API
    return this.request<GitHubReaction>('POST', `/repos/${this.owner}/${this.repo}/issues/${pullNumber}/reactions`, {
      content: reaction,
    });
  }

  // ============================================================================
  // Discussions (GraphQL API)
  // ============================================================================

  async getDiscussion(discussionNumber: number): Promise<ActionResult<GitHubDiscussion>> {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) {
            id
            number
            title
            body
            url
            createdAt
            updatedAt
            author {
              login
              avatarUrl
            }
            category {
              id
              name
              emoji
            }
          }
        }
      }
    `;

    const result = await this.graphql<{ repository: { discussion: GitHubDiscussion } }>(query, {
      owner: this.owner,
      repo: this.repo,
      number: discussionNumber,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorDetails: result.errorDetails,
      };
    }

    return {
      success: true,
      data: result.data?.repository.discussion,
    };
  }

  async getDiscussionId(discussionNumber: number): Promise<ActionResult<string>> {
    const query = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) {
            id
          }
        }
      }
    `;

    const result = await this.graphql<{ repository: { discussion: { id: string } } }>(query, {
      owner: this.owner,
      repo: this.repo,
      number: discussionNumber,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorDetails: result.errorDetails,
      };
    }

    return {
      success: true,
      data: result.data?.repository.discussion.id,
    };
  }

  async getDiscussionCommentId(commentId: number): Promise<ActionResult<string>> {
    // Discussion comments use GraphQL node IDs, but we need to convert from REST API comment ID
    // This is a workaround since GitHub doesn't provide a direct way to get the node ID from the comment number
    // We'll use the node ID format: DC_xxxx for discussion comments
    const query = `
      query($id: ID!) {
        node(id: $id) {
          ... on DiscussionComment {
            id
          }
        }
      }
    `;

    // Try to construct a node ID - this is a simplified approach
    // In practice, you'd need to query for the comment ID through the discussion
    return {
      success: false,
      error: 'Discussion comment ID lookup requires discussion context. Use createDiscussionComment with discussionNumber only.',
    };
  }

  async createDiscussionComment(
    discussionNumber: number,
    body: string,
    replyToId?: string
  ): Promise<ActionResult<{ id: string; body: string; url: string }>> {
    // First, get the discussion ID
    const discussionResult = await this.getDiscussionId(discussionNumber);
    if (!discussionResult.success || !discussionResult.data) {
      return {
        success: false,
        error: discussionResult.error || 'Failed to get discussion ID',
        errorDetails: discussionResult.errorDetails,
      };
    }

    const mutation = `
      mutation($discussionId: ID!, $body: String!, $replyToId: ID) {
        addDiscussionComment(input: { discussionId: $discussionId, body: $body, replyToId: $replyToId }) {
          comment {
            id
            body
            url
          }
        }
      }
    `;

    const result = await this.graphql<{ addDiscussionComment: { comment: { id: string; body: string; url: string } } }>(mutation, {
      discussionId: discussionResult.data,
      body,
      replyToId: replyToId || null,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorDetails: result.errorDetails,
      };
    }

    return {
      success: true,
      data: result.data?.addDiscussionComment.comment,
    };
  }

  async addDiscussionReaction(
    discussionNumber: number,
    reaction: 'THUMBS_UP' | 'THUMBS_DOWN' | 'LAUGH' | 'HOORAY' | 'CONFUSED' | 'HEART' | 'ROCKET' | 'EYES'
  ): Promise<ActionResult<{ id: string }>> {
    // First, get the discussion ID
    const discussionResult = await this.getDiscussionId(discussionNumber);
    if (!discussionResult.success || !discussionResult.data) {
      return {
        success: false,
        error: discussionResult.error || 'Failed to get discussion ID',
        errorDetails: discussionResult.errorDetails,
      };
    }

    const mutation = `
      mutation($subjectId: ID!, $content: ReactionContent!) {
        addReaction(input: { subjectId: $subjectId, content: $content }) {
          reaction {
            id
          }
        }
      }
    `;

    const result = await this.graphql<{ addReaction: { reaction: { id: string } } }>(mutation, {
      subjectId: discussionResult.data,
      content: reaction,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorDetails: result.errorDetails,
      };
    }

    return {
      success: true,
      data: result.data?.addReaction.reaction,
    };
  }
}

/**
 * Create a GitHub API client from an action context
 */
export function createGitHubClient(context: ActionContext): GitHubAPIClient {
  return new GitHubAPIClient(context);
}

export { GitHubAPIClient };
