import type { Octokit } from "@octokit/core";
import { type Document, type DocumentLoader, DocumentLoaderError } from "../types";
import { deleteFromCache, getCache, setCache, issueDetailsCache } from "./cache";
import { type FetchContext, fetchIssueDetails, fetchIssuesMetadata } from "./fetchers";
import type { GitHubIssueMetadata, GitHubIssuesLoaderConfig, IssueDetails } from "./types";

const DEFAULT_CONTENT_LENGTH_LIMIT = 1024 * 8; // 8KB

/**
 * Create a document loader for GitHub issues
 * Loads issue titles, bodies, and comments as separate documents
 */
export function createGitHubIssuesLoader(
  octokit: Octokit,
  config: GitHubIssuesLoaderConfig
): DocumentLoader<GitHubIssueMetadata> {
  const {
    owner,
    repo,
    perPage = 100,
    maxPages = 10,
    maxContentLength = DEFAULT_CONTENT_LENGTH_LIMIT,
  } = config;

  function getIssueDetails(
    issueNumber: number,
    issueUpdatedAt: string
  ): Promise<IssueDetails> {
    const cached = getCache(owner, repo, issueNumber, issueUpdatedAt);
    if (cached) {
      return cached;
    }

    const promise = (async () => {
      const ctx: FetchContext = { octokit, owner, repo };
      return fetchIssueDetails(ctx, issueNumber);
    })();

    setCache(owner, repo, issueNumber, issueUpdatedAt, promise);
    promise.catch(() => {
      deleteFromCache(owner, repo, issueNumber);
    });
    return promise;
  }

  const loadMetadata = async function* (): AsyncIterable<GitHubIssueMetadata> {
    const ctx: FetchContext = { octokit, owner, repo };
    let page = 1;

    while (page <= maxPages) {
      let result: Awaited<ReturnType<typeof fetchIssuesMetadata>>;
      try {
        result = await fetchIssuesMetadata(ctx, {
          first: perPage,
          page,
        });
      } catch (error) {
        throw DocumentLoaderError.fetchError(
          "github",
          "fetching_issues_metadata",
          error instanceof Error ? error : new Error(String(error)),
          { owner, repo }
        );
      }

      for (const issue of result.issues) {
        yield {
          owner,
          repo,
          issueNumber: issue.number,
          issueState: issue.state,
          issueStateReason: issue.stateReason,
          issueUpdatedAt: issue.updatedAt,
          issueClosedAt: issue.closedAt,
          contentType: "title_body",
          contentId: "title_body",
          contentCreatedAt: issue.createdAt,
          contentEditedAt: issue.editedAt,
        } satisfies GitHubIssueMetadata;

        for (const comment of issue.comments) {
          yield {
            owner,
            repo,
            issueNumber: issue.number,
            issueState: issue.state,
            issueStateReason: issue.stateReason,
            issueUpdatedAt: issue.updatedAt,
            issueClosedAt: issue.closedAt,
            contentType: "comment",
            contentId: comment.id,
            contentCreatedAt: comment.createdAt,
            contentEditedAt: comment.editedAt,
          } satisfies GitHubIssueMetadata;
        }
      }

      if (!result.pageInfo.hasNextPage) {
        break;
      }
      page++;
    }
  };

  const loadDocument = async (
    metadata: GitHubIssueMetadata
  ): Promise<Document<GitHubIssueMetadata> | null> => {
    const {
      issueNumber,
      contentType,
      contentId,
      issueState,
      issueStateReason,
      issueUpdatedAt,
    } = metadata;

    try {
      switch (contentType) {
        case "title_body": {
          const details = await getIssueDetails(issueNumber, issueUpdatedAt);
          const content = `${details.title}\n\n${details.body}`;

          if (content.length === 0) {
            return null;
          }

          if (content.length > maxContentLength) {
            return null;
          }

          return {
            content,
            metadata,
          };
        }

        case "comment": {
          const details = await getIssueDetails(issueNumber, issueUpdatedAt);
          const comment = details.comments.find((c) => c.id === contentId);

          if (!comment) {
            return null;
          }

          if (comment.authorType === "Bot") {
            return null;
          }

          if (
            comment.body.length === 0 ||
            comment.body.length > maxContentLength
          ) {
            return null;
          }

          return {
            content: comment.body,
            metadata,
          };
        }

        default:
          return null;
      }
    } catch (error) {
      throw DocumentLoaderError.fetchError(
        "github",
        `loading_${contentType}_for_issue`,
        error instanceof Error ? error : new Error(String(error)),
        {
          owner,
          repo,
          issue_number: issueNumber,
          content_type: contentType,
          content_id: contentId,
          issue_state: issueState,
          issue_state_reason: issueStateReason,
        }
      );
    }
  };

  return { loadMetadata, loadDocument };
}
