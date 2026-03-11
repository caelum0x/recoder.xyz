'use client';

import { useState, useCallback } from 'react';
import {
  Download,
  FileText,
  Braces,
  Table2,
  Globe,
  Trash2,
  Clock,
  FileDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRecentExports, useDeleteExport } from '@/hooks/threads/use-thread-export-system';
import { getExportDetail } from '@/lib/api/thread-export-system';
import type { ExportRecord, ExportFormat } from '@/lib/api/thread-export-system';

// ============================================================================
// Helpers
// ============================================================================

const FORMAT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  json: { label: 'JSON', icon: <Braces className="h-3.5 w-3.5" />, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  markdown: { label: 'Markdown', icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  csv: { label: 'CSV', icon: <Table2 className="h-3.5 w-3.5" />, color: 'bg-green-500/10 text-green-600 border-green-500/30' },
  html: { label: 'HTML', icon: <Globe className="h-3.5 w-3.5" />, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  pdf: { label: 'PDF', icon: <FileDown className="h-3.5 w-3.5" />, color: 'bg-red-500/10 text-red-600 border-red-500/30' },
};

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'Pending', icon: <Clock className="h-3 w-3" />, color: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processing', icon: <Loader2 className="h-3 w-3 animate-spin" />, color: 'bg-blue-500/10 text-blue-600' },
  completed: { label: 'Completed', icon: <CheckCircle2 className="h-3 w-3" />, color: 'bg-green-500/10 text-green-600' },
  failed: { label: 'Failed', icon: <AlertCircle className="h-3 w-3" />, color: 'bg-red-500/10 text-red-600' },
};

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

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================================
// Export Row
// ============================================================================

function ExportRow({
  record,
  onDelete,
  isDeleting,
}: {
  record: ExportRecord;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const fmt = FORMAT_META[record.export_format] || FORMAT_META.json;
  const status = STATUS_META[record.status] || STATUS_META.pending;

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const detail = await getExportDetail(record.id);
      if (!detail.content) return;
      const blob = new Blob([detail.content], {
        type: MIME_TYPES[record.export_format] || 'text/plain',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${record.thread_id.slice(0, 8)}.${FILE_EXTENSIONS[record.export_format] || 'txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setDownloading(false);
    }
  }, [record]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-b-0">
      {/* Format badge */}
      <Badge
        variant="outline"
        className={`text-xs gap-1 shrink-0 ${fmt.color}`}
      >
        {fmt.icon}
        {fmt.label}
      </Badge>

      {/* Thread ID */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono text-foreground/80 truncate">
          {record.thread_id}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(record.created_at)}
        </p>
      </div>

      {/* Status */}
      <Badge
        variant="outline"
        className={`text-xs gap-1 shrink-0 ${status.color}`}
      >
        {status.icon}
        {status.label}
      </Badge>

      {/* File size */}
      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-16 text-right">
        {formatFileSize(record.file_size_bytes)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {record.status === 'completed' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
            disabled={downloading}
            title="Download"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(record.id)}
          disabled={isDeleting}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function ExportsPage() {
  const [formatFilter, setFormatFilter] = useState('all');
  const { data: exports, isLoading } = useRecentExports();
  const deleteMutation = useDeleteExport();

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  const filteredExports = exports?.filter(
    (e) => formatFilter === 'all' || e.export_format === formatFilter
  );

  return (
    <div className="min-h-[100dvh] flex items-start justify-center">
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-3xl space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <FileDown className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Exports</h1>
            <p className="text-sm text-muted-foreground">
              Your thread export history
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="markdown">Markdown</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectContent>
          </Select>

          {filteredExports && (
            <span className="text-xs text-muted-foreground">
              {filteredExports.length} export{filteredExports.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Export list */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading exports...
              </span>
            </CardContent>
          ) : !filteredExports || filteredExports.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <FileDown className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                No exports yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Export a thread conversation to see it here
              </p>
            </CardContent>
          ) : (
            <div>
              {filteredExports.map((record) => (
                <ExportRow
                  key={record.id}
                  record={record}
                  onDelete={handleDelete}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
