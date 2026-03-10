'use client';

import React, { useState, useMemo } from 'react';
import { Presentation, FileText, Download, ExternalLink } from 'lucide-react';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { ToolViewProps } from '../types';
import { formatTimestamp } from '../utils';
import { downloadPresentation, DownloadFormat, handleGoogleSlidesUpload } from '../utils/presentation-utils';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { LoadingState } from '../shared/LoadingState';
import { getSessionAccessToken } from '@/lib/auth/session-token';
import { useDownloadRestriction } from '@/hooks/billing';

interface ExportToolViewProps extends ToolViewProps {
  onFileClick?: (filePath: string) => void;
}

type ExportFormat = 'pptx' | 'pdf';

export function ExportToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isStreaming = false,
  project,
}: ExportToolViewProps) {
  const { isRestricted: isDownloadRestricted, openUpgradeModal } = useDownloadRestriction({
    featureName: 'exports',
  });
  
  const [downloadingFormat, setDownloadingFormat] = useState<ExportFormat | null>(null);
  const [isUploadingGoogleSlides, setIsUploadingGoogleSlides] = useState(false);

  const name = toolCall?.function_name?.replace(/_/g, '-').toLowerCase() || 'export-presentation';
  const isUnifiedExport = name === 'export-presentation' || name === 'export_presentation';
  
  const { presentationName, exports, totalSlides } = useMemo(() => {
    
    
    if (toolResult?.output) {
      try {
        const output = toolResult.output;
        const parsed = typeof output === 'string' ? JSON.parse(output) : output;
        
        
        if (isUnifiedExport && parsed.exports) {
          return {
            presentationName: parsed.presentation_name || toolCall?.arguments?.presentation_name,
            exports: parsed.exports as Record<ExportFormat, { file?: string; download_url?: string; stored_locally?: boolean }>,
            totalSlides: parsed.total_slides,
          };
        }
        
        const format: ExportFormat = name.includes('pdf') ? 'pdf' : 'pptx';
        return {
          presentationName: parsed.presentation_name || toolCall?.arguments?.presentation_name,
          exports: {
            [format]: {
              file: parsed.pptx_file || parsed.pdf_file,
              download_url: parsed.download_url,
              stored_locally: parsed.stored_locally
            }
          } as Record<ExportFormat, { file?: string; download_url?: string; stored_locally?: boolean }>,
          totalSlides: parsed.total_slides,
        };
      } catch (e) {
        console.error('[ExportToolView] Parse error:', e);
        return { presentationName: toolCall?.arguments?.presentation_name };
      }
    }
    return { presentationName: toolCall?.arguments?.presentation_name };
  }, [toolResult, name, isUnifiedExport, toolCall?.arguments]);
  
  const hasPptx = !!exports?.pptx;
  const hasPdf = !!exports?.pdf;
  
  

  if (!toolCall) return null;

  const handleDownload = async (format: ExportFormat) => {
    if (isDownloadRestricted) {
      openUpgradeModal();
      return;
    }

    const exportData = exports?.[format];
    
    // Try direct download first if we have download_url
    if (exportData?.download_url && project?.sandbox?.id) {
      try {
        setDownloadingFormat(format);
        
        const ext = format === 'pdf' ? '.pdf' : '.pptx';
        const rawFilename = exportData.download_url.split('/').pop() || `presentation${ext}`;
        const filename = rawFilename.trim().replace(/[\r\n]+/g, '') || `presentation${ext}`;
        
        const token = await getSessionAccessToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/sandboxes/${project.sandbox.id}/files/content?path=${encodeURIComponent(exportData.download_url)}`,
          { headers }
        );
        
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast.success(`Downloaded ${filename}`);
        return;
      } catch (error) {
        console.error('Direct download failed, trying conversion:', error);
      } finally {
        setDownloadingFormat(null);
      }
    }
    
    // Fallback to conversion endpoint
    if (!project?.sandbox?.sandbox_url || !presentationName) {
      toast.error('Unable to download - missing sandbox or presentation info');
      return;
    }

    setDownloadingFormat(format);
    try {
      const downloadFormat = format === 'pdf' ? DownloadFormat.PDF : DownloadFormat.PPTX;
      await downloadPresentation(
        downloadFormat,
        project.sandbox.sandbox_url, 
        `/workspace/presentations/${presentationName}`, 
        presentationName
      );
      toast.success(`Downloaded ${format.toUpperCase()}`);
    } catch (error) {
      console.error(`Download error:`, error);
      toast.error(`Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  // Loading state
  if (isStreaming) {
    return (
      <Card className="gap-0 flex border-0 shadow-none p-0 rounded-none flex-col h-full overflow-hidden bg-card">
        <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 border-b p-2 px-4 flex-shrink-0">
          <div className="flex flex-row items-center justify-between">
            <ToolViewIconTitle icon={Download} title="Export Presentation" />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1">
          <LoadingState
            icon={Download}
            iconColor="text-zinc-500"
            bgColor="bg-zinc-50 dark:bg-zinc-900"
            title="Exporting"
            filePath={presentationName || 'presentation'}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 rounded-none flex-col h-full overflow-hidden bg-card">
      {/* Header */}
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 border-b p-2 px-4 flex-shrink-0">
        <div className="flex flex-row items-center justify-between">
          <ToolViewIconTitle 
            icon={Download} 
            title={presentationName ? `Export: ${presentationName}` : 'Export Presentation'} 
          />
          {totalSlides && (
            <span className="text-xs text-muted-foreground">{totalSlides} slides</span>
          )}
        </div>
      </CardHeader>

      {/* Download Buttons */}
      <CardContent className="p-4 flex-1">
        <div className="flex gap-3">
          {/* PDF Button */}
          <Button
            onClick={() => handleDownload('pdf')}
            disabled={!!downloadingFormat || !hasPdf}
            className="flex-1 h-12 bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-medium"
          >
            {downloadingFormat === 'pdf' ? (
              <RecoderLoader customSize={16} variant="white" className="mr-2 dark:hidden" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            {downloadingFormat === 'pdf' ? (
              <RecoderLoader customSize={16} variant="black" className="mr-2 hidden dark:flex" />
            ) : null}
            Download PDF
          </Button>

          {/* PPTX Button */}
          <Button
            onClick={() => handleDownload('pptx')}
            disabled={!!downloadingFormat || !hasPptx}
            className="flex-1 h-12 bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-medium"
          >
            {downloadingFormat === 'pptx' ? (
              <RecoderLoader customSize={16} variant="white" className="mr-2 dark:hidden" />
            ) : (
              <Presentation className="h-4 w-4 mr-2" />
            )}
            {downloadingFormat === 'pptx' ? (
              <RecoderLoader customSize={16} variant="black" className="mr-2 hidden dark:flex" />
            ) : null}
            Download PPTX
          </Button>
        </div>

          {/* Google Slides Button */}
          {hasPptx && project?.sandbox?.sandbox_url && presentationName && (
            <div className="w-full mt-2">
              <Button
                onClick={async () => {
                  if (isDownloadRestricted) {
                    openUpgradeModal();
                    return;
                  }
                  setIsUploadingGoogleSlides(true);
                  try {
                    const sanitizedName = presentationName.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const result = await handleGoogleSlidesUpload(
                      project.sandbox!.sandbox_url,
                      `/workspace/presentations/${sanitizedName}`
                    );
                    if (result?.redirected_to_auth) return;
                    if (result?.google_slides_url) {
                      toast.success('Uploaded to Google Slides');
                      window.open(result.google_slides_url, '_blank', 'noopener,noreferrer');
                    }
                  } catch (error) {
                    toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  } finally {
                    setIsUploadingGoogleSlides(false);
                  }
                }}
                disabled={!!downloadingFormat || isUploadingGoogleSlides}
                variant="outline"
                className="w-full h-10 font-medium"
              >
                {isUploadingGoogleSlides ? (
                  <RecoderLoader customSize={16} className="mr-2" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                {isUploadingGoogleSlides ? 'Uploading...' : 'Google Slides'}
              </Button>
            </div>
          )}

        {/* Show message if no exports available */}
        {!hasPdf && !hasPptx && (
          <p className="text-sm text-muted-foreground text-center mt-3">
            No export files available yet
          </p>
        )}
      </CardContent>

      {/* Footer - pushed to bottom */}
      <div className="px-4 py-2 h-10 bg-zinc-50/80 dark:bg-zinc-900/80 border-t flex justify-end items-center flex-shrink-0 mt-auto">
        <span className="text-xs text-muted-foreground">
          {toolTimestamp ? formatTimestamp(toolTimestamp) : assistantTimestamp ? formatTimestamp(assistantTimestamp) : ''}
        </span>
      </div>
    </Card>
  );
}
