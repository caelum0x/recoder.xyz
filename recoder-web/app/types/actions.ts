export type ActionType = 'file' | 'shell' | 'importStarter' | 'cloneGitHub';

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

export type BoltAction = FileAction | ShellAction | ImportStarterAction | CloneGitHubAction;

export type BoltActionData = BoltAction | BaseAction;
