'use client';

import { useState, useCallback } from 'react';
import {
  Download,
  FileText,
  Braces,
  Table2,
  Globe,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useExportThread } from '@/hooks/threads/use-thread-export-system';
import type { ExportFormat, ExportRecord } from '@/lib/api/thread-export-system';

// ============================================================================
// Format config
// ============================================================================

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'json',
    label: 'JSON',
    description: 'Raw structured data, ideal for programmatic use',
    icon: <Braces className="h-5 w-5" />,
  },
  {
    value: 'markdown',
    label: 'Markdown',
    description: 'Formatted text with headers, good for docs',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    value: 'csv',
    label: 'CSV',
    description: 'Tabular data, importable to spreadsheets',
    icon: <Table2 className="h-5 w-5" />,
  },
  {
    value: 'html',
    label: 'HTML',
    description: 'Styled web page, suitable for printing to PDF',
    icon: <Globe className="h-5 w-5" />,
  },
];

const MIME_TYPES: Record<string, string> = {
  json: 'application/json',
  markdown: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  pdf: 'text/html',
};

const FILE_EXTENSIONS: Record<string, string> = {
  json: 'json',
  markdown: 'md',
  csv: 'csv',
  html: 'html',
  pdf: 'html',
};

// ============================================================================
// Component
// ============================================================================

interface ThreadExportV2DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threadName?: string;
}

export function ThreadExportV2Dialog({
  open,
  onOpenChange,
  threadId,
  threadName,
}: ThreadExportV2DialogProps) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [includeToolCalls, setIncludeToolCalls] = useState(false);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [exportResult, setExportResult] = useState<ExportRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const exportMutation = useExportThread();

  const handleExport = useCallback(() => {
    setExportResult(null);
    setCopied(false);
    exportMutation.mutate(
      {
        threadId,
        request: {
          export_format: format,
          options: {
            include_tool_calls: includeToolCalls,
            include_metadata: includeMetadata,
            include_timestamps: includeTimestamps,
          },
        },
      },
      {
        onSuccess: (data) => {
          setExportResult(data);
        },
      }
    );
  }, [threadId, format, includeToolCalls, includeMetadata, includeTimestamps, exportMutation]);

  const handleCopy = useCallback(async () => {
    if (!exportResult?.content) return;
    try {
      await navigator.clipboard.writeText(exportResult.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [exportResult]);

  const handleDownload = useCallback(() => {
    if (!exportResult?.content) return;
    const blob = new Blob([exportResult.content], {
      type: MIME_TYPES[format] || 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (threadName || 'thread').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const dateSuffix = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${safeName}-${dateSuffix}.${FILE_EXTENSIONS[format] || 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportResult, format, threadName]);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) {
        setExportResult(null);
        setCopied(false);
      }
      onOpenChange(open);
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Thread
          </DialogTitle>
          <DialogDescription>
            Choose a format and options to export this conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Format selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => {
                setFormat(v as ExportFormat);
                setExportResult(null);
              }}
              className="grid grid-cols-2 gap-2"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`format-v2-${opt.value}`}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    format === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <RadioGroupItem
                    value={opt.value}
                    id={`format-v2-${opt.value}`}
                    className="mt-0.5 sr-only"
                  />
                  <div className="text-muted-foreground">{opt.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {opt.description}
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Options</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  checked={includeToolCalls}
                  onCheckedChange={(v) => setIncludeToolCalls(!!v)}
                />
                <span className="text-sm">Include tool calls</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  checked={includeMetadata}
                  onCheckedChange={(v) => setIncludeMetadata(!!v)}
                />
                <span className="text-sm">Include metadata</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  checked={includeTimestamps}
                  onCheckedChange={(v) => setIncludeTimestamps(!!v)}
                />
                <span className="text-sm">Include timestamps</span>
              </label>
            </div>
          </div>

          {/* Success state */}
          {exportResult?.status === 'completed' && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                <Check className="h-4 w-4" />
                Export ready
                {exportResult.file_size_bytes != null && (
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {exportResult.file_size_bytes < 1024
                      ? `${exportResult.file_size_bytes} B`
                      : `${(exportResult.file_size_bytes / 1024).toFixed(1)} KB`}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy Content'}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleDownload}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!exportResult && (
            <Button
              onClick={handleExport}
              disabled={exportMutation.isPending}
              className="w-full gap-2"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
