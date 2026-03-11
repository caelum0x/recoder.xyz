'use client';

import { useState } from 'react';
import {
  RotateCcw,
  Plus,
  Trash2,
  Clock,
  TrendingUp,
  AlertTriangle,
  Activity,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useRetryPolicies,
  useCreateRetryPolicy,
  useDeleteRetryPolicy,
  useRetryStats,
} from '@/hooks/agents/use-agent-retry';
import type { RetryPolicy, CreateRetryPolicyRequest } from '@/lib/api/agent-retry';

// ---------------------------------------------------------------------------
// Error type options
// ---------------------------------------------------------------------------

const ERROR_TYPE_OPTIONS = [
  { value: 'timeout', label: 'Timeout' },
  { value: 'rate_limit', label: 'Rate Limit' },
  { value: 'server_error', label: 'Server Error' },
  { value: 'connection_error', label: 'Connection Error' },
  { value: 'sandbox_error', label: 'Sandbox Error' },
  { value: 'model_error', label: 'Model Error' },
];

const ERROR_TYPE_COLORS: Record<string, string> = {
  timeout: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  rate_limit: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  server_error: 'bg-red-500/10 text-red-700 border-red-500/20',
  connection_error: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  sandbox_error: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  model_error: 'bg-pink-500/10 text-pink-700 border-pink-500/20',
};

// ---------------------------------------------------------------------------
// Stats Cards
// ---------------------------------------------------------------------------

function StatsCards() {
  const { data: stats, isLoading } = useRetryStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-4 w-20 bg-muted animate-pulse rounded mb-2" />
              <div className="h-6 w-12 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Retries',
      value: stats?.total_retries ?? 0,
      icon: RotateCcw,
      color: 'text-blue-500',
    },
    {
      label: 'Success Rate',
      value: stats ? `${stats.success_rate}%` : '0%',
      icon: TrendingUp,
      color: 'text-green-500',
    },
    {
      label: 'Most Retried Agent',
      value: stats?.most_retried_agent
        ? `${stats.most_retried_agent.slice(0, 8)}... (${stats.most_retried_agent_count})`
        : 'None',
      icon: AlertTriangle,
      color: 'text-amber-500',
    },
    {
      label: 'Avg Attempts',
      value: stats?.avg_attempts ?? 0,
      icon: Activity,
      color: 'text-purple-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={cn('h-4 w-4', card.color)} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-lg font-semibold">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Policy Dialog
// ---------------------------------------------------------------------------

function NewPolicyDialog() {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateRetryPolicy();

  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [maxRetries, setMaxRetries] = useState(3);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [backoff, setBackoff] = useState(2.0);
  const [selectedErrors, setSelectedErrors] = useState<string[]>([
    'timeout',
    'rate_limit',
    'server_error',
  ]);

  const toggleError = (error: string) => {
    setSelectedErrors((prev) =>
      prev.includes(error) ? prev.filter((e) => e !== error) : [...prev, error]
    );
  };

  const handleCreate = () => {
    if (!name.trim()) return;

    const data: CreateRetryPolicyRequest = {
      name: name.trim(),
      agent_id: agentId.trim() || undefined,
      max_retries: maxRetries,
      retry_delay_seconds: delaySeconds,
      backoff_multiplier: backoff,
      retry_on_errors: selectedErrors,
    };

    createMutation.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        setName('');
        setAgentId('');
        setMaxRetries(3);
        setDelaySeconds(30);
        setBackoff(2.0);
        setSelectedErrors(['timeout', 'rate_limit', 'server_error']);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          New Policy
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Retry Policy</DialogTitle>
          <DialogDescription>
            Configure automatic retry behavior for failed agent runs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="policy-name">Policy Name</Label>
            <Input
              id="policy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Retry Policy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-id">Agent ID (optional)</Label>
            <Input
              id="agent-id"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Leave empty for global default"
            />
            <p className="text-xs text-muted-foreground">
              Scope to a specific agent, or leave empty for all agents.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="max-retries">Max Retries</Label>
              <Input
                id="max-retries"
                type="number"
                min={1}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delay">Delay (s)</Label>
              <Input
                id="delay"
                type="number"
                min={1}
                max={3600}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backoff">Backoff</Label>
              <Select
                value={String(backoff)}
                onValueChange={(v) => setBackoff(Number(v))}
              >
                <SelectTrigger id="backoff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1.0x</SelectItem>
                  <SelectItem value="1.5">1.5x</SelectItem>
                  <SelectItem value="2">2.0x</SelectItem>
                  <SelectItem value="3">3.0x</SelectItem>
                  <SelectItem value="5">5.0x</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Retry on Error Types</Label>
            <div className="flex flex-wrap gap-2">
              {ERROR_TYPE_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={cn(
                    'cursor-pointer select-none transition-colors',
                    selectedErrors.includes(opt.value)
                      ? ERROR_TYPE_COLORS[opt.value] || 'bg-primary/10 text-primary'
                      : 'opacity-40'
                  )}
                  onClick={() => toggleError(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || selectedErrors.length === 0 || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Policy Row
// ---------------------------------------------------------------------------

function PolicyRow({ policy }: { policy: RetryPolicy }) {
  const deleteMutation = useDeleteRetryPolicy();

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{policy.name}</span>
          {policy.agent_id ? (
            <Badge variant="secondary" className="text-xs shrink-0">
              {policy.agent_id.slice(0, 8)}...
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs shrink-0">
              Global
            </Badge>
          )}
          {policy.is_active ? (
            <Badge variant="default" className="text-xs bg-green-600 shrink-0">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs shrink-0">
              Inactive
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />
            {policy.max_retries} retries
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {policy.retry_delay_seconds}s delay
          </span>
          <span>{policy.backoff_multiplier}x backoff</span>
        </div>

        <div className="flex flex-wrap gap-1 mt-1.5">
          {policy.retry_on_errors.map((err) => (
            <Badge
              key={err}
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0',
                ERROR_TYPE_COLORS[err] || ''
              )}
            >
              {err}
            </Badge>
          ))}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 ml-2 text-muted-foreground hover:text-destructive"
        onClick={() => deleteMutation.mutate(policy.id)}
        disabled={deleteMutation.isPending}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RetryPolicyManager
// ---------------------------------------------------------------------------

export function RetryPolicyManager() {
  const { data: policies = [], isLoading } = useRetryPolicies();

  return (
    <div className="space-y-6">
      {/* Stats */}
      <StatsCards />

      {/* Policies */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-medium">Retry Policies</CardTitle>
          <NewPolicyDialog />
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : policies.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No retry policies configured yet.</p>
              <p className="text-xs mt-1">
                Create a policy to automatically retry failed agent runs.
              </p>
            </div>
          ) : (
            policies.map((policy) => (
              <PolicyRow key={policy.id} policy={policy} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
