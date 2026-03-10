'use client';

import React, { useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  ArrowUpDown,
  Settings,
  Clock,
  Zap,
  ListOrdered,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useRunQueue,
  useEnqueueRun,
  useCancelQueueEntry,
  useUpdatePriority,
  useQueueStats,
  useQueueSettings,
  useUpdateQueueSettings,
  useProcessNext,
} from '@/hooks/agents/use-agent-run-queue';

// ============================================================================
// Helpers
// ============================================================================

function getPriorityBadge(priority: number) {
  if (priority <= 3) {
    return <Badge variant="destructive">High ({priority})</Badge>;
  }
  if (priority <= 6) {
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Medium ({priority})</Badge>;
  }
  return <Badge className="bg-green-500/15 text-green-600 border-green-500/30">Low ({priority})</Badge>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'queued':
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Queued</Badge>;
    case 'running':
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30"><Play className="h-3 w-3 mr-1" />Running</Badge>;
    case 'completed':
      return <Badge className="bg-green-500/15 text-green-600 border-green-500/30">Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'cancelled':
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function formatRelativeTime(dateStr: string | null) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatWaitTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ============================================================================
// Stat Cards
// ============================================================================

function StatsHeader() {
  const { data: stats, isLoading } = useQueueStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const statCards = [
    { icon: ListOrdered, label: 'Queued', value: stats?.queued_count ?? 0, color: 'text-amber-500' },
    { icon: Play, label: 'Running', value: stats?.running_count ?? 0, color: 'text-blue-500' },
    { icon: Clock, label: 'Avg Wait Time', value: formatWaitTime(stats?.avg_wait_time_seconds ?? 0), color: 'text-purple-500' },
    { icon: Zap, label: 'Completed Today', value: stats?.completed_today ?? 0, color: 'text-green-500' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Enqueue Dialog
// ============================================================================

function EnqueueDialog() {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [priority, setPriority] = useState([5]);

  const enqueue = useEnqueueRun();

  const handleSubmit = () => {
    if (!agentId.trim()) return;
    enqueue.mutate(
      {
        agent_id: agentId.trim(),
        input_message: inputMessage.trim() || undefined,
        priority: priority[0],
      },
      {
        onSuccess: () => {
          setOpen(false);
          setAgentId('');
          setInputMessage('');
          setPriority([5]);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Zap className="h-4 w-4 mr-2" />
          Enqueue Run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enqueue Agent Run</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">Agent ID</label>
            <Input
              placeholder="Enter agent ID"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Input Message</label>
            <Textarea
              placeholder="Optional input message for the agent..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              Priority: {priority[0]} {priority[0] <= 3 ? '(High)' : priority[0] <= 6 ? '(Medium)' : '(Low)'}
            </label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={priority}
              onValueChange={setPriority}
              className="mt-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1 (Highest)</span>
              <span>10 (Lowest)</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!agentId.trim() || enqueue.isPending}>
            {enqueue.isPending ? 'Enqueuing...' : 'Enqueue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Reprioritize Dialog
// ============================================================================

function ReprioritizeDialog({ entryId, currentPriority }: { entryId: string; currentPriority: number }) {
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = useState([currentPriority]);
  const updatePriority = useUpdatePriority();

  const handleSave = () => {
    updatePriority.mutate(
      { entryId, priority: priority[0] },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ArrowUpDown className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Priority</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium">
            Priority: {priority[0]} {priority[0] <= 3 ? '(High)' : priority[0] <= 6 ? '(Medium)' : '(Low)'}
          </label>
          <Slider
            min={1}
            max={10}
            step={1}
            value={priority}
            onValueChange={setPriority}
            className="mt-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updatePriority.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Settings Panel
// ============================================================================

function SettingsPanel() {
  const { data: settings, isLoading } = useQueueSettings();
  const updateSettings = useUpdateQueueSettings();
  const [expanded, setExpanded] = useState(false);

  const [maxConcurrent, setMaxConcurrent] = useState([3]);
  const [defaultPriority, setDefaultPriority] = useState([5]);
  const [autoRetry, setAutoRetry] = useState(false);
  const [maxRetries, setMaxRetries] = useState('2');

  React.useEffect(() => {
    if (settings) {
      setMaxConcurrent([settings.max_concurrent_runs]);
      setDefaultPriority([settings.default_priority]);
      setAutoRetry(settings.auto_retry_failed);
      setMaxRetries(String(settings.max_retries));
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      max_concurrent_runs: maxConcurrent[0],
      default_priority: defaultPriority[0],
      auto_retry_failed: autoRetry,
      max_retries: parseInt(maxRetries) || 2,
    });
  };

  if (isLoading) {
    return <Card><CardContent className="p-4"><Skeleton className="h-24" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4" />
          Queue Settings
          <span className="text-xs text-muted-foreground ml-auto">
            {expanded ? 'Click to collapse' : 'Click to expand'}
          </span>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">
              Max Concurrent Runs: {maxConcurrent[0]}
            </label>
            <Slider
              min={1}
              max={20}
              step={1}
              value={maxConcurrent}
              onValueChange={setMaxConcurrent}
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              Default Priority: {defaultPriority[0]}
            </label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={defaultPriority}
              onValueChange={setDefaultPriority}
              className="mt-2"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Auto-Retry Failed Runs</label>
            <Switch checked={autoRetry} onCheckedChange={setAutoRetry} />
          </div>
          {autoRetry && (
            <div>
              <label className="text-sm font-medium">Max Retries</label>
              <Input
                type="number"
                min={0}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(e.target.value)}
                className="w-24"
              />
            </div>
          )}
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full">
            {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AgentRunQueuePage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('');

  const filters = {
    status: statusFilter === 'all' ? undefined : statusFilter,
    agent_id: agentFilter || undefined,
    limit: 50,
  };

  const { data: entries, isLoading } = useRunQueue(filters);
  const cancelEntry = useCancelQueueEntry();
  const processNext = useProcessNext();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Run Queue</h1>
          <p className="text-sm text-muted-foreground">
            Manage and prioritize your agent run queue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => processNext.mutate()}
            disabled={processNext.isPending}
          >
            <Play className="h-4 w-4 mr-2" />
            Process Next
          </Button>
          <EnqueueDialog />
        </div>
      </div>

      <StatsHeader />

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Filter by agent ID..."
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="w-60"
        />
      </div>

      {/* Queue Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !entries || entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    <Pause className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No queue entries found
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs max-w-[140px] truncate" title={entry.agent_id}>
                      {entry.agent_id}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm" title={entry.input_message || ''}>
                      {entry.input_message ? entry.input_message.slice(0, 60) + (entry.input_message.length > 60 ? '...' : '') : '-'}
                    </TableCell>
                    <TableCell>{getPriorityBadge(entry.priority)}</TableCell>
                    <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    <TableCell className="text-center">{entry.position ?? '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelativeTime(entry.queued_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {entry.status === 'queued' && (
                          <>
                            <ReprioritizeDialog entryId={entry.id} currentPriority={entry.priority} />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cancelEntry.mutate(entry.id)}
                              disabled={cancelEntry.isPending}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SettingsPanel />
    </div>
  );
}
