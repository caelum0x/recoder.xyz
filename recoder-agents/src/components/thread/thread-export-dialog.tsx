'use client';

import React, { useState, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  FileTextIcon,
  FileJsonIcon,
  FileIcon,
  PrinterIcon,
  Loader2Icon,
} from 'lucide-react';
import { useExportThread, useExportThreadPdf } from '@/hooks/threads/use-thread-export';
import { exportThread, type ExportFormat } from '@/lib/api/thread-export';

interface ThreadExportDialogProps {
  threadId: string;
  threadName?: string;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const FORMAT_OPTIONS: Array<{
  value: ExportFormat | 'pdf';
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    value: 'markdown',
    label: 'Markdown',
    description: 'Formatted with headings and separators',
    icon: FileTextIcon,
  },
  {
    value: 'json',
    label: 'JSON',
    description: 'Structured data, ideal for programmatic use',
    icon: FileJsonIcon,
  },
  {
    value: 'txt',
    label: 'Plain Text',
    description: 'Simple text with role labels',
    icon: FileIcon,
  },
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Styled HTML page for printing',
    icon: PrinterIcon,
  },
];

export function ThreadExportDialog({
  threadId,
  threadName,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ThreadExportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | 'pdf'>('markdown');
  const [includeToolCalls, setIncludeToolCalls] = useState(false);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [preview, setPreview] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportMutation = useExportThread();
  const exportPdfMutation = useExportThreadPdf();

  // Fetch preview whenever options change
  useEffect(() => {
    if (!open || !threadId || selectedFormat === 'pdf') {
      setPreview('');
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    const fetchPreview = async () => {
      try {
        const result = await exportThread(threadId, {
          format: selectedFormat as ExportFormat,
          include_tool_calls: includeToolCalls,
          include_metadata: includeMetadata,
        });
        if (!cancelled) {
          // Show first 20 lines
          const lines = result.content.split('\n');
          const truncated = lines.slice(0, 20).join('\n');
          setPreview(
            lines.length > 20 ? truncated + '\n\n... (truncated)' : truncated
          );
        }
      } catch {
        if (!cancelled) {
          setPreview('Failed to generate preview.');
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    const timeout = setTimeout(fetchPreview, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [open, threadId, selectedFormat, includeToolCalls, includeMetadata]);

  const handleDownload = () => {
    if (selectedFormat === 'pdf') {
      exportPdfMutation.mutate({
        threadId,
        includeToolCalls,
        includeMetadata,
      });
      return;
    }

    exportMutation.mutate({
      threadId,
      options: {
        format: selectedFormat as ExportFormat,
        include_tool_calls: includeToolCalls,
        include_metadata: includeMetadata,
      },
      threadName,
    });
  };

  const handleCopy = async () => {
    if (!preview || selectedFormat === 'pdf') return;

    try {
      // Fetch full content for copy
      const result = await exportThread(threadId, {
        format: selectedFormat as ExportFormat,
        include_tool_calls: includeToolCalls,
        include_metadata: includeMetadata,
      });
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const isLoading = exportMutation.isPending || exportPdfMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Export Conversation</DialogTitle>
          <DialogDescription>
            Choose a format and options to export this conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedFormat === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedFormat(opt.value)}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border text-left transition-colors
                      ${isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:bg-accent'
                      }
                    `}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                        {opt.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Options</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="include-tool-calls" className="text-sm text-muted-foreground cursor-pointer">
                  Include tool calls
                </Label>
                <Switch
                  id="include-tool-calls"
                  checked={includeToolCalls}
                  onCheckedChange={setIncludeToolCalls}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="include-metadata" className="text-sm text-muted-foreground cursor-pointer">
                  Include timestamps
                </Label>
                <Switch
                  id="include-metadata"
                  checked={includeMetadata}
                  onCheckedChange={setIncludeMetadata}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          {selectedFormat !== 'pdf' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preview</Label>
              <div className="bg-muted/50 rounded-lg border p-3 max-h-48 overflow-y-auto">
                {previewLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Generating preview...</span>
                  </div>
                ) : preview ? (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                    {preview}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No content to preview.
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedFormat === 'pdf' && (
            <div className="bg-muted/50 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                PDF export will open a styled HTML page in a new tab. Use your browser&apos;s
                Print function (Ctrl/Cmd + P) to save as PDF.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {selectedFormat !== 'pdf' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!preview || previewLoading}
              className="gap-1.5"
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy to Clipboard'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={isLoading}
            className="gap-1.5"
          >
            {isLoading ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="h-3.5 w-3.5" />
            )}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
