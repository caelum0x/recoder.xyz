/**
 * Barrel for the unified GitHub module (docs/modules/github.md): the ONE
 * composition over the gh CLI + the vendored recodergit engine, its single
 * truthful `GithubHealth`, and the MCP binders that bind the previously
 * advertised-but-404 `github.*` / `repo.*` catalog tools.
 */
export { GithubModule } from './github-module.js';
export type {
  GithubModuleDeps,
  GithubHealth,
  GithubFacetHealth,
  GithubCliRunner,
  GithubSearchInput,
  GithubOpenPrInput,
  GithubCommentInput,
  GithubReviewPrInput,
  GithubAnalyzeRepoInput,
} from './github-module.js';

export { githubEngineBinder, repoEngineBinder } from './github-mcp.binder.js';
export type { RepoToolsDeps } from './github-mcp.binder.js';
