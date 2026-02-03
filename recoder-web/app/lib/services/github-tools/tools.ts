import type { Octokit } from "@octokit/core";

/**
 * GitHub Tools - A comprehensive collection of GitHub API operations
 *
 * This module provides 30+ tools for interacting with the GitHub API including:
 * - Issue operations (create, update, close, comment)
 * - PR operations (create, update, request review, merge)
 * - PR reviews (add, dismiss)
 * - Code search
 * - Label management
 * - Assignee operations
 * - Branch operations
 * - File operations
 * - User search
 * - Repository search
 */

// =============================================================================
// ISSUE OPERATIONS
// =============================================================================

/**
 * Create a new issue in a GitHub repository
 */
export async function createIssue(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    assignees?: string[];
    labels?: string[];
    milestone?: number;
  }
) {
  const { owner, repo, title, body, assignees, labels, milestone } = params;
  const response = await octokit.request("POST /repos/{owner}/{repo}/issues", {
    owner,
    repo,
    title,
    body,
    assignees,
    labels,
    milestone,
  });
  return response.data;
}

/**
 * Get details of a specific issue
 */
export async function getIssue(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
  }
) {
  const { owner, repo, issueNumber } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}",
    {
      owner,
      repo,
      issue_number: issueNumber,
    }
  );
  return response.data;
}

/**
 * Update an existing issue
 */
export async function updateIssue(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    title?: string;
    body?: string;
    state?: "open" | "closed";
    assignees?: string[];
    labels?: string[];
    milestone?: number;
  }
) {
  const {
    owner,
    repo,
    issueNumber,
    title,
    body,
    state,
    assignees,
    labels,
    milestone,
  } = params;
  const response = await octokit.request(
    "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
    {
      owner,
      repo,
      issue_number: issueNumber,
      title,
      body,
      state,
      assignees,
      labels,
      milestone,
    }
  );
  return response.data;
}

/**
 * Close an issue
 */
export async function closeIssue(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    stateReason?: "completed" | "not_planned";
  }
) {
  const { owner, repo, issueNumber, stateReason } = params;
  const response = await octokit.request(
    "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
    {
      owner,
      repo,
      issue_number: issueNumber,
      state: "closed",
      state_reason: stateReason,
    }
  );
  return response.data;
}

/**
 * Reopen a closed issue
 */
export async function reopenIssue(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
  }
) {
  const { owner, repo, issueNumber } = params;
  const response = await octokit.request(
    "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
    {
      owner,
      repo,
      issue_number: issueNumber,
      state: "open",
    }
  );
  return response.data;
}

/**
 * Add a comment to an issue
 */
export async function addIssueComment(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }
) {
  const { owner, repo, issueNumber, body } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner,
      repo,
      issue_number: issueNumber,
      body,
    }
  );
  return response.data;
}

/**
 * Get comments on an issue
 */
export async function getIssueComments(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, issueNumber, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner,
      repo,
      issue_number: issueNumber,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

/**
 * Update an issue comment
 */
export async function updateIssueComment(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    commentId: number;
    body: string;
  }
) {
  const { owner, repo, commentId, body } = params;
  const response = await octokit.request(
    "PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}",
    {
      owner,
      repo,
      comment_id: commentId,
      body,
    }
  );
  return response.data;
}

/**
 * Delete an issue comment
 */
export async function deleteIssueComment(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    commentId: number;
  }
) {
  const { owner, repo, commentId } = params;
  await octokit.request(
    "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}",
    {
      owner,
      repo,
      comment_id: commentId,
    }
  );
  return { success: true };
}

/**
 * List issues in a repository with filtering
 */
export async function listIssues(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    labels?: string[];
    sort?: "created" | "updated" | "comments";
    direction?: "asc" | "desc";
    since?: string;
    page?: number;
    perPage?: number;
  }
) {
  const {
    owner,
    repo,
    state,
    labels,
    sort,
    direction,
    since,
    page,
    perPage,
  } = params;
  const response = await octokit.request("GET /repos/{owner}/{repo}/issues", {
    owner,
    repo,
    state,
    labels: labels?.join(","),
    sort,
    direction,
    since,
    page,
    per_page: perPage,
  });
  return response.data;
}

/**
 * Search for issues across GitHub
 */
export async function searchIssues(
  octokit: Octokit,
  params: {
    q: string;
    sort?: "comments" | "reactions" | "reactions-+1" | "reactions--1" | "reactions-smile" | "reactions-thinking_face" | "reactions-heart" | "reactions-tada" | "interactions" | "created" | "updated";
    order?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }
) {
  const { q, sort, order, page, perPage } = params;
  const response = await octokit.request("GET /search/issues", {
    q,
    sort,
    order,
    page,
    per_page: perPage,
  });
  return response.data;
}

// =============================================================================
// PULL REQUEST OPERATIONS
// =============================================================================

/**
 * Create a new pull request
 */
export async function createPullRequest(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
    maintainerCanModify?: boolean;
  }
) {
  const { owner, repo, title, head, base, body, draft, maintainerCanModify } =
    params;
  const response = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    title,
    head,
    base,
    body,
    draft: draft || false,
    maintainer_can_modify: maintainerCanModify,
  });
  return response.data;
}

/**
 * Get details of a specific pull request
 */
export async function getPullRequest(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
  }
) {
  const { owner, repo, pullNumber } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: pullNumber,
    }
  );
  return response.data;
}

/**
 * Update a pull request
 */
export async function updatePullRequest(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    title?: string;
    body?: string;
    state?: "open" | "closed";
    base?: string;
    maintainerCanModify?: boolean;
  }
) {
  const { owner, repo, pullNumber, title, body, state, base, maintainerCanModify } =
    params;
  const response = await octokit.request(
    "PATCH /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: pullNumber,
      title,
      body,
      state,
      base,
      maintainer_can_modify: maintainerCanModify,
    }
  );
  return response.data;
}

/**
 * List pull requests in a repository
 */
export async function listPullRequests(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    head?: string;
    base?: string;
    sort?: "created" | "updated" | "popularity" | "long-running";
    direction?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, state, head, base, sort, direction, page, perPage } =
    params;
  const response = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state,
    head,
    base,
    sort,
    direction,
    page,
    per_page: perPage,
  });
  return response.data;
}

/**
 * Merge a pull request
 */
export async function mergePullRequest(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    commitTitle?: string;
    commitMessage?: string;
    mergeMethod?: "merge" | "squash" | "rebase";
  }
) {
  const { owner, repo, pullNumber, commitTitle, commitMessage, mergeMethod } =
    params;
  const response = await octokit.request(
    "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
    {
      owner,
      repo,
      pull_number: pullNumber,
      commit_title: commitTitle,
      commit_message: commitMessage,
      merge_method: mergeMethod,
    }
  );
  return response.data;
}

/**
 * Get files changed in a pull request
 */
export async function getPullRequestFiles(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, pullNumber, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
    {
      owner,
      repo,
      pull_number: pullNumber,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

/**
 * Get commits in a pull request
 */
export async function getPullRequestCommits(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, pullNumber, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits",
    {
      owner,
      repo,
      pull_number: pullNumber,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

/**
 * Update a pull request branch with the latest from base
 */
export async function updatePullRequestBranch(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    expectedHeadSha?: string;
  }
) {
  const { owner, repo, pullNumber, expectedHeadSha } = params;
  const response = await octokit.request(
    "PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch",
    {
      owner,
      repo,
      pull_number: pullNumber,
      expected_head_sha: expectedHeadSha,
    }
  );
  return response.data;
}

/**
 * Get the combined status of a pull request
 */
export async function getPullRequestStatus(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
  }
) {
  const { owner, repo, pullNumber } = params;

  // First get the PR to get the head sha
  const prResponse = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number: pullNumber,
    }
  );

  const sha = prResponse.data.head.sha;

  // Then get the combined status
  const statusResponse = await octokit.request(
    "GET /repos/{owner}/{repo}/commits/{ref}/status",
    {
      owner,
      repo,
      ref: sha,
    }
  );

  return statusResponse.data;
}

/**
 * Search for pull requests
 */
export async function searchPullRequests(
  octokit: Octokit,
  params: {
    q: string;
    sort?: "comments" | "reactions" | "reactions-+1" | "reactions--1" | "reactions-smile" | "reactions-thinking_face" | "reactions-heart" | "reactions-tada" | "interactions" | "created" | "updated";
    order?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }
) {
  const { q, sort, order, page, perPage } = params;
  const response = await octokit.request("GET /search/issues", {
    q: `${q} type:pr`,
    sort,
    order,
    page,
    per_page: perPage,
  });
  return response.data;
}

// =============================================================================
// PR REVIEW OPERATIONS
// =============================================================================

/**
 * Create a pull request review
 */
export async function createPullRequestReview(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
    body?: string;
    commitId?: string;
    comments?: Array<{
      path: string;
      body: string;
      position?: number;
      line?: number;
      side?: "LEFT" | "RIGHT";
      start_line?: number;
      start_side?: "LEFT" | "RIGHT";
    }>;
  }
) {
  const { owner, repo, pullNumber, event, body, commitId, comments } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
    {
      owner,
      repo,
      pull_number: pullNumber,
      event,
      body,
      commit_id: commitId,
      comments,
    }
  );
  return response.data;
}

/**
 * Get reviews on a pull request
 */
export async function getPullRequestReviews(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, pullNumber, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
    {
      owner,
      repo,
      pull_number: pullNumber,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

/**
 * Dismiss a pull request review
 */
export async function dismissPullRequestReview(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    reviewId: number;
    message: string;
  }
) {
  const { owner, repo, pullNumber, reviewId, message } = params;
  const response = await octokit.request(
    "PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals",
    {
      owner,
      repo,
      pull_number: pullNumber,
      review_id: reviewId,
      message,
    }
  );
  return response.data;
}

/**
 * Add a review comment to a pull request
 */
export async function addPullRequestReviewComment(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    commitId?: string;
    path?: string;
    line?: number;
    side?: "LEFT" | "RIGHT";
    startLine?: number;
    startSide?: "LEFT" | "RIGHT";
    subjectType?: "line" | "file";
    inReplyTo?: number;
  }
) {
  const {
    owner,
    repo,
    pullNumber,
    body,
    commitId,
    path,
    line,
    side,
    startLine,
    startSide,
    subjectType,
    inReplyTo,
  } = params;

  if (inReplyTo) {
    // Reply to an existing comment
    const response = await octokit.request(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
      {
        owner,
        repo,
        pull_number: pullNumber,
        comment_id: inReplyTo,
        body,
      }
    );
    return response.data;
  }

  if (!commitId || !path) {
    throw new Error("commitId and path are required for new review comments");
  }

  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
    {
      owner,
      repo,
      pull_number: pullNumber,
      body,
      commit_id: commitId,
      path,
      line,
      side,
      start_line: startLine,
      start_side: startSide,
      subject_type: subjectType,
    }
  );
  return response.data;
}

/**
 * Get review comments on a pull request
 */
export async function getPullRequestComments(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, pullNumber, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
    {
      owner,
      repo,
      pull_number: pullNumber,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

/**
 * Request reviewers for a pull request
 */
export async function requestReviewers(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    reviewers?: string[];
    teamReviewers?: string[];
  }
) {
  const { owner, repo, pullNumber, reviewers, teamReviewers } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers",
    {
      owner,
      repo,
      pull_number: pullNumber,
      reviewers,
      team_reviewers: teamReviewers,
    }
  );
  return response.data;
}

/**
 * Remove requested reviewers from a pull request
 */
export async function removeRequestedReviewers(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    reviewers?: string[];
    teamReviewers?: string[];
  }
) {
  const { owner, repo, pullNumber, reviewers, teamReviewers } = params;
  const response = await octokit.request(
    "DELETE /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers",
    {
      owner,
      repo,
      pull_number: pullNumber,
      reviewers: reviewers ?? [],
      team_reviewers: teamReviewers,
    }
  );
  return response.data;
}

// =============================================================================
// LABEL OPERATIONS
// =============================================================================

/**
 * List all labels in a repository
 */
export async function listLabels(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, page, perPage } = params;
  const response = await octokit.request("GET /repos/{owner}/{repo}/labels", {
    owner,
    repo,
    page,
    per_page: perPage,
  });
  return response.data;
}

/**
 * Create a label
 */
export async function createLabel(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    name: string;
    color: string;
    description?: string;
  }
) {
  const { owner, repo, name, color, description } = params;
  const response = await octokit.request("POST /repos/{owner}/{repo}/labels", {
    owner,
    repo,
    name,
    color,
    description,
  });
  return response.data;
}

/**
 * Update a label
 */
export async function updateLabel(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    name: string;
    newName?: string;
    color?: string;
    description?: string;
  }
) {
  const { owner, repo, name, newName, color, description } = params;
  const response = await octokit.request(
    "PATCH /repos/{owner}/{repo}/labels/{name}",
    {
      owner,
      repo,
      name,
      new_name: newName,
      color,
      description,
    }
  );
  return response.data;
}

/**
 * Delete a label
 */
export async function deleteLabel(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    name: string;
  }
) {
  const { owner, repo, name } = params;
  await octokit.request("DELETE /repos/{owner}/{repo}/labels/{name}", {
    owner,
    repo,
    name,
  });
  return { success: true };
}

/**
 * Add labels to an issue or PR
 */
export async function addLabels(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    labels: string[];
  }
) {
  const { owner, repo, issueNumber, labels } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
    {
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    }
  );
  return response.data;
}

/**
 * Remove a label from an issue or PR
 */
export async function removeLabel(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    name: string;
  }
) {
  const { owner, repo, issueNumber, name } = params;
  const response = await octokit.request(
    "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}",
    {
      owner,
      repo,
      issue_number: issueNumber,
      name,
    }
  );
  return response.data;
}

/**
 * Set all labels on an issue (replaces existing)
 */
export async function setLabels(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    labels: string[];
  }
) {
  const { owner, repo, issueNumber, labels } = params;
  const response = await octokit.request(
    "PUT /repos/{owner}/{repo}/issues/{issue_number}/labels",
    {
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    }
  );
  return response.data;
}

// =============================================================================
// ASSIGNEE OPERATIONS
// =============================================================================

/**
 * Add assignees to an issue
 */
export async function addAssignees(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    assignees: string[];
  }
) {
  const { owner, repo, issueNumber, assignees } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees",
    {
      owner,
      repo,
      issue_number: issueNumber,
      assignees,
    }
  );
  return response.data;
}

/**
 * Remove assignees from an issue
 */
export async function removeAssignees(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    assignees: string[];
  }
) {
  const { owner, repo, issueNumber, assignees } = params;
  const response = await octokit.request(
    "DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees",
    {
      owner,
      repo,
      issue_number: issueNumber,
      assignees,
    }
  );
  return response.data;
}

/**
 * List available assignees for a repository
 */
export async function listAssignees(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/assignees",
    {
      owner,
      repo,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

// =============================================================================
// BRANCH OPERATIONS
// =============================================================================

/**
 * List branches in a repository
 */
export async function listBranches(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    protected?: boolean;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, page, perPage } = params;
  const response = await octokit.request("GET /repos/{owner}/{repo}/branches", {
    owner,
    repo,
    page,
    per_page: perPage,
  });
  return response.data;
}

/**
 * Get a specific branch
 */
export async function getBranch(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    branch: string;
  }
) {
  const { owner, repo, branch } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/branches/{branch}",
    {
      owner,
      repo,
      branch,
    }
  );
  return response.data;
}

/**
 * Create a new branch
 */
export async function createBranch(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    branch: string;
    fromBranch?: string;
  }
) {
  const { owner, repo, branch, fromBranch } = params;

  // Get the SHA for the source branch
  let sourceBranch = fromBranch;
  if (!sourceBranch) {
    const repoData = await octokit.request("GET /repos/{owner}/{repo}", {
      owner,
      repo,
    });
    sourceBranch = repoData.data.default_branch;
  }

  const refData = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/heads/{branch}",
    {
      owner,
      repo,
      branch: sourceBranch,
    }
  );

  // Create the new branch
  const response = await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: refData.data.object.sha,
  });

  return response.data;
}

/**
 * Delete a branch
 */
export async function deleteBranch(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    branch: string;
  }
) {
  const { owner, repo, branch } = params;
  await octokit.request("DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}", {
    owner,
    repo,
    branch,
  });
  return { success: true };
}

// =============================================================================
// FILE OPERATIONS
// =============================================================================

/**
 * Get file contents from a repository
 */
export async function getFileContents(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    path: string;
    branch?: string;
  }
) {
  const { owner, repo, path, branch } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/contents/{path}",
    {
      owner,
      repo,
      path,
      ref: branch,
    }
  );
  return response.data;
}

/**
 * Create or update a file in a repository
 */
export async function createOrUpdateFile(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch: string;
    sha?: string;
  }
) {
  const { owner, repo, path, content, message, branch, sha } = params;

  // Convert content to base64
  const contentBase64 = Buffer.from(content).toString("base64");

  const response = await octokit.request(
    "PUT /repos/{owner}/{repo}/contents/{path}",
    {
      owner,
      repo,
      path,
      message,
      content: contentBase64,
      branch,
      sha,
    }
  );

  return response.data;
}

/**
 * Delete a file from a repository
 */
export async function deleteFile(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    sha: string;
    branch?: string;
  }
) {
  const { owner, repo, path, message, sha, branch } = params;
  const response = await octokit.request(
    "DELETE /repos/{owner}/{repo}/contents/{path}",
    {
      owner,
      repo,
      path,
      message,
      sha,
      branch,
    }
  );
  return response.data;
}

// =============================================================================
// COMMIT OPERATIONS
// =============================================================================

/**
 * Get a specific commit
 */
export async function getCommit(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    sha: string;
  }
) {
  const { owner, repo, sha } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/commits/{ref}",
    {
      owner,
      repo,
      ref: sha,
    }
  );
  return response.data;
}

/**
 * List commits in a repository
 */
export async function listCommits(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    sha?: string;
    path?: string;
    author?: string;
    since?: string;
    until?: string;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, sha, path, author, since, until, page, perPage } = params;
  const response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
    owner,
    repo,
    sha,
    path,
    author,
    since,
    until,
    page,
    per_page: perPage,
  });
  return response.data;
}

/**
 * Compare two commits
 */
export async function compareCommits(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    base: string;
    head: string;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, base, head, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/compare/{basehead}",
    {
      owner,
      repo,
      basehead: `${base}...${head}`,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

// =============================================================================
// CODE SEARCH
// =============================================================================

/**
 * Search for code across GitHub
 */
export async function searchCode(
  octokit: Octokit,
  params: {
    q: string;
    sort?: "indexed";
    order?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }
) {
  const { q, sort, order, page, perPage } = params;
  const response = await octokit.request("GET /search/code", {
    q,
    sort,
    order,
    page,
    per_page: perPage,
  });
  return response.data;
}

// =============================================================================
// REPOSITORY OPERATIONS
// =============================================================================

/**
 * Get repository details
 */
export async function getRepository(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
  }
) {
  const { owner, repo } = params;
  const response = await octokit.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  return response.data;
}

/**
 * Search repositories
 */
export async function searchRepositories(
  octokit: Octokit,
  params: {
    query: string;
    sort?: "stars" | "forks" | "help-wanted-issues" | "updated";
    order?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }
) {
  const { query, sort, order, page, perPage } = params;
  const response = await octokit.request("GET /search/repositories", {
    q: query,
    sort,
    order,
    page,
    per_page: perPage,
  });
  return response.data;
}

/**
 * Fork a repository
 */
export async function forkRepository(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    organization?: string;
    name?: string;
    defaultBranchOnly?: boolean;
  }
) {
  const { owner, repo, organization, name, defaultBranchOnly } = params;
  const response = await octokit.request("POST /repos/{owner}/{repo}/forks", {
    owner,
    repo,
    organization,
    name,
    default_branch_only: defaultBranchOnly,
  });
  return response.data;
}

// =============================================================================
// USER OPERATIONS
// =============================================================================

/**
 * Get the authenticated user
 */
export async function getAuthenticatedUser(octokit: Octokit) {
  const response = await octokit.request("GET /user");
  return response.data;
}

/**
 * Get a user by username
 */
export async function getUser(
  octokit: Octokit,
  params: {
    username: string;
  }
) {
  const { username } = params;
  const response = await octokit.request("GET /users/{username}", {
    username,
  });
  return response.data;
}

/**
 * Search users
 */
export async function searchUsers(
  octokit: Octokit,
  params: {
    q: string;
    sort?: "followers" | "repositories" | "joined";
    order?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }
) {
  const { q, sort, order, page, perPage } = params;
  const response = await octokit.request("GET /search/users", {
    q,
    sort,
    order,
    page,
    per_page: perPage,
  });
  return response.data;
}

// =============================================================================
// MILESTONE OPERATIONS
// =============================================================================

/**
 * List milestones in a repository
 */
export async function listMilestones(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    sort?: "due_on" | "completeness";
    direction?: "asc" | "desc";
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, state, sort, direction, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/milestones",
    {
      owner,
      repo,
      state,
      sort,
      direction,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

/**
 * Create a milestone
 */
export async function createMilestone(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    title: string;
    state?: "open" | "closed";
    description?: string;
    dueOn?: string;
  }
) {
  const { owner, repo, title, state, description, dueOn } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/milestones",
    {
      owner,
      repo,
      title,
      state,
      description,
      due_on: dueOn,
    }
  );
  return response.data;
}

/**
 * Update a milestone
 */
export async function updateMilestone(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    milestoneNumber: number;
    title?: string;
    state?: "open" | "closed";
    description?: string;
    dueOn?: string;
  }
) {
  const { owner, repo, milestoneNumber, title, state, description, dueOn } =
    params;
  const response = await octokit.request(
    "PATCH /repos/{owner}/{repo}/milestones/{milestone_number}",
    {
      owner,
      repo,
      milestone_number: milestoneNumber,
      title,
      state,
      description,
      due_on: dueOn,
    }
  );
  return response.data;
}

/**
 * Delete a milestone
 */
export async function deleteMilestone(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    milestoneNumber: number;
  }
) {
  const { owner, repo, milestoneNumber } = params;
  await octokit.request(
    "DELETE /repos/{owner}/{repo}/milestones/{milestone_number}",
    {
      owner,
      repo,
      milestone_number: milestoneNumber,
    }
  );
  return { success: true };
}

// =============================================================================
// REACTION OPERATIONS
// =============================================================================

/**
 * Add a reaction to an issue
 */
export async function addIssueReaction(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    issueNumber: number;
    content: "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes";
  }
) {
  const { owner, repo, issueNumber, content } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/reactions",
    {
      owner,
      repo,
      issue_number: issueNumber,
      content,
    }
  );
  return response.data;
}

/**
 * Add a reaction to an issue comment
 */
export async function addIssueCommentReaction(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    commentId: number;
    content: "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes";
  }
) {
  const { owner, repo, commentId, content } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
    {
      owner,
      repo,
      comment_id: commentId,
      content,
    }
  );
  return response.data;
}

/**
 * Add a reaction to a pull request review comment
 */
export async function addPullRequestReviewCommentReaction(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    commentId: number;
    content: "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes";
  }
) {
  const { owner, repo, commentId, content } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions",
    {
      owner,
      repo,
      comment_id: commentId,
      content,
    }
  );
  return response.data;
}

// =============================================================================
// RELEASE OPERATIONS
// =============================================================================

/**
 * List releases in a repository
 */
export async function listReleases(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    page?: number;
    perPage?: number;
  }
) {
  const { owner, repo, page, perPage } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/releases",
    {
      owner,
      repo,
      page,
      per_page: perPage,
    }
  );
  return response.data;
}

/**
 * Get the latest release
 */
export async function getLatestRelease(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
  }
) {
  const { owner, repo } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/releases/latest",
    {
      owner,
      repo,
    }
  );
  return response.data;
}

/**
 * Create a release
 */
export async function createRelease(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    tagName: string;
    targetCommitish?: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    generateReleaseNotes?: boolean;
  }
) {
  const {
    owner,
    repo,
    tagName,
    targetCommitish,
    name,
    body,
    draft,
    prerelease,
    generateReleaseNotes,
  } = params;
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/releases",
    {
      owner,
      repo,
      tag_name: tagName,
      target_commitish: targetCommitish,
      name,
      body,
      draft,
      prerelease,
      generate_release_notes: generateReleaseNotes,
    }
  );
  return response.data;
}

// =============================================================================
// TREE AND BLOB OPERATIONS
// =============================================================================

/**
 * Get a tree (directory listing)
 */
export async function getTree(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    treeSha: string;
    recursive?: boolean;
  }
) {
  const { owner, repo, treeSha, recursive } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
    {
      owner,
      repo,
      tree_sha: treeSha,
      recursive: recursive ? "true" : undefined,
    }
  );
  return response.data;
}

/**
 * Get a blob (file content)
 */
export async function getBlob(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    fileSha: string;
  }
) {
  const { owner, repo, fileSha } = params;
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
    {
      owner,
      repo,
      file_sha: fileSha,
    }
  );
  return response.data;
}

// =============================================================================
// GIST OPERATIONS
// =============================================================================

/**
 * List gists for the authenticated user
 */
export async function listGists(
  octokit: Octokit,
  params?: {
    since?: string;
    page?: number;
    perPage?: number;
  }
) {
  const response = await octokit.request("GET /gists", {
    since: params?.since,
    page: params?.page,
    per_page: params?.perPage,
  });
  return response.data;
}

/**
 * Create a gist
 */
export async function createGist(
  octokit: Octokit,
  params: {
    files: Record<string, { content: string }>;
    description?: string;
    public?: boolean;
  }
) {
  const { files, description } = params;
  const response = await octokit.request("POST /gists", {
    files,
    description,
    public: params.public ?? false,
  });
  return response.data;
}

/**
 * Get a gist
 */
export async function getGist(
  octokit: Octokit,
  params: {
    gistId: string;
  }
) {
  const { gistId } = params;
  const response = await octokit.request("GET /gists/{gist_id}", {
    gist_id: gistId,
  });
  return response.data;
}

/**
 * Update a gist
 */
export async function updateGist(
  octokit: Octokit,
  params: {
    gistId: string;
    files?: Record<string, { content?: string; filename?: string } | null>;
    description?: string;
  }
) {
  const { gistId, files, description } = params;
  const response = await octokit.request("PATCH /gists/{gist_id}", {
    gist_id: gistId,
    files: files as Record<string, { content?: string; filename?: string }> | undefined,
    description,
  });
  return response.data;
}

/**
 * Delete a gist
 */
export async function deleteGist(
  octokit: Octokit,
  params: {
    gistId: string;
  }
) {
  const { gistId } = params;
  await octokit.request("DELETE /gists/{gist_id}", {
    gist_id: gistId,
  });
  return { success: true };
}
