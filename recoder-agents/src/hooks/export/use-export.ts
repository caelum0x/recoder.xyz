import { useMutation } from '@tanstack/react-query';
import { exportToPdf, exportToDocx, type ExportRequest } from '@/lib/api/export';
import { toast } from '@/lib/toast';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useExportPdf() {
  return useMutation({
    mutationFn: async (request: ExportRequest) => {
      const blob = await exportToPdf(request);
      downloadBlob(blob, `${request.fileName}.pdf`);
      return blob;
    },
    onSuccess: () => {
      toast.success('PDF exported successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export PDF');
    },
  });
}

export function useExportDocx() {
  return useMutation({
    mutationFn: async (request: ExportRequest) => {
      const blob = await exportToDocx(request);
      downloadBlob(blob, `${request.fileName}.docx`);
      return blob;
    },
    onSuccess: () => {
      toast.success('DOCX exported successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export DOCX');
    },
  });
}
