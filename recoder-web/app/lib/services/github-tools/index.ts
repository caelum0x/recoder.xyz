/**
 * GitHub Tools - A comprehensive collection of GitHub API operations
 *
 * This module provides 30+ tools for interacting with the GitHub API including:
 *
 * ISSUE OPERATIONS:
 * - createIssue - Create a new issue in a repository
 * - getIssue - Get details of a specific issue
 * - updateIssue - Update an existing issue
 * - closeIssue - Close an issue with optional reason
 * - reopenIssue - Reopen a closed issue
 * - addIssueComment - Add a comment to an issue
 * - getIssueComments - Get comments on an issue
 * - updateIssueComment - Update an issue comment
 * - deleteIssueComment - Delete an issue comment
 * - listIssues - List issues with filtering
 * - searchIssues - Search issues across GitHub
 *
 * PULL REQUEST OPERATIONS:
 * - createPullRequest - Create a new pull request
 * - getPullRequest - Get details of a specific PR
 * - updatePullRequest - Update an existing PR
 * - listPullRequests - List PRs with filtering
 * - mergePullRequest - Merge a pull request
 * - getPullRequestFiles - Get files changed in a PR
 * - getPullRequestCommits - Get commits in a PR
 * - updatePullRequestBranch - Update PR branch from base
 * - getPullRequestStatus - Get combined status of PR checks
 * - searchPullRequests - Search PRs across GitHub
 *
 * PR REVIEW OPERATIONS:
 * - createPullRequestReview - Create a review (approve, request changes, comment)
 * - getPullRequestReviews - Get reviews on a PR
 * - dismissPullRequestReview - Dismiss a PR review
 * - addPullRequestReviewComment - Add a review comment
 * - getPullRequestComments - Get review comments
 * - requestReviewers - Request reviewers for a PR
 * - removeRequestedReviewers - Remove requested reviewers
 *
 * LABEL OPERATIONS:
 * - listLabels - List all labels in a repository
 * - createLabel - Create a new label
 * - updateLabel - Update an existing label
 * - deleteLabel - Delete a label
 * - addLabels - Add labels to an issue/PR
 * - removeLabel - Remove a label from an issue/PR
 * - setLabels - Set all labels on an issue (replaces existing)
 *
 * ASSIGNEE OPERATIONS:
 * - addAssignees - Add assignees to an issue
 * - removeAssignees - Remove assignees from an issue
 * - listAssignees - List available assignees for a repository
 *
 * BRANCH OPERATIONS:
 * - listBranches - List branches in a repository
 * - getBranch - Get a specific branch
 * - createBranch - Create a new branch
 * - deleteBranch - Delete a branch
 *
 * FILE OPERATIONS:
 * - getFileContents - Get file contents from a repository
 * - createOrUpdateFile - Create or update a file
 * - deleteFile - Delete a file from a repository
 *
 * COMMIT OPERATIONS:
 * - getCommit - Get a specific commit
 * - listCommits - List commits in a repository
 * - compareCommits - Compare two commits
 *
 * CODE SEARCH:
 * - searchCode - Search for code across GitHub
 *
 * REPOSITORY OPERATIONS:
 * - getRepository - Get repository details
 * - searchRepositories - Search repositories
 * - forkRepository - Fork a repository
 *
 * USER OPERATIONS:
 * - getAuthenticatedUser - Get the authenticated user
 * - getUser - Get a user by username
 * - searchUsers - Search users
 *
 * MILESTONE OPERATIONS:
 * - listMilestones - List milestones in a repository
 * - createMilestone - Create a new milestone
 * - updateMilestone - Update a milestone
 * - deleteMilestone - Delete a milestone
 *
 * REACTION OPERATIONS:
 * - addIssueReaction - Add a reaction to an issue
 * - addIssueCommentReaction - Add a reaction to an issue comment
 * - addPullRequestReviewCommentReaction - Add a reaction to a PR review comment
 *
 * RELEASE OPERATIONS:
 * - listReleases - List releases in a repository
 * - getLatestRelease - Get the latest release
 * - createRelease - Create a new release
 *
 * TREE AND BLOB OPERATIONS:
 * - getTree - Get a directory tree
 * - getBlob - Get file content by SHA
 *
 * GIST OPERATIONS:
 * - listGists - List gists for the authenticated user
 * - createGist - Create a new gist
 * - getGist - Get a gist by ID
 * - updateGist - Update a gist
 * - deleteGist - Delete a gist
 *
 * WEBHOOK OPERATIONS:
 * - verifyWebhookRequest - Verify a webhook signature
 * - parseWebhookRequest - Parse a webhook request
 * - handleWebhook - Handle a webhook with verified signature
 *
 * DOCUMENT LOADERS:
 * - createGitHubIssuesLoader - Load issues as documents
 * - createGitHubPullRequestsLoader - Load PRs as documents
 * - createGitHubTreeLoader - Load repository tree as documents
 * - createGitHubArchiveLoader - Load repository archive as documents
 */

// Core exports
export * from "./types";
export * from "./errors";
export { createOctokit, createOctokitWithToken } from "./octokit";

// Main tools
export * from "./tools";

// Webhook handling
export * from "./webhooks";

// Document loaders
export * from "./document-loaders";

// Utility functions
export { compressLargeDiff, parseDiff, createDiffSummary } from "./lib/diff-compression";

// Re-export Octokit type for convenience
export type { Octokit } from "@octokit/core";
