'use client';

import { useState } from 'react';
import { Settings2, GripVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useDashboardWidgets } from '@/stores/dashboard-widgets-store';

export function DashboardCustomizer() {
  const { widgets, toggleWidget, resetToDefault } = useDashboardWidgets();
  const [open, setOpen] = useState(false);

  const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Customize
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {sortedWidgets.map((widget) => (
            <div key={widget.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{widget.label}</span>
              </div>
              <Switch
                checked={widget.enabled}
                onCheckedChange={() => toggleWidget(widget.id)}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" size="sm" onClick={resetToDefault} className="gap-2">
            <RotateCcw className="h-3 w-3" />
            Reset to Default
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
