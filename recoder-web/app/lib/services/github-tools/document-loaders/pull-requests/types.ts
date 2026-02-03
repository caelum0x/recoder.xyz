/**
 * Types for GitHub pull requests document loader
 */

type GithubPullRequestContentType = "title_body" | "comment" | "diff";

/**
 * Metadata for GitHub Pull Request documents
 *
 * Each PR generates separate documents:
 * - title+body
 * - comments
 * - diffs
 */
export type GitHubPullRequestMetadata = {
  owner: string;
  repo: string;
  prNumber: number;
  contentType: GithubPullRequestContentType;
  contentId: string; // comment ID or file path, "title_body" for title+body
  mergedAt: string;
};

/**
 * Configuration for GitHub Pull Requests loader
 */
export type GitHubPullRequestsLoaderConfig = {
  owner: string;
  repo: string;

  perPage?: number;
  maxPages?: number;

  // Processing options
  maxContentLength?: number;
};

export type Comment = {
  id: string;
  body: string;
  authorType: "User" | "Bot" | string;
};

export type FileMetadata = {
  isGenerated: boolean;
  isBinary: boolean | null;
  byteSize: number;
  extension: string | null;
  language: string | null;
  lineCount: number | null;
};

export type PullRequestDetails = {
  title: string;
  body: string | null;
  comments: Comment[];
  files: Map<string, FileMetadata>;
};
