export interface Task {
  id: string;
  title: string;
  steps: TaskStep[];
  status: 'pending' | 'running' | 'paused' | 'complete';
  requiresApproval: boolean;
}

export interface TaskStep {
  id: string;
  action: 'create_file' | 'modify_file' | 'run_command' | 'install_package';
  params: Record<string, any>;
  status: 'pending' | 'running' | 'complete' | 'failed';
  result?: any;
  error?: string;
}
