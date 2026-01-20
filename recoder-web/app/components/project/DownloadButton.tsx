/**
 * Download Project Button Component
 */

import { useState } from 'react';
import type { ApiResponse } from "~/types/api-responses";
import { Button } from '~/components/ui/button';

interface DownloadButtonProps {
  projectId: string;
  className?: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'default' | 'lg';
  showText?: boolean;
}

export function DownloadButton({ 
  projectId, 
  className = '',
  variant = 'outline',
  size = 'sm',
  showText = true
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!projectId || isDownloading) return;

    setIsDownloading(true);
    
    try {
      // Fetch the ZIP file
      const response = await fetch(`/api/project/${projectId}/download`);
      
      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || 'Download failed');
      }

      // Get the blob
      const blob = await response.blob();
      
      // Extract filename from response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `project-${projectId.slice(0, 8)}.zip`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Success feedback (you can add toast here)
      console.log('✅ Project downloaded successfully:', filename);
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      alert(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  const buttonSize = size === 'default' ? 'default' : size;

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading}
      variant={variant}
      size={buttonSize}
      className={`${className}`}
      title="Download project as ZIP file"
    >
      {isDownloading ? (
        <span className={`i-ph:spinner animate-spin`} style={{ width: iconSize, height: iconSize }} />
      ) : (
        <span className="i-ph:download-simple" style={{ width: iconSize, height: iconSize }} />
      )}
      {showText && (
        <span className="ml-1.5">
          {isDownloading ? 'Downloading...' : 'Download'}
        </span>
      )}
    </Button>
  );
}

// Alternative compact version for toolbars
export function DownloadIconButton({ projectId, className = '' }: { 
  projectId: string;
  className?: string;
}) {
  return (
    <DownloadButton 
      projectId={projectId}
      variant="ghost"
      size="sm"
      showText={false}
      className={className}
    />
  );
}
