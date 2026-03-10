'use client';

import React, { useState } from 'react';
import { Download, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { exportReportCsv, type ReportPeriod, type ReportType } from '@/lib/api/reports';

interface ExportMenuProps {
  period: ReportPeriod;
}

const EXPORT_OPTIONS: { type: ReportType; label: string }[] = [
  { type: 'summary', label: 'CSV Summary' },
  { type: 'agents', label: 'CSV by Agent' },
  { type: 'models', label: 'CSV by Model' },
  { type: 'daily', label: 'CSV Daily' },
];

export function ExportMenu({ period }: ExportMenuProps) {
  const [loadingType, setLoadingType] = useState<ReportType | null>(null);

  const handleExport = async (type: ReportType) => {
    setLoadingType(type);
    try {
      const blobUrl = await exportReportCsv(period, type);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `recoder-report-${type}-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Error handled by api layer
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {EXPORT_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.type}
            onClick={() => handleExport(opt.type)}
            disabled={loadingType !== null}
            className="gap-2"
          >
            {loadingType === opt.type ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {opt.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => window.print()}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Print / Save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
