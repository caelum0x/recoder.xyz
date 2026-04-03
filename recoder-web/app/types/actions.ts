export type ActionType = 'file' | 'shell' | 'importStarter' | 'cloneGitHub' | 'cloneUrl' | 'readFile' | 'listFiles' | 'searchFiles' | 'str_replace' | 'delegate_subagent' | 'ripgrep_search' | 'edit_file' | 'read_many_files' | 'web_search' | 'web_fetch' | 'web_crawl' | 'github_documents' | 'copy_project' | 'memory_operation' | 'glob_search' | 'multi_apply_diff' | 'spawn_task' | 'switch_mode';

export interface BaseAction {
  content: string;
}

export interface FileAction extends BaseAction {
  type: 'file';
  filePath: string;
}

export interface ShellAction extends BaseAction {
  type: 'shell';
}

export interface ImportStarterAction extends BaseAction {
  type: 'importStarter';
  templateId: string;
  reason: string;
}

export interface CloneGitHubAction extends BaseAction {
  type: 'cloneGitHub';
  repoUrl: string;
  reason: string;
}

export interface CloneUrlAction extends BaseAction {
  type: 'cloneUrl';
  url: string;
  reason?: string;
}

export interface SpawnTaskAction extends BaseAction {
  type: 'spawn_task';
  taskDescription: string;
  mode?: 'architect' | 'code' | 'debug' | 'ask';
  context?: string;
}

export interface SwitchModeAction extends BaseAction {
  type: 'switch_mode';
  targetMode: 'architect' | 'code' | 'debug' | 'ask' | 'orchestrator';
  reason?: string;
}

export interface ReadFileAction extends BaseAction {
  type: 'readFile';
  filePath: string;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
  includeLineHashes?: boolean;
}

export interface ListFilesAction extends BaseAction {
  type: 'listFiles';
  path?: string;
  recursive?: boolean;
  query?: string; // For smart file discovery
}

export interface SearchFilesAction extends BaseAction {
  type: 'searchFiles';
  query: string;
  filePattern?: string;
}

export interface StrReplaceAction extends BaseAction {
  type: 'str_replace';
  filePath: string;
  oldString: string;
  newString: string;
  startLineRef?: string;
  endLineRef?: string;
}

export interface DelegateSubagentAction extends BaseAction {
  type: 'delegate_subagent';
  taskDescription: string;
  agentType: 'coder' | 'debugger' | 'architect' | 'tester';
  context?: string;
  strict?: boolean;
}

export interface WebSearchAction extends BaseAction {
  type: 'web_search';
  query: string;
  maxResults?: number;
  providerHint?: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
  maxUses?: number;
}

export interface WebFetchAction extends BaseAction {
  type: 'web_fetch';
  url: string;
  selector?: string;
}

export interface WebCrawlAction extends BaseAction {
  type: 'web_crawl';
  url: string;
  providerHint?: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
  maxUses?: number;
}

export interface GitHubDocumentsAction extends BaseAction {
  type: 'github_documents';
  owner: string;
  repo: string;
  accessToken?: string;
  sourceType?: 'issues' | 'pull_requests';
  maxDocuments?: number;
  maxUses?: number;
}

export interface CopyProjectAction extends BaseAction {
  type: 'copy_project';
  sourceProjectId?: string;
  newProjectName?: string;
  includeGit?: boolean;
  includeGitRemotes?: boolean;
  includeTriggers?: boolean;
  includeEnvFiles?: boolean;
  includeSecrets?: boolean;
  includeDeployConfig?: boolean;
  includeDomains?: boolean;
}

export interface MemoryAction extends BaseAction {
  type: 'memory_operation';
  operation: 'store' | 'retrieve' | 'list';
  key?: string;
  value?: string;
}

export interface GlobAction extends BaseAction {
  type: 'glob_search';
  pattern: string;
  exclude?: string[];
  maxDepth?: number;
}

export interface RipGrepAction extends BaseAction {
  type: 'ripgrep_search';
  query: string;
  filePattern?: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

export interface EditFileAction extends Omit<BaseAction, 'content'> {
  type: 'edit_file';
  filePath: string;
  operation: 'insert' | 'delete' | 'replace';
  lineNumber?: number;
  content: string; // Required for insert/replace operations
  endLineNumber?: number;
  lineRef?: string;
  endLineRef?: string;
}

export interface ReadManyFilesAction extends BaseAction {
  type: 'read_many_files';
  filePaths: string[];
  maxFileSize?: number;
}

/**
 * Multi-file atomic diff application
 * Applies multiple search/replace operations across multiple files atomically
 * If any diff fails, all changes are rolled back
 */
export interface DiffOperation {
  /** File path relative to workspace */
  filePath: string;
  /** The exact text to find and replace */
  oldString: string;
  /** The replacement text */
  newString: string;
  /** Optional start line hint for faster matching */
  startLine?: number;
}

export interface MultiApplyDiffAction extends BaseAction {
  type: 'multi_apply_diff';
  /** Array of diff operations to apply atomically */
  diffs: DiffOperation[];
  /** Optional: commit message for auto-commit after successful apply */
  commitMessage?: string;
}

export type RecoderAction = FileAction | ShellAction | ImportStarterAction | CloneGitHubAction | CloneUrlAction | SpawnTaskAction | SwitchModeAction | ReadFileAction | ListFilesAction | SearchFilesAction | StrReplaceAction | DelegateSubagentAction | WebSearchAction | WebFetchAction | WebCrawlAction | GitHubDocumentsAction | CopyProjectAction | MemoryAction | GlobAction | RipGrepAction | EditFileAction | ReadManyFilesAction | MultiApplyDiffAction;

export type RecoderActionData = RecoderAction | BaseAction;
