'use client';

import React, { useMemo, useState } from 'react';
import {
  useAgentActivityHeatmap,
  useActivityStreaks,
} from '@/hooks/agents/use-agent-activity-heatmap';
import type { DailyActivity } from '@/lib/api/agent-activity-heatmap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Flame, Calendar } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_SIZE = 12;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const WEEKS = 52;
const DAYS_PER_WEEK = 7;

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''] as const;
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const COLOR_EMPTY = 'var(--color-muted, #e5e7eb)';
const COLOR_LEVELS = [
  'var(--color-muted, #e5e7eb)',
  '#9be9a8',
  '#40c463',
  '#30a14e',
  '#216e39',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getActivityLevel(value: number, quartiles: number[]): number {
  if (value <= 0) return 0;
  if (value <= quartiles[0]) return 1;
  if (value <= quartiles[1]) return 2;
  if (value <= quartiles[2]) return 3;
  return 4;
}

function computeQuartiles(values: number[]): number[] {
  const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return [1, 2, 3];
  const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
  const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || q1 + 1;
  const q3 = nonZero[Math.floor(nonZero.length * 0.75)] || q2 + 1;
  return [q1, q2, q3];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCost(cost: number): string {
  return cost > 0 ? `$${cost.toFixed(4)}` : '$0';
}

// ---------------------------------------------------------------------------
// Grid data builder
// ---------------------------------------------------------------------------

interface CellData {
  date: string;
  week: number;
  day: number;
  activity: DailyActivity | null;
  level: number;
}

function buildGrid(days: DailyActivity[]): { cells: CellData[]; monthLabels: { label: string; week: number }[] } {
  const today = new Date();
  // Build a lookup map
  const lookup = new Map<string, DailyActivity>();
  for (const d of days) {
    lookup.set(d.date, d);
  }

  // Calculate start date: go back ~52 weeks from today, align to Sunday
  const totalDays = WEEKS * DAYS_PER_WEEK;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);
  // Align to Sunday (start of week)
  const startDow = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDow);

  // Collect run_count values for quartile calc
  const runCounts: number[] = [];
  const rawCells: { dateStr: string; week: number; day: number; activity: DailyActivity | null }[] = [];

  const current = new Date(startDate);
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const dateStr = current.toISOString().split('T')[0];
      const activity = lookup.get(dateStr) || null;
      rawCells.push({ dateStr, week: w, day: d, activity });
      if (activity) runCounts.push(activity.run_count);
      current.setDate(current.getDate() + 1);
    }
  }

  const quartiles = computeQuartiles(runCounts);
  const cells: CellData[] = rawCells.map((rc) => ({
    date: rc.dateStr,
    week: rc.week,
    day: rc.day,
    activity: rc.activity,
    level: rc.activity ? getActivityLevel(rc.activity.run_count, quartiles) : 0,
  }));

  // Month labels: detect when month changes
  const monthLabels: { label: string; week: number }[] = [];
  let lastMonth = -1;
  for (const cell of cells) {
    if (cell.day === 0) {
      const m = new Date(cell.date + 'T00:00:00').getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ label: MONTH_NAMES[m], week: cell.week });
        lastMonth = m;
      }
    }
  }

  return { cells, monthLabels };
}

// ---------------------------------------------------------------------------
// Tooltip component
// ---------------------------------------------------------------------------

interface TooltipState {
  x: number;
  y: number;
  cell: CellData;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ActivityHeatmapProps {
  agentId?: string;
  /** List of agents for the filter dropdown. Each entry: { id, name } */
  agents?: { id: string; name: string }[];
}

export function ActivityHeatmap({ agentId: initialAgentId, agents }: ActivityHeatmapProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(initialAgentId || 'all');
  const resolvedAgentId = selectedAgent === 'all' ? undefined : selectedAgent;

  const { data: heatmapData, isLoading: heatmapLoading } = useAgentActivityHeatmap(resolvedAgentId);
  const { data: streaksData, isLoading: streaksLoading } = useActivityStreaks();

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const grid = useMemo(() => {
    if (!heatmapData?.days) return buildGrid([]);
    return buildGrid(heatmapData.days);
  }, [heatmapData]);

  const leftPad = 32; // space for day labels
  const topPad = 20; // space for month labels
  const svgWidth = leftPad + WEEKS * CELL_STEP;
  const svgHeight = topPad + DAYS_PER_WEEK * CELL_STEP;

  const isLoading = heatmapLoading || streaksLoading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Activity</CardTitle>
          </div>
          {agents && agents.length > 0 && (
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Loading activity data...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Heatmap grid */}
            <div className="relative overflow-x-auto">
              <svg
                width={svgWidth}
                height={svgHeight}
                className="block"
                role="img"
                aria-label="Agent activity heatmap"
              >
                {/* Month labels */}
                {grid.monthLabels.map((ml) => (
                  <text
                    key={`month-${ml.week}`}
                    x={leftPad + ml.week * CELL_STEP}
                    y={12}
                    className="fill-muted-foreground"
                    fontSize={10}
                  >
                    {ml.label}
                  </text>
                ))}

                {/* Day labels */}
                {DAY_LABELS.map((label, i) =>
                  label ? (
                    <text
                      key={`day-${i}`}
                      x={0}
                      y={topPad + i * CELL_STEP + CELL_SIZE - 2}
                      className="fill-muted-foreground"
                      fontSize={10}
                    >
                      {label}
                    </text>
                  ) : null
                )}

                {/* Cells */}
                {grid.cells.map((cell) => (
                  <rect
                    key={cell.date}
                    x={leftPad + cell.week * CELL_STEP}
                    y={topPad + cell.day * CELL_STEP}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={2}
                    ry={2}
                    fill={COLOR_LEVELS[cell.level]}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    onMouseEnter={(e) => {
                      const rect = (e.target as SVGRectElement).getBoundingClientRect();
                      const parent = (e.target as SVGRectElement).closest('.relative')!.getBoundingClientRect();
                      setTooltip({
                        x: rect.left - parent.left + CELL_SIZE / 2,
                        y: rect.top - parent.top - 8,
                        cell,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </svg>

              {/* Tooltip */}
              {tooltip && (
                <div
                  className="pointer-events-none absolute z-50 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                  style={{
                    left: tooltip.x,
                    top: tooltip.y,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div className="font-medium">{formatDate(tooltip.cell.date)}</div>
                  <div className="mt-0.5 space-y-0.5 text-muted-foreground">
                    <div>Runs: {tooltip.cell.activity?.run_count ?? 0}</div>
                    <div>Messages: {tooltip.cell.activity?.message_count ?? 0}</div>
                    <div>Errors: {tooltip.cell.activity?.error_count ?? 0}</div>
                    <div>Cost: {formatCost(tooltip.cell.activity?.total_cost ?? 0)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Less</span>
                {COLOR_LEVELS.map((color, i) => (
                  <div
                    key={i}
                    className="rounded-sm"
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      backgroundColor: color,
                    }}
                  />
                ))}
                <span>More</span>
              </div>

              {/* Streaks */}
              {streaksData && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">
                      Current streak: {streaksData.current_streak} day{streaksData.current_streak !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Longest streak: {streaksData.longest_streak} day{streaksData.longest_streak !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
