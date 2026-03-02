import type { GitHubRepo, GitHubContent, GitHubTreeResponse } from './types';

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubService {
  private apiToken?: string;

  constructor(apiToken?: string) {
    this.apiToken = apiToken;
  }

  private async fetchGitHub(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Recoder-App/1.0'
    };

    if (this.apiToken) {
      headers['Authorization'] = `token ${this.apiToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    const response = await this.fetchGitHub(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
    return response.json();
  }

  async getRepositoryTree(owner: string, repo: string, sha: string = 'HEAD'): Promise<GitHubTreeResponse> {
    const response = await this.fetchGitHub(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`
    );
    return response.json();
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
    const response = await this.fetchGitHub(url);
    const data = await response.json() as GitHubContent;

    if (data.type !== 'file' || !data.content) {
      throw new Error(`Not a file or content not available: ${path}`);
    }

    // GitHub API returns base64 encoded content
    return atob(data.content.replace(/\n/g, ''));
  }

  async getDirectoryContents(owner: string, repo: string, path: string = '', ref?: string): Promise<GitHubContent[]> {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
    const response = await this.fetchGitHub(url);
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(`Path is not a directory: ${path}`);
    }

    return data as GitHubContent[];
  }

  async searchRepositories(query: string, sort: 'stars' | 'updated' = 'stars'): Promise<GitHubRepo[]> {
    const response = await this.fetchGitHub(
      `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=desc&per_page=50`
    );
    const data = await response.json() as { items?: GitHubRepo[] };
    return data.items || [];
  }

  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return null;

    const [, owner, repo] = match;
    return { owner, repo: repo.replace(/\.git$/, '') };
  }
}