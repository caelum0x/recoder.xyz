import { useState } from 'react';
import type { ApiResponse } from "~/types/api-responses";
import { IconButton } from '~/components/ui/IconButton';

interface DownloadButtonProps {
  projectId?: string;
  className?: string;
}

export function DownloadButton({ projectId, className }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!projectId) {
      alert('No project selected');
      return;
    }

    setIsDownloading(true);

    try {
      const response = await fetch(`/api/project/${projectId}/download`);
      
      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || 'Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${projectId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download error:', error);
      alert(error.message || 'Failed to download project');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <IconButton
      title="Download Project"
      onClick={handleDownload}
      disabled={!projectId || isDownloading}
      className={className}
    >
      <span className="flex items-center gap-1">
        <span className="i-ph:download-simple" />
        {isDownloading ? 'Downloading...' : 'Download'}
      </span>
    </IconButton>
  );
}
