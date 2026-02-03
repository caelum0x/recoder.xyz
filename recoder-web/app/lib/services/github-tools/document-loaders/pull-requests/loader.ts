import type { Octokit } from "@octokit/core";
import { type Document, type DocumentLoader, DocumentLoaderError } from "../types";
import {
  createCacheKey,
  diffsCache,
  prDetailsCache,
} from "./cache";
import type { PullRequestDetails, Comment } from "./types";
import {
  type FetchContext,
  fetchDiffs,
  fetchPullRequestDetails,
  fetchPullRequestsMetadata,
} from "./fetchers";
import type { GitHubPullRequestMetadata, GitHubPullRequestsLoaderConfig } from "./types";

/**
 * Create a document loader for GitHub pull requests
 * Loads PR titles, bodies, comments, and diffs as separate documents
 */
export function createGitHubPullRequestsLoader(
  octokit: Octokit,
  config: GitHubPullRequestsLoaderConfig
): DocumentLoader<GitHubPullRequestMetadata> {
  const {
    owner,
    repo,
    perPage = 100,
    maxPages = 10,
    maxContentLength = 1024 * 8, // 8KB limit per content (diff/comment)
  } = config;

  function getPullRequestDetails(prNumber: number): Promise<PullRequestDetails> {
    const cached = prDetailsCache.get(prNumber);
    if (cached) {
      return cached;
    }

    const promise = (async () => {
      const ctx: FetchContext = { octokit, owner, repo };
      return fetchPullRequestDetails(ctx, prNumber);
    })();

    prDetailsCache.set(prNumber, promise);
    promise.catch(() => prDetailsCache.delete(prNumber));
    return promise;
  }

  function getDiffs(prNumber: number): Promise<Map<string, string>> {
    const cacheKey = createCacheKey(owner, repo, prNumber);

    const existingPromise = diffsCache.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (() => {
      const ctx: FetchContext = { octokit, owner, repo };
      return fetchDiffs(ctx, prNumber);
    })();

    diffsCache.set(cacheKey, promise);
    promise.catch(() => {
      diffsCache.delete(cacheKey);
    });
    return promise;
  }

  const loadMetadata = async function* (): AsyncIterable<GitHubPullRequestMetadata> {
    const ctx: FetchContext = { octokit, owner, repo };
    let page = 1;

    while (page <= maxPages) {
      let result: Awaited<ReturnType<typeof fetchPullRequestsMetadata>>;
      try {
        result = await fetchPullRequestsMetadata(ctx, {
          first: perPage,
          page,
        });
      } catch (error) {
        throw DocumentLoaderError.fetchError(
          "github",
          "fetching_pull_requests_metadata",
          error instanceof Error ? error : new Error(String(error)),
          { owner, repo }
        );
      }

      for (const pr of result.pullRequests) {
        if (!pr.mergedAt) continue;

        yield {
          owner,
          repo,
          prNumber: pr.number,
          contentType: "title_body",
          contentId: "title_body",
          mergedAt: pr.mergedAt,
        };

        for (const commentId of pr.commentIds) {
          yield {
            owner,
            repo,
            prNumber: pr.number,
            contentType: "comment",
            contentId: commentId,
            mergedAt: pr.mergedAt,
          };
        }

        for (const filepath of pr.filePaths) {
          yield {
            owner,
            repo,
            prNumber: pr.number,
            contentType: "diff",
            contentId: filepath,
            mergedAt: pr.mergedAt,
          };
        }
      }

      if (!result.pageInfo.hasNextPage) break;
      page++;
    }
  };

  const loadDocument = async (
    metadata: GitHubPullRequestMetadata
  ): Promise<Document<GitHubPullRequestMetadata> | null> => {
    const {
      prNumber: pr_number,
      contentType: content_type,
      contentId: content_id,
    } = metadata;

    try {
      switch (content_type) {
        case "title_body": {
          const details = await getPullRequestDetails(pr_number);
          return {
            content: `${details.title}\n\n${details.body || ""}`,
            metadata,
          };
        }

        case "comment": {
          const details = await getPullRequestDetails(pr_number);
          const comment = details.comments.find((c: Comment) => c.id === content_id);

          if (
            !comment ||
            comment.authorType === "Bot" ||
            comment.body.length > maxContentLength
          ) {
            return null;
          }

          return {
            content: comment.body,
            metadata,
          };
        }

        case "diff": {
          const details = await getPullRequestDetails(pr_number);
          const fileMetadata = details.files.get(content_id);

          if (fileMetadata?.isGenerated || fileMetadata?.isBinary === true) {
            return null;
          }

          const diffs = await getDiffs(pr_number);
          const diff = diffs.get(content_id);

          if (!diff || diff.length > maxContentLength) {
            return null;
          }

          return {
            content: `File: ${content_id}\n\n${diff}`,
            metadata,
          };
        }

        default:
          return null;
      }
    } catch (error) {
      throw DocumentLoaderError.fetchError(
        "github",
        `loading_${content_type}_for_pr`,
        error instanceof Error ? error : new Error(String(error)),
        {
          owner,
          repo,
          pr_number,
          content_type,
          content_id,
        }
      );
    }
  };

  return { loadMetadata, loadDocument };
}
