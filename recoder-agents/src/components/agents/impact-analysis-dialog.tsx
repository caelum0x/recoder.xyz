'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  useRunImpactAnalysis,
  useAgentImpactAnalyses,
  useUpdateImpactStatus,
} from '@/hooks/agents/use-change-impact';
import type {
  ChangeType,
  RiskLevel,
  AnalysisStatus,
  ImpactAnalysis,
} from '@/lib/api/change-impact';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANGE_TYPES: { value: ChangeType; label: string }[] = [
  { value: 'config_update', label: 'Config Update' },
  { value: 'tool_change', label: 'Tool Change' },
  { value: 'prompt_change', label: 'Prompt Change' },
  { value: 'model_change', label: 'Model Change' },
  { value: 'workflow_change', label: 'Workflow Change' },
  { value: 'dependency_change', label: 'Dependency Change' },
];

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'bg-green-500/10 text-green-600 border-green-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const RISK_ICONS: Record<RiskLevel, typeof ShieldCheck> = {
  low: ShieldCheck,
  medium: Shield,
  high: ShieldAlert,
  critical: ShieldX,
};

const STATUS_STYLES: Record<AnalysisStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600',
  approved: 'bg-green-500/10 text-green-600',
  rejected: 'bg-red-500/10 text-red-600',
  applied: 'bg-blue-500/10 text-blue-600',
};

// ---------------------------------------------------------------------------
// Risk Badge
// ---------------------------------------------------------------------------

function RiskBadge({ level }: { level: RiskLevel }) {
  const Icon = RISK_ICONS[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        RISK_COLORS[level],
      )}
    >
      <Icon className="h-3 w-3" />
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AnalysisStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
        STATUS_STYLES[status],
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Analysis Result Card
// ---------------------------------------------------------------------------

function AnalysisResultCard({
  analysis,
  agentId,
  onStatusUpdate,
}: {
  analysis: ImpactAnalysis;
  agentId: string;
  onStatusUpdate: (id: string, status: 'approved' | 'rejected') => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RiskBadge level={analysis.risk_level} />
          <StatusBadge status={analysis.status} />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(analysis.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Type + description */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">
          {CHANGE_TYPES.find((ct) => ct.value === analysis.change_type)?.label ??
            analysis.change_type}
        </span>
        <p className="text-sm text-foreground mt-0.5">{analysis.change_description}</p>
      </div>

      {/* Impact summary */}
      <div className="text-xs text-muted-foreground">
        {analysis.impact_assessment?.summary ?? 'No summary available.'}
      </div>

      {/* Affected items */}
      {analysis.affected_items.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
            />
            {analysis.affected_items.length} affected item
            {analysis.affected_items.length !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {analysis.affected_items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-xs rounded-md bg-muted/50 px-2.5 py-1.5"
                >
                  <Activity className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">{item.name}</span>
                    <span className="text-muted-foreground ml-1">({item.type})</span>
                    <p className="text-muted-foreground">{item.impact}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Approve / Reject */}
      {analysis.status === 'pending' && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-green-600 border-green-500/30 hover:bg-green-500/10"
            onClick={() => onStatusUpdate(analysis.id, 'approved')}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10"
            onClick={() => onStatusUpdate(analysis.id, 'rejected')}
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Impact Analysis Dialog
// ---------------------------------------------------------------------------

interface ImpactAnalysisDialogProps {
  agentId: string;
  open: boolean;
  onClose: () => void;
}

export function ImpactAnalysisDialog({
  agentId,
  open,
  onClose,
}: ImpactAnalysisDialogProps) {
  const [changeType, setChangeType] = useState<ChangeType>('config_update');
  const [description, setDescription] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const runMutation = useRunImpactAnalysis();
  const updateMutation = useUpdateImpactStatus();
  const { data: analyses, isLoading: historyLoading } = useAgentImpactAnalyses(
    open ? agentId : null,
  );

  const handleAnalyze = async () => {
    if (!description.trim()) {
      toast.error('Please provide a change description.');
      return;
    }
    try {
      await runMutation.mutateAsync({
        agentId,
        body: {
          change_type: changeType,
          change_description: description.trim(),
          proposed_changes: {},
        },
      });
      toast.success('Impact analysis complete.');
      setDescription('');
      setShowHistory(true);
    } catch {
      toast.error('Failed to run impact analysis.');
    }
  };

  const handleStatusUpdate = async (
    analysisId: string,
    status: 'approved' | 'rejected',
  ) => {
    try {
      await updateMutation.mutateAsync({
        analysisId,
        body: { status },
        agentId,
      });
      toast.success(`Analysis ${status}.`);
    } catch {
      toast.error(`Failed to ${status} analysis.`);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-foreground">
              Change Impact Analysis
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Change type selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Change Type
            </label>
            <select
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as ChangeType)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {CHANGE_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Change Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the change you want to make..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Analyze button */}
          <Button
            onClick={handleAnalyze}
            disabled={runMutation.isPending || !description.trim()}
            className="w-full gap-2"
          >
            {runMutation.isPending ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                Analyze Impact
              </>
            )}
          </Button>

          {/* Latest result */}
          {runMutation.data && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                Latest Result
              </h3>
              <AnalysisResultCard
                analysis={runMutation.data}
                agentId={agentId}
                onStatusUpdate={handleStatusUpdate}
              />
            </div>
          )}

          {/* History toggle */}
          <div className="border-t border-border pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  showHistory && 'rotate-180',
                )}
              />
              Analysis History
              {analyses && analyses.length > 0 && (
                <span className="ml-1 text-[10px]">({analyses.length})</span>
              )}
            </button>

            {showHistory && (
              <div className="mt-3 space-y-3">
                {historyLoading ? (
                  <div className="space-y-2 animate-pulse">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-border bg-card p-4"
                      >
                        <div className="h-4 w-32 bg-muted rounded mb-2" />
                        <div className="h-3 w-full bg-muted rounded" />
                      </div>
                    ))}
                  </div>
                ) : !analyses || analyses.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No previous analyses.
                  </p>
                ) : (
                  analyses.map((a) => (
                    <AnalysisResultCard
                      key={a.id}
                      analysis={a}
                      agentId={agentId}
                      onStatusUpdate={handleStatusUpdate}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
