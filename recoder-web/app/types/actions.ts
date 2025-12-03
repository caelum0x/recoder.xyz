export type ActionType = 'file' | 'shell' | 'importStarter' | 'cloneGitHub' | 'readFile' | 'listFiles' | 'searchFiles';

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
}

export interface ListFilesAction extends BaseAction {
  type: 'listFiles';
  path?: string;
  recursive?: boolean;
}

export interface SearchFilesAction extends BaseAction {
  type: 'searchFiles';
  query: string;
  filePattern?: string;
}

export type RecoderAction = FileAction | ShellAction | ImportStarterAction | CloneGitHubAction | ReadFileAction | ListFilesAction | SearchFilesAction;

export type RecoderActionData = RecoderAction | BaseAction;
