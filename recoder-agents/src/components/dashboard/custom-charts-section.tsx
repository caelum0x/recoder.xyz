'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCustomCharts } from '@/hooks/dashboard/use-custom-charts';
import { CustomChartCard } from './custom-chart-card';
import { ChartBuilderDialog } from './chart-builder-dialog';
import type { CustomChart } from '@/lib/api/custom-charts';

export function CustomChartsSection() {
  const { data: charts, isLoading } = useCustomCharts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editChart, setEditChart] = useState<CustomChart | null>(null);

  const visibleCharts = (charts || []).filter((c) => c.is_visible);

  const handleEdit = (chart: CustomChart) => {
    setEditChart(chart);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditChart(null);
  };

  // Don't show section if loading or no charts and no ability to add
  if (isLoading) return null;
  if (visibleCharts.length === 0) {
    return (
      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Custom Chart
        </Button>
        <ChartBuilderDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          editChart={editChart}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Custom Charts</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleCharts.map((chart) => (
          <CustomChartCard key={chart.id} chart={chart} onEdit={handleEdit} />
        ))}
      </div>

      <ChartBuilderDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editChart={editChart}
      />
    </div>
  );
}
