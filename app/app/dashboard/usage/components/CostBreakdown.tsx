'use client';

import { Card } from '@/components/ui/card';
import { PieChart } from 'lucide-react';

export default function CostBreakdown({ data }: { data: any[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <PieChart className="w-5 h-5 text-purple-600" />
        Cost Breakdown
      </h2>
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
        <p className="text-gray-500">Cost breakdown chart</p>
      </div>
    </Card>
  );
}
