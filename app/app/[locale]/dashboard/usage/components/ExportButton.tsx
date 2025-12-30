'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function ExportButton({ usageData }: { usageData: any }) {
  const handleExport = () => {
    alert('Export functionality - implement CSV download');
  };

  return (
    <Button onClick={handleExport} variant="outline">
      <Download className="w-4 h-4 mr-2" />
      Export Data
    </Button>
  );
}
