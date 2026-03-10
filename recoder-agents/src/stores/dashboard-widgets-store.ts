import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WidgetConfig {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'agent-status', type: 'agent-status', label: 'Agent Status', enabled: true, order: 0 },
  { id: 'quick-resume', type: 'quick-resume', label: 'Quick Resume', enabled: true, order: 1 },
  { id: 'platform-stats', type: 'platform-stats', label: 'Platform Stats', enabled: true, order: 2 },
  { id: 'quick-actions', type: 'quick-actions', label: 'Quick Actions', enabled: true, order: 3 },
  { id: 'activity-feed', type: 'activity-feed', label: 'Activity Feed', enabled: true, order: 4 },
  { id: 'activity-heatmap', type: 'activity-heatmap', label: 'Activity Heatmap', enabled: true, order: 5 },
  { id: 'recent-runs', type: 'recent-runs', label: 'Recent Runs', enabled: true, order: 6 },
  { id: 'cost-summary', type: 'cost-summary', label: 'Cost Summary', enabled: true, order: 7 },
  { id: 'recent-activity', type: 'recent-activity', label: 'Recent Activity', enabled: true, order: 8 },
];

interface DashboardWidgetState {
  widgets: WidgetConfig[];
  toggleWidget: (id: string) => void;
  reorderWidgets: (newOrder: string[]) => void;
  resetToDefault: () => void;
}

export const useDashboardWidgets = create<DashboardWidgetState>()(
  persist(
    (set) => ({
      widgets: DEFAULT_WIDGETS,
      toggleWidget: (id) =>
        set((state) => ({
          widgets: state.widgets.map((w) =>
            w.id === id ? { ...w, enabled: !w.enabled } : w
          ),
        })),
      reorderWidgets: (newOrder) =>
        set((state) => ({
          widgets: newOrder
            .map((id, index) => {
              const widget = state.widgets.find((w) => w.id === id);
              return widget ? { ...widget, order: index } : null;
            })
            .filter(Boolean) as WidgetConfig[],
        })),
      resetToDefault: () => set({ widgets: DEFAULT_WIDGETS }),
    }),
    { name: 'dashboard-widgets' }
  )
);
