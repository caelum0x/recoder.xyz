import type { Octokit } from "@octokit/core";
import { executeRestRequest } from "../utils";
import type { Comment, FileMetadata, PullRequestDetails } from "./types";

export type FetchContext = {
  octokit: Octokit;
  owner: string;
  repo: string;
};

/**
 * Fetch diffs for a pull request
 */
export async function fetchDiffs(
  ctx: FetchContext,
  prNumber: number
): Promise<Map<string, string>> {
  const fileDiffs = new Map<string, string>();
  let page = 1;

  while (true) {
    const response = await executeRestRequest(
      () =>
        ctx.octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
          {
            owner: ctx.owner,
            repo: ctx.repo,
            pull_number: prNumber,
            per_page: 100,
            page,
          }
        ),
      "Pull Request Files",
      `${ctx.owner}/${ctx.repo}/pulls/${prNumber}/files?page=${page}`
    );

    const files = response.data;

    for (const file of files) {
      if (!file.patch) {
        continue;
      }
      fileDiffs.set(file.filename, file.patch);
    }

    const linkHeader = response.headers?.link;
    if (!linkHeader || !linkHeader.includes('rel="next"')) {
      break;
    }
    page++;
  }

  return fileDiffs;
}

/**
 * Fetch pull requests metadata from a repository
 */
export async function fetchPullRequestsMetadata(
  ctx: FetchContext,
  options: {
    first: number;
    page?: number;
    state?: "open" | "closed" | "all";
  }
): Promise<{
  pullRequests: Array<{
    number: number;
    mergedAt: string | null;
    commentIds: string[];
    filePaths: string[];
  }>;
  pageInfo: {
    hasNextPage: boolean;
    page: number;
  };
}> {
  const { data: prsData } = await executeRestRequest(
    () =>
      ctx.octokit.request("GET /repos/{owner}/{repo}/pulls", {
        owner: ctx.owner,
        repo: ctx.repo,
        state: options.state || "all",
        per_page: options.first,
        page: options.page || 1,
        sort: "created",
        direction: "desc",
      }),
    "Pull Requests",
    `${ctx.owner}/${ctx.repo}/pulls`
  );

  const pullRequests = await Promise.all(
    prsData.map(async (pr) => {
      // Fetch comments for each PR (these are issue comments on the PR)
      const { data: commentsData } = await executeRestRequest(
        () =>
          ctx.octokit.request(
            "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
            {
              owner: ctx.owner,
              repo: ctx.repo,
              issue_number: pr.number,
              per_page: 100,
            }
          ),
        "PR Comments",
        `${ctx.owner}/${ctx.repo}/issues/${pr.number}/comments`
      );

      const commentIds = commentsData
        .filter((c) => c.user?.type !== "Bot")
        .map((c) => c.id.toString());

      // Fetch files for each PR
      const { data: filesData } = await executeRestRequest(
        () =>
          ctx.octokit.request(
            "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
            {
              owner: ctx.owner,
              repo: ctx.repo,
              pull_number: pr.number,
              per_page: 100,
            }
          ),
        "PR Files",
        `${ctx.owner}/${ctx.repo}/pulls/${pr.number}/files`
      );

      const filePaths = filesData.map((f) => f.filename);

      return {
        number: pr.number,
        mergedAt: pr.merged_at,
        commentIds,
        filePaths,
      };
    })
  );

  // Check if there's a next page
  const hasNextPage = prsData.length === options.first;

  return {
    pullRequests,
    pageInfo: {
      hasNextPage,
      page: options.page || 1,
    },
  };
}

/**
 * Fetch details of a specific pull request
 */
export async function fetchPullRequestDetails(
  ctx: FetchContext,
  prNumber: number
): Promise<PullRequestDetails> {
  const { data: pr } = await executeRestRequest(
    () =>
      ctx.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner: ctx.owner,
        repo: ctx.repo,
        pull_number: prNumber,
      }),
    "Pull Request",
    `${ctx.owner}/${ctx.repo}/pulls/${prNumber}`
  );

  // Fetch comments (issue comments on PR)
  const { data: commentsData } = await executeRestRequest(
    () =>
      ctx.octokit.request(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: ctx.owner,
          repo: ctx.repo,
          issue_number: prNumber,
          per_page: 100,
        }
      ),
    "PR Comments",
    `${ctx.owner}/${ctx.repo}/issues/${prNumber}/comments`
  );

  const comments: Comment[] = commentsData.map((comment) => ({
    id: comment.id.toString(),
    body: comment.body || "",
    authorType: comment.user?.type || "Unknown",
  }));

  // Fetch files to get metadata
  const { data: filesData } = await executeRestRequest(
    () =>
      ctx.octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
        {
          owner: ctx.owner,
          repo: ctx.repo,
          pull_number: prNumber,
          per_page: 100,
        }
      ),
    "PR Files",
    `${ctx.owner}/${ctx.repo}/pulls/${prNumber}/files`
  );

  const files = new Map<string, FileMetadata>();
  for (const file of filesData) {
    const extension = file.filename.includes(".")
      ? file.filename.split(".").pop() || null
      : null;

    files.set(file.filename, {
      isGenerated: false, // REST API doesn't have this info
      isBinary: file.patch === undefined && file.changes === 0,
      byteSize: file.changes || 0,
      extension,
      language: null, // REST API doesn't have this info
      lineCount: (file.additions || 0) + (file.deletions || 0),
    });
  }

  return {
    title: pr.title,
    body: pr.body,
    comments,
    files,
  };
}
