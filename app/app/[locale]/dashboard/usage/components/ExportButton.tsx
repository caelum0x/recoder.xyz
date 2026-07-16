'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function ExportButton({ usageData }: { usageData: any }) {
  const handleExport = () => {
    if (!usageData || (Array.isArray(usageData) && usageData.length === 0)) {
      return;
    }

    const rows = Array.isArray(usageData) ? usageData : [usageData];
    if (rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row: Record<string, unknown>) =>
        headers.map(h => {
          const val = String(row[h] ?? '');
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recoder-usage-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button onClick={handleExport} variant="outline">
      <Download className="w-4 h-4 mr-2" />
      Export Data
    </Button>
  );
}
