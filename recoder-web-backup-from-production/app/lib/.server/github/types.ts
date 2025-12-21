export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  updated_at: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  content?: string;
  download_url?: string | null;
  size: number;
}

export interface GitHubTree {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  tree: GitHubTree[];
  truncated: boolean;
}

export interface TemplateRepo {
  id: string;
  name: string;
  description: string;
  repo: string;
  category: 'react' | 'vue' | 'vanilla' | 'node' | 'nextjs' | 'angular' | 'svelte' | 'astro' | 'mobile' | 'backend' | 'qwik' | 'other';
  tags: string[];
  featured: boolean;
  isLocal?: boolean;
}