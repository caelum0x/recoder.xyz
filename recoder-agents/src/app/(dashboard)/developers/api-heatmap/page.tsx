'use client';

import { useState, useMemo } from 'react';
import {
  BarChart3,
  Clock,
  AlertTriangle,
  TrendingUp,
  Activity,
} from 'lucide-react';
import {
  useApiUsageHeatmap,
  useApiEndpoints,
  useApiPeakHours,
} from '@/hooks/developers/use-api-usage-heatmap';
import { cn } from '@/lib/utils';
import type { HeatmapCell } from '@/lib/api/api-usage-heatmap';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ---------------------------------------------------------------------------
// Color interpolation
// ---------------------------------------------------------------------------

function getHeatmapColor(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return 'bg-muted/40';
  const ratio = Math.min(value / maxValue, 1);

  if (ratio < 0.25) return 'bg-green-100 dark:bg-green-950/60';
  if (ratio < 0.5) return 'bg-green-300 dark:bg-green-800/70';
  if (ratio < 0.75) return 'bg-yellow-300 dark:bg-yellow-700/70';
  return 'bg-red-400 dark:bg-red-600/80';
}

function getHeatmapBorderColor(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return 'border-transparent';
  const ratio = Math.min(value / maxValue, 1);

  if (ratio < 0.25) return 'border-green-200 dark:border-green-900';
  if (ratio < 0.5) return 'border-green-400 dark:border-green-700';
  if (ratio < 0.75) return 'border-yellow-400 dark:border-yellow-600';
  return 'border-red-500 dark:border-red-500';
}

// ---------------------------------------------------------------------------
// Stat card component
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip component
// ---------------------------------------------------------------------------

function CellTooltip({
  cell,
  visible,
  x,
  y,
}: {
  cell: HeatmapCell | null;
  visible: boolean;
  x: number;
  y: number;
}) {
  if (!visible || !cell) return null;

  return (
    <div
      className="fixed z-50 rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-lg pointer-events-none"
      style={{ left: x + 12, top: y - 10 }}
    >
      <div className="font-medium">
        {DAYS[cell.day_of_week]} at {String(cell.hour).padStart(2, '0')}:00
      </div>
      <div className="text-muted-foreground text-xs mt-1 space-y-0.5">
        <div>Requests: {cell.request_count.toLocaleString()}</div>
        <div>Errors: {cell.error_count.toLocaleString()}</div>
        <div>Avg Latency: {cell.avg_latency_ms}ms</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peak hours bar
// ---------------------------------------------------------------------------

function PeakHoursSection({
  peakHours,
}: {
  peakHours: { day_of_week: number; hour: number; avg_request_count: number }[];
}) {
  if (!peakHours.length) {
    return (
      <div className="text-sm text-muted-foreground">No peak hours data yet.</div>
    );
  }

  const maxCount = Math.max(...peakHours.map((p) => p.avg_request_count), 1);

  return (
    <div className="space-y-2">
      {peakHours.map((peak, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 text-xs text-muted-foreground shrink-0">
            {DAYS[peak.day_of_week]} {String(peak.hour).padStart(2, '0')}:00
          </div>
          <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{
                width: `${(peak.avg_request_count / maxCount) * 100}%`,
              }}
            />
          </div>
          <div className="w-16 text-xs text-right font-medium">
            {peak.avg_request_count.toFixed(1)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ApiHeatmapPage() {
  const [days] = useState(7);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('all');
  const [tooltip, setTooltip] = useState<{
    cell: HeatmapCell | null;
    visible: boolean;
    x: number;
    y: number;
  }>({ cell: null, visible: false, x: 0, y: 0 });

  const endpointFilter =
    selectedEndpoint === 'all' ? undefined : selectedEndpoint;

  const { data: heatmapData, isLoading: heatmapLoading } =
    useApiUsageHeatmap(days, endpointFilter);
  const { data: endpoints } = useApiEndpoints();
  const { data: peakHours } = useApiPeakHours(days);

  // Build lookup map from day_of_week + hour
  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    if (heatmapData) {
      for (const cell of heatmapData) {
        map.set(`${cell.day_of_week}-${cell.hour}`, cell);
      }
    }
    return map;
  }, [heatmapData]);

  const maxRequestCount = useMemo(() => {
    if (!heatmapData || heatmapData.length === 0) return 0;
    return Math.max(...heatmapData.map((c) => c.request_count));
  }, [heatmapData]);

  // Compute stats
  const stats = useMemo(() => {
    if (!heatmapData || heatmapData.length === 0) {
      return {
        totalRequests: 0,
        peakHourLabel: '-',
        avgPerHour: 0,
        errorRate: 0,
      };
    }

    const totalRequests = heatmapData.reduce(
      (sum, c) => sum + c.request_count,
      0
    );
    const totalErrors = heatmapData.reduce(
      (sum, c) => sum + c.error_count,
      0
    );
    const uniqueHours = heatmapData.length;
    const avgPerHour =
      uniqueHours > 0 ? Math.round(totalRequests / uniqueHours) : 0;
    const errorRate =
      totalRequests > 0
        ? ((totalErrors / totalRequests) * 100).toFixed(1)
        : '0.0';

    // Find peak cell
    const peakCell = heatmapData.reduce(
      (max, c) => (c.request_count > max.request_count ? c : max),
      heatmapData[0]
    );
    const peakHourLabel = `${DAYS[peakCell.day_of_week]} ${String(peakCell.hour).padStart(2, '0')}:00`;

    return { totalRequests, peakHourLabel, avgPerHour, errorRate };
  }, [heatmapData]);

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            API Usage Heatmap
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visualize your API usage patterns by day and hour
          </p>
        </div>

        {/* Endpoint filter */}
        <div>
          <select
            value={selectedEndpoint}
            onChange={(e) => setSelectedEndpoint(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Endpoints</option>
            {endpoints?.map((ep) => (
              <option key={ep.endpoint_group} value={ep.endpoint_group}>
                {ep.endpoint_group} ({ep.total_requests.toLocaleString()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Requests (7d)"
          value={stats.totalRequests.toLocaleString()}
          icon={BarChart3}
        />
        <StatCard
          title="Peak Hour"
          value={stats.peakHourLabel}
          icon={Clock}
        />
        <StatCard
          title="Avg Requests/Hour"
          value={stats.avgPerHour.toLocaleString()}
          icon={TrendingUp}
        />
        <StatCard
          title="Error Rate"
          value={`${stats.errorRate}%`}
          icon={AlertTriangle}
        />
      </div>

      {/* Heatmap grid */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-4">Request Heatmap</h2>

        {heatmapLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Loading heatmap data...
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Column headers - days */}
            <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)', gap: '2px' }}>
              <div /> {/* top-left corner */}
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-muted-foreground py-1"
                >
                  {day}
                </div>
              ))}

              {/* Rows - hours */}
              {HOURS.map((hour) => (
                <>
                  {/* Row label */}
                  <div
                    key={`label-${hour}`}
                    className="text-right text-xs text-muted-foreground pr-2 flex items-center justify-end"
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>

                  {/* Cells for each day */}
                  {DAYS.map((_, dayIndex) => {
                    const cell = cellMap.get(`${dayIndex}-${hour}`);
                    const count = cell?.request_count ?? 0;
                    const colorClass = getHeatmapColor(count, maxRequestCount);
                    const borderClass = getHeatmapBorderColor(count, maxRequestCount);

                    return (
                      <div
                        key={`${dayIndex}-${hour}`}
                        className={cn(
                          'h-6 rounded-sm border cursor-pointer transition-all hover:scale-110 hover:z-10',
                          colorClass,
                          borderClass
                        )}
                        onMouseEnter={(e) =>
                          setTooltip({
                            cell: cell ?? {
                              day_of_week: dayIndex,
                              hour,
                              request_count: 0,
                              error_count: 0,
                              avg_latency_ms: 0,
                            },
                            visible: true,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setTooltip((prev) => ({
                            ...prev,
                            x: e.clientX,
                            y: e.clientY,
                          }))
                        }
                        onMouseLeave={() =>
                          setTooltip((prev) => ({ ...prev, visible: false }))
                        }
                      />
                    );
                  })}
                </>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <span>Low</span>
              <div className="flex gap-0.5">
                <div className="w-5 h-3 rounded-sm bg-muted/40 border border-border" />
                <div className="w-5 h-3 rounded-sm bg-green-100 dark:bg-green-950/60 border border-green-200 dark:border-green-900" />
                <div className="w-5 h-3 rounded-sm bg-green-300 dark:bg-green-800/70 border border-green-400 dark:border-green-700" />
                <div className="w-5 h-3 rounded-sm bg-yellow-300 dark:bg-yellow-700/70 border border-yellow-400 dark:border-yellow-600" />
                <div className="w-5 h-3 rounded-sm bg-red-400 dark:bg-red-600/80 border border-red-500 dark:border-red-500" />
              </div>
              <span>High</span>
            </div>
          </div>
        )}
      </div>

      {/* Peak hours section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Top 5 Peak Hours
        </h2>
        <PeakHoursSection peakHours={peakHours ?? []} />
      </div>

      {/* Tooltip */}
      <CellTooltip
        cell={tooltip.cell}
        visible={tooltip.visible}
        x={tooltip.x}
        y={tooltip.y}
      />
    </div>
  );
}
