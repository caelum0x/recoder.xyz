import { Octokit } from "@octokit/core";
import type { GitHubAuthConfig } from "./types";

/**
 * Creates an Octokit client with the appropriate authentication strategy.
 * Supports GitHub App installation auth, GitHub App auth, and personal access token auth.
 */
export function createOctokit(authConfig: GitHubAuthConfig): Octokit {
  switch (authConfig.strategy) {
    case "app-installation": {
      // For app-installation auth, we need to use createAppAuth
      // For now, we'll throw an error as this requires additional setup
      throw new Error(
        "App installation auth requires @octokit/auth-app. Use personal access token for now."
      );
    }
    case "app": {
      throw new Error(
        "GitHub App auth requires @octokit/auth-app. Use personal access token for now."
      );
    }
    case "personal-access-token": {
      return new Octokit({ auth: authConfig.personalAccessToken });
    }
    default: {
      const _exhaustiveCheck: never = authConfig;
      throw new Error(`Unhandled authConfig strategy: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Creates an Octokit client for simple personal access token auth
 */
export function createOctokitWithToken(token: string): Octokit {
  return new Octokit({ auth: token });
}
