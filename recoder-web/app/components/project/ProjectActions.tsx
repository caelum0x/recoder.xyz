/**
 * Project Actions - Combined Download & GitHub Push buttons
 */

import { DownloadButton, DownloadIconButton } from './DownloadButton';
import { PushToGitHubButton, PushToGitHubIconButton } from './PushToGitHubButton';

interface ProjectActionsProps {
  projectId: string;
  projectName?: string;
  className?: string;
  variant?: 'buttons' | 'icons' | 'dropdown';
  size?: 'default' | 'sm' | 'lg';
}

export function ProjectActions({
  projectId,
  projectName,
  className = '',
  variant = 'buttons',
  size = 'sm'
}: ProjectActionsProps) {
  if (variant === 'icons') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <DownloadIconButton projectId={projectId} />
        <PushToGitHubIconButton projectId={projectId} projectName={projectName} />
      </div>
    );
  }

  if (variant === 'buttons') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <DownloadButton 
          projectId={projectId} 
          size={size}
          variant="outline"
        />
        <PushToGitHubButton 
          projectId={projectId} 
          projectName={projectName}
          size={size}
          variant="outline"
        />
      </div>
    );
  }

  // TODO: Implement dropdown variant if needed
  return null;
}

// Export individual components
export { DownloadButton, DownloadIconButton, PushToGitHubButton, PushToGitHubIconButton };

// Quick access component for chat interface
export function ChatProjectActions({ projectId, projectName }: { 
  projectId: string;
  projectName?: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg">
      <div className="text-xs text-bolt-elements-textSecondary">Export:</div>
      <ProjectActions 
        projectId={projectId}
        projectName={projectName}
        variant="buttons"
        size="sm"
      />
    </div>
  );
}

// Quick access for workbench toolbar  
export function WorkbenchProjectActions({ projectId, projectName }: {
  projectId: string;
  projectName?: string;
}) {
  return (
    <ProjectActions 
      projectId={projectId}
      projectName={projectName}
      variant="icons"
      className="border-l border-bolt-elements-borderColor pl-2 ml-2"
    />
  );
}
