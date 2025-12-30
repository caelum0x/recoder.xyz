'use client';

import { Card } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function UsageChart({ data }: { data: any[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-600" />
        Usage Over Time
      </h2>
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
        <p className="text-gray-500">Chart visualization (install recharts for full implementation)</p>
      </div>
    </Card>
  );
}
