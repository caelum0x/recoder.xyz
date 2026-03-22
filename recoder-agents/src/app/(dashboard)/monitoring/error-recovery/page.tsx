'use client';

import { useState } from 'react';
import {
  ShieldCheck,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePlaybooks,
  usePlaybookStats,
  useCreatePlaybook,
  useDeletePlaybook,
  useExecutePlaybook,
  usePlaybookExecutions,
} from '@/hooks/agents/use-error-recovery';
import type { RecoveryPlaybook, RecoveryExecution } from '@/lib/api/error-recovery';

// ============================================================================
// Constants
// ============================================================================

const ERROR_TYPES = [
  'all',
  'timeout',
  'rate_limit',
  'auth_failure',
  'network',
  'validation',
  'general',
] as const;

const ERROR_TYPE_COLORS: Record<string, string> = {
  timeout: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  rate_limit: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  auth_failure: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  network: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  validation: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  general: 'bg-muted text-muted-foreground border-border',
};

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-500/10 text-green-600 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  running: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  skipped: 'bg-muted text-muted-foreground',
};

// ============================================================================
// Helpers
// ============================================================================

function successRate(playbook: RecoveryPlaybook): string {
  if (playbook.trigger_count === 0) return 'N/A';
  return `${Math.round((playbook.success_count / playbook.trigger_count) * 100)}%`;
}

// ============================================================================
// Stats Row
// ============================================================================

function StatsRow() {
  const { data: stats, isLoading } = usePlaybookStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
            <div className="h-4 w-20 bg-muted rounded mb-2" />
            <div className="h-6 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const typeEntries = Object.entries(stats?.by_error_type ?? {});

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Playbooks</p>
          <p className="text-lg font-semibold tabular-nums">{stats?.total_playbooks ?? 0}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-green-500/10">
          <CheckCircle className="h-5 w-5 text-green-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Success Rate</p>
          <p className="text-lg font-semibold tabular-nums">
            {stats?.overall_success_rate != null
              ? `${stats.overall_success_rate.toFixed(1)}%`
              : '--'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 col-span-2">
        <p className="text-xs text-muted-foreground mb-2">By Error Type</p>
        <div className="flex items-center gap-2 flex-wrap">
          {typeEntries.length === 0 ? (
            <span className="text-xs text-muted-foreground">None recorded</span>
          ) : (
            typeEntries.map(([type, count]) => (
              <span
                key={type}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium border',
                  ERROR_TYPE_COLORS[type] ?? ERROR_TYPE_COLORS.general
                )}
              >
                {count} {type}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Create Playbook Dialog
// ============================================================================

interface StepRow {
  action: string;
  timeout_seconds: string;
}

function CreatePlaybookDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorPattern, setErrorPattern] = useState('');
  const [errorType, setErrorType] = useState('general');
  const [steps, setSteps] = useState<StepRow[]>([{ action: '', timeout_seconds: '' }]);
  const [autoExecute, setAutoExecute] = useState(false);
  const [maxRetries, setMaxRetries] = useState('3');
  const [cooldown, setCooldown] = useState('60');
  const createMutation = useCreatePlaybook();

  const addStep = () => setSteps((prev) => [...prev, { action: '', timeout_seconds: '' }]);
  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));
  const updateStep = (idx: number, field: keyof StepRow, value: string) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const handleSubmit = async () => {
    if (!name.trim() || !errorPattern.trim()) return;
    const recoverySteps = steps
      .filter((s) => s.action.trim())
      .map((s, i) => ({
        step: i + 1,
        action: s.action.trim(),
        ...(s.timeout_seconds ? { timeout_seconds: parseInt(s.timeout_seconds, 10) } : {}),
      }));

    try {
      await createMutation.mutateAsync({
        playbook_name: name.trim(),
        description: description.trim() || undefined,
        error_pattern: errorPattern.trim(),
        error_type: errorType,
        recovery_steps: recoverySteps,
        auto_execute: autoExecute,
        max_retries: parseInt(maxRetries, 10) || 3,
        cooldown_seconds: parseInt(cooldown, 10) || 60,
      });
      setOpen(false);
      setName('');
      setDescription('');
      setErrorPattern('');
      setErrorType('general');
      setSteps([{ action: '', timeout_seconds: '' }]);
      setAutoExecute(false);
      setMaxRetries('3');
      setCooldown('60');
      onCreated();
    } catch {
      // handled by mutation
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-9 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Playbook
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">New Recovery Playbook</h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Playbook Name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Retry on timeout"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the playbook"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Error Pattern <span className="text-red-500">*</span>
            </label>
            <input
              value={errorPattern}
              onChange={(e) => setErrorPattern(e.target.value)}
              placeholder="e.g., Connection timeout after 30s"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Error Type</label>
              <select
                value={errorType}
                onChange={(e) => setErrorType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="timeout">Timeout</option>
                <option value="rate_limit">Rate Limit</option>
                <option value="auth_failure">Auth Failure</option>
                <option value="network">Network</option>
                <option value="validation">Validation</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Max Retries</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Cooldown (seconds)</label>
            <input
              type="number"
              min={0}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoExecute"
              checked={autoExecute}
              onChange={(e) => setAutoExecute(e.target.checked)}
              className="rounded border-input"
            />
            <label htmlFor="autoExecute" className="text-sm font-medium">
              Auto Execute
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Recovery Steps</label>
              <button
                onClick={addStep}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                Add Step
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                  <input
                    value={step.action}
                    onChange={(e) => updateStep(idx, 'action', e.target.value)}
                    placeholder="Action description"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    type="number"
                    min={0}
                    value={step.timeout_seconds}
                    onChange={(e) => updateStep(idx, 'timeout_seconds', e.target.value)}
                    placeholder="Timeout"
                    className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(idx)}
                      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-2 text-sm font-medium rounded-md border border-input hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !name.trim() || !errorPattern.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Playbook
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Execution Panel
// ============================================================================

function ExecutionPanel({ playbook }: { playbook: RecoveryPlaybook }) {
  const [agentId, setAgentId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastExecution, setLastExecution] = useState<RecoveryExecution | null>(null);
  const executeMutation = useExecutePlaybook();
  const { data: executions, isLoading: exLoading } = usePlaybookExecutions(playbook.id);

  const handleRun = async () => {
    try {
      const result = await executeMutation.mutateAsync({
        id: playbook.id,
        data: {
          agent_id: agentId.trim() || undefined,
          error_message: errorMessage.trim() || undefined,
        },
      });
      setLastExecution(result);
    } catch {
      // handled
    }
  };

  return (
    <div className="space-y-4 pt-3">
      {/* Steps list */}
      {playbook.recovery_steps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Recovery Steps</p>
          <ol className="space-y-1">
            {playbook.recovery_steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-xs font-medium shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{step.action || '(no action)'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Execution controls */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Run Simulation</p>
        <input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="Agent ID (optional)"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <textarea
          value={errorMessage}
          onChange={(e) => setErrorMessage(e.target.value)}
          placeholder="Error message (optional)"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        <button
          onClick={handleRun}
          disabled={executeMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {executeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Run Simulation
        </button>
      </div>

      {/* Last execution result */}
      {lastExecution && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[lastExecution.status])}>
              {lastExecution.status}
            </span>
            <span className="text-xs text-muted-foreground">
              {lastExecution.steps_completed}/{playbook.recovery_steps.length} steps completed
            </span>
          </div>
          <div className="space-y-1">
            {lastExecution.execution_log.map((entry) => (
              <div key={entry.step} className="flex items-center gap-2 text-xs">
                {entry.result === 'ok' ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                )}
                <span className="text-muted-foreground">Step {entry.step}:</span>
                <span className="truncate">{entry.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution history */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Execution History</p>
        {exLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        ) : executions && executions.length > 0 ? (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Steps</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Started</th>
                </tr>
              </thead>
              <tbody>
                {executions.slice(0, 10).map((ex) => (
                  <tr key={ex.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">
                      <span className={cn('px-1.5 py-0.5 rounded-full font-medium', STATUS_COLORS[ex.status])}>
                        {ex.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {ex.steps_completed}/{playbook.recovery_steps.length}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(ex.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No executions yet.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Playbook Card
// ============================================================================

function PlaybookCard({ playbook }: { playbook: RecoveryPlaybook }) {
  const [expanded, setExpanded] = useState(false);
  const deleteMutation = useDeletePlaybook();

  const typeColor = ERROR_TYPE_COLORS[playbook.error_type] ?? ERROR_TYPE_COLORS.general;
  const rate = successRate(playbook);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium border shrink-0', typeColor)}>
          {playbook.error_type}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{playbook.playbook_name}</p>
          <p className="text-xs text-muted-foreground truncate">{playbook.error_pattern}</p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <span>{playbook.recovery_steps.length} steps</span>
          <span className="tabular-nums">{playbook.trigger_count} triggers</span>
          <span className={cn('font-medium', rate !== 'N/A' ? 'text-green-600 dark:text-green-400' : '')}>
            {rate}
          </span>
          {playbook.auto_execute && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs">
              Auto
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteMutation.mutate(playbook.id);
          }}
          disabled={deleteMutation.isPending}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive shrink-0 ml-2"
          title="Delete playbook"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10 px-4 pb-4">
          {playbook.description && (
            <p className="text-sm text-muted-foreground pt-3">{playbook.description}</p>
          )}
          <ExecutionPanel playbook={playbook} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <ShieldCheck className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No playbooks yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        Create recovery playbooks to automate responses to known error patterns.
      </p>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function ErrorRecoveryPage() {
  const [activeType, setActiveType] = useState<string>('all');
  const { data: playbooks, isLoading } = usePlaybooks(
    activeType !== 'all' ? { error_type: activeType } : undefined
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-6 w-6" />
              Error Recovery Playbooks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define and simulate automated recovery steps for known error patterns.
            </p>
          </div>
          <CreatePlaybookDialog onCreated={() => {}} />
        </div>

        {/* Stats */}
        <StatsRow />

        {/* Error type filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {ERROR_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                activeType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {type === 'all' ? 'All' : type.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Playbook list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading playbooks...</span>
            </div>
          ) : playbooks && playbooks.length > 0 ? (
            playbooks.map((playbook) => (
              <PlaybookCard key={playbook.id} playbook={playbook} />
            ))
          ) : (
            <EmptyState onCreate={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
}
