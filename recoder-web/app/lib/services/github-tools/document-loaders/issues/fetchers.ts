import type { Octokit } from "@octokit/core";
import { executeRestRequest } from "../utils";
import type {
  GitHubIssueState,
  GitHubIssueStateReason,
  IssueCommentDetails,
  IssueDetails,
} from "./types";

export type FetchContext = {
  octokit: Octokit;
  owner: string;
  repo: string;
};

/**
 * Fetch issues metadata from a repository using REST API
 */
export async function fetchIssuesMetadata(
  ctx: FetchContext,
  options: {
    first: number;
    page?: number;
  }
): Promise<{
  issues: Array<{
    number: number;
    state: GitHubIssueState;
    stateReason: GitHubIssueStateReason | null;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    editedAt: string;
    comments: Array<{
      id: string;
      createdAt: string;
      editedAt: string;
    }>;
  }>;
  pageInfo: {
    hasNextPage: boolean;
    page: number;
  };
}> {
  const { data: issuesData } = await executeRestRequest(
    () =>
      ctx.octokit.request("GET /repos/{owner}/{repo}/issues", {
        owner: ctx.owner,
        repo: ctx.repo,
        state: "all",
        per_page: options.first,
        page: options.page || 1,
        sort: "created",
        direction: "desc",
      }),
    "Issues",
    `${ctx.owner}/${ctx.repo}/issues`
  );

  const issues = await Promise.all(
    issuesData
      .filter((issue) => !issue.pull_request) // Filter out PRs
      .map(async (issue) => {
        // Fetch comments for each issue
        const commentsResponse = await executeRestRequest(
          () =>
            ctx.octokit.request(
              "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
              {
                owner: ctx.owner,
                repo: ctx.repo,
                issue_number: issue.number,
                per_page: 100,
              }
            ),
          "Issue Comments",
          `${ctx.owner}/${ctx.repo}/issues/${issue.number}/comments`
        );

        const comments = commentsResponse.data.map((comment) => ({
          id: comment.id.toString(),
          createdAt: comment.created_at,
          editedAt: comment.updated_at,
        }));

        return {
          number: issue.number,
          state: issue.state.toUpperCase() as GitHubIssueState,
          stateReason: issue.state_reason
            ? (issue.state_reason.toUpperCase() as GitHubIssueStateReason)
            : null,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          editedAt: issue.updated_at, // REST API doesn't have lastEditedAt
          comments,
        };
      })
  );

  // Check if there's a next page by seeing if we got the full page
  const hasNextPage = issuesData.length === options.first;

  return {
    issues,
    pageInfo: {
      hasNextPage,
      page: options.page || 1,
    },
  };
}

/**
 * Fetch details of a specific issue
 */
export async function fetchIssueDetails(
  ctx: FetchContext,
  issueNumber: number
): Promise<IssueDetails> {
  const { data: issue } = await executeRestRequest(
    () =>
      ctx.octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}", {
        owner: ctx.owner,
        repo: ctx.repo,
        issue_number: issueNumber,
      }),
    "Issue",
    `${ctx.owner}/${ctx.repo}/issues/${issueNumber}`
  );

  // Fetch comments
  const { data: commentsData } = await executeRestRequest(
    () =>
      ctx.octokit.request(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: ctx.owner,
          repo: ctx.repo,
          issue_number: issueNumber,
          per_page: 100,
        }
      ),
    "Issue Comments",
    `${ctx.owner}/${ctx.repo}/issues/${issueNumber}/comments`
  );

  const comments: IssueCommentDetails[] = commentsData.map((comment) => ({
    id: comment.id.toString(),
    body: comment.body || "",
    authorType: comment.user?.type || "Unknown",
  }));

  return {
    title: issue.title,
    body: issue.body || "",
    comments,
  };
}
