'use client';

import React, { useState, useMemo } from 'react';
import {
  CalendarClock,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Filter,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useAllSchedules, useUpdateSchedule, useTriggerSchedule } from '@/hooks/agents/use-agent-schedules';
import type { AgentSchedule } from '@/lib/api/agent-schedules';
import Link from 'next/link';

function formatDate(dateStr: string | null) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <SpotlightCard className="bg-card">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className={cn('h-4 w-4', color)} />
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </div>
    </SpotlightCard>
  );
}

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useAllSchedules();
  const updateMutation = useUpdateSchedule();
  const triggerMutation = useTriggerSchedule();

  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'paused'>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');

  const agentNames = useMemo(() => {
    if (!schedules) return [];
    const names = new Map<string, string>();
    schedules.forEach((s) => {
      if (s.agent_name) names.set(s.agent_id, s.agent_name);
    });
    return Array.from(names.entries());
  }, [schedules]);

  const filtered = useMemo(() => {
    if (!schedules) return [];
    return schedules.filter((s) => {
      if (filterActive === 'active' && !s.is_active) return false;
      if (filterActive === 'paused' && s.is_active) return false;
      if (filterAgent !== 'all' && s.agent_id !== filterAgent) return false;
      return true;
    });
  }, [schedules, filterActive, filterAgent]);

  const stats = useMemo(() => {
    if (!schedules) return { total: 0, active: 0, runsToday: 0, failedToday: 0 };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      total: schedules.length,
      active: schedules.filter((s) => s.is_active).length,
      runsToday: schedules.reduce((acc, s) => {
        // Approximate: show run_count as we don't have per-day breakdowns
        if (s.last_run_at && new Date(s.last_run_at) >= today) return acc + 1;
        return acc;
      }, 0),
      failedToday: 0, // Would need executions data; show 0 for now
    };
  }, [schedules]);

  const handleToggle = async (schedule: AgentSchedule) => {
    try {
      await updateMutation.mutateAsync({
        scheduleId: schedule.id,
        data: { is_active: !schedule.is_active },
      });
      toast.success(schedule.is_active ? 'Schedule paused' : 'Schedule activated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle schedule');
    }
  };

  const handleTrigger = async (scheduleId: string) => {
    try {
      await triggerMutation.mutateAsync(scheduleId);
      toast.success('Schedule triggered');
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Schedules
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          All scheduled agent runs across your agents
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Schedules" value={stats.total} icon={CalendarClock} color="text-foreground" />
        <SummaryCard label="Active" value={stats.active} icon={Activity} color="text-emerald-500" />
        <SummaryCard label="Runs Today" value={stats.runsToday} icon={Play} color="text-blue-500" />
        <SummaryCard label="Failed Today" value={stats.failedToday} icon={XCircle} color="text-red-500" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterActive} onValueChange={(v: any) => setFilterActive(v)}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agentNames.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Schedule list */}
      {filtered.length === 0 ? (
        <SpotlightCard className="bg-card border-dashed">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarClock className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {schedules && schedules.length > 0
                ? 'No schedules match your filters'
                : 'No schedules yet'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create schedules from an agent&apos;s config page
            </p>
          </div>
        </SpotlightCard>
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_120px_120px_100px_80px] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Agent</span>
            <span>Schedule</span>
            <span>Cron</span>
            <span>Next Run</span>
            <span>Last Run</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.map((schedule) => (
            <SpotlightCard key={schedule.id} className="bg-card">
              <div className="grid grid-cols-[1fr_1fr_1fr_120px_120px_100px_80px] gap-3 px-4 py-3 items-center text-sm">
                <Link
                  href={`/agents/config/${schedule.agent_id}`}
                  className="text-foreground hover:underline truncate"
                >
                  {schedule.agent_name || schedule.agent_id.slice(0, 8)}
                </Link>
                <span className="truncate font-medium">{schedule.name}</span>
                <span className="text-xs text-muted-foreground truncate" title={schedule.cron_expression}>
                  {schedule.cron_human || schedule.cron_expression}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(schedule.next_run_at)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(schedule.last_run_at)}</span>
                <div>
                  <Switch
                    checked={schedule.is_active}
                    onCheckedChange={() => handleToggle(schedule)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleTrigger(schedule.id)}
                    title="Trigger now"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}
    </div>
  );
}
