export type ActionType = 'file' | 'shell' | 'importStarter' | 'cloneGitHub' | 'readFile' | 'listFiles' | 'searchFiles' | 'str_replace' | 'delegate_subagent' | 'ripgrep_search' | 'edit_file' | 'read_many_files' | 'web_search' | 'web_fetch' | 'memory_operation' | 'glob_search';

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

export interface ReadFileAction extends BaseAction {
  type: 'readFile';
  filePath: string;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
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
}

export interface DelegateSubagentAction extends BaseAction {
  type: 'delegate_subagent';
  taskDescription: string;
  agentType: 'coder' | 'debugger' | 'architect' | 'tester';
  context?: string;
}

export interface WebSearchAction extends BaseAction {
  type: 'web_search';
  query: string;
  maxResults?: number;
}

export interface WebFetchAction extends BaseAction {
  type: 'web_fetch';
  url: string;
  selector?: string;
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

export interface EditFileAction extends BaseAction {
  type: 'edit_file';
  filePath: string;
  operation: 'insert' | 'delete' | 'replace';
  lineNumber: number;
  content?: string;
  endLineNumber?: number;
}

export interface ReadManyFilesAction extends BaseAction {
  type: 'read_many_files';
  filePaths: string[];
  maxFileSize?: number;
}

export type RecoderAction = FileAction | ShellAction | ImportStarterAction | CloneGitHubAction | ReadFileAction | ListFilesAction | SearchFilesAction | StrReplaceAction | DelegateSubagentAction | WebSearchAction | WebFetchAction | MemoryAction | GlobAction | RipGrepAction | EditFileAction | ReadManyFilesAction;

export type RecoderActionData = RecoderAction | BaseAction;
