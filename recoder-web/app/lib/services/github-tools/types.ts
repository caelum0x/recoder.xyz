/**
 * GitHub Authentication Configuration Types
 */

export interface GitHubInstallationAppAuth {
  strategy: "app-installation";
  appId: string;
  privateKey: string;
  installationId: number;
}

export interface GitHubAppAuth {
  strategy: "app";
  appId: string;
  privateKey: string;
}

export interface GitHubPersonalAccessTokenAuth {
  strategy: "personal-access-token";
  personalAccessToken: string;
}

export type GitHubAuthConfig =
  | GitHubInstallationAppAuth
  | GitHubAppAuth
  | GitHubPersonalAccessTokenAuth;

/**
 * Installation type from GitHub API
 */
export interface Installation {
  id: number;
  account: {
    login: string;
    id: number;
    type: string;
  } | null;
  repository_selection: "all" | "selected";
  access_tokens_url: string;
  repositories_url: string;
  permissions: Record<string, string>;
  events: string[];
  created_at: string;
  updated_at: string;
  single_file_name: string | null;
  app_id: number;
  target_id: number;
  target_type: string;
}
