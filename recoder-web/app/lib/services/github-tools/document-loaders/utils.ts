import { DocumentLoaderError } from "./types";
import type { GitHubAuthConfig } from "../types";

/**
 * Handle GitHub client initialization errors
 */
export function handleGitHubClientError(
  error: unknown,
  authConfig: GitHubAuthConfig
): never {
  if (authConfig.strategy === "app-installation") {
    if (
      error instanceof Error &&
      "status" in error &&
      (error as { status: number }).status === 404
    ) {
      throw DocumentLoaderError.notFound(
        `/app/installations/${authConfig.installationId}/access_tokens`,
        error,
        {
          source: "github",
          resourceType: "AppInstallation",
          statusCode: 404,
        }
      );
    }
  }
  throw error;
}

/**
 * Execute a GitHub REST API request with retry logic and error handling
 */
export async function executeRestRequest<T>(
  operation: () => Promise<T>,
  resourceType: string,
  resourcePath: string,
  currentAttempt = 0,
  maxAttempt = 3
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      typeof (error as { status: number }).status === "number"
    ) {
      const status = (error as { status: number }).status;

      // Handle 5xx errors with retry
      if (status >= 500) {
        if (currentAttempt >= maxAttempt) {
          throw DocumentLoaderError.fetchError(
            "github",
            `fetching ${resourceType}`,
            error,
            {
              statusCode: status,
              resourceType,
              resourcePath,
              retryAttempts: currentAttempt,
              maxAttempts: maxAttempt,
            }
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** currentAttempt * 1000)
        );
        return executeRestRequest(
          operation,
          resourceType,
          resourcePath,
          currentAttempt + 1,
          maxAttempt
        );
      }

      // Handle 404 errors
      if (status === 404) {
        throw DocumentLoaderError.notFound(resourcePath, error, {
          source: "github",
          resourceType,
          statusCode: 404,
        });
      }

      // Handle rate limit errors (403, 429)
      if (status === 403 || status === 429) {
        const headers = (error as { response?: { headers?: Record<string, string> } }).response?.headers;
        throw DocumentLoaderError.rateLimited(
          "github",
          headers?.["retry-after"],
          error,
          {
            statusCode: status,
            resourceType,
            resourcePath,
          }
        );
      }

      // Other 4xx errors
      if (status >= 400 && status < 500) {
        throw DocumentLoaderError.fetchError(
          "github",
          `fetching ${resourceType}`,
          error,
          {
            statusCode: status,
            resourceType,
            resourcePath,
            errorMessage: error.message,
          }
        );
      }
    }
    // Re-throw any other errors
    throw error;
  }
}
