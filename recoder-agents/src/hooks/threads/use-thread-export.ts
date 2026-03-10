import { useMutation } from '@tanstack/react-query';
import {
  exportThread,
  getExportPdfUrl,
  type ExportOptions,
  type ExportFormat,
} from '@/lib/api/thread-export';

function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'markdown':
      return 'md';
    case 'json':
      return 'json';
    case 'txt':
      return 'txt';
    default:
      return 'txt';
  }
}

function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'markdown':
      return 'text/markdown';
    case 'json':
      return 'application/json';
    case 'txt':
      return 'text/plain';
    default:
      return 'text/plain';
  }
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useExportThread() {
  return useMutation({
    mutationFn: ({
      threadId,
      options,
      threadName,
    }: {
      threadId: string;
      options: ExportOptions;
      threadName?: string;
    }) => exportThread(threadId, options).then((result) => ({ ...result, threadName })),
    onSuccess: (data) => {
      const dateSuffix = new Date().toISOString().slice(0, 10);
      const safeName = (data.threadName || 'thread').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      const ext = getFileExtension(data.format);
      const filename = `${safeName}-${dateSuffix}.${ext}`;
      triggerDownload(data.content, filename, getMimeType(data.format));
    },
  });
}

export function useExportThreadPdf() {
  return useMutation({
    mutationFn: ({
      threadId,
      includeToolCalls,
      includeMetadata,
    }: {
      threadId: string;
      includeToolCalls?: boolean;
      includeMetadata?: boolean;
    }) => {
      const url = getExportPdfUrl(threadId, includeToolCalls, includeMetadata);
      window.open(url, '_blank');
      return Promise.resolve();
    },
  });
}
