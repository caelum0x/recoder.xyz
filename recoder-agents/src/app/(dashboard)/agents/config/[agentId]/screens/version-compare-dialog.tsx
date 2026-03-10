'use client';

import React, { useState } from 'react';
import {
  GitCompare,
  Plus,
  Minus,
  ArrowRight,
  Wrench,
  FileText,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getVersionComparison,
  rollbackToVersion,
  type VersionComparisonResponse,
} from '@/lib/api/agent-versions';
import { versionKeys } from '@/hooks/agents/keys';
import type { AgentVersion } from '@/hooks/agents/utils';

interface VersionCompareDialogProps {
  agentId: string;
  versionIds: [string, string];
  open: boolean;
  onClose: () => void;
}

export function VersionCompareDialog({
  agentId,
  versionIds,
  open,
  onClose,
}: VersionCompareDialogProps) {
  const queryClient = useQueryClient();

  const comparisonQuery = useQuery<VersionComparisonResponse>({
    queryKey: ['version-comparison', agentId, ...versionIds],
    queryFn: () => getVersionComparison(agentId, versionIds[0], versionIds[1]),
    enabled: open && versionIds.length === 2,
    staleTime: 60000,
  });

  const rollbackMutation = useMutation<AgentVersion, Error, string>({
    mutationFn: (versionId: string) => rollbackToVersion(agentId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.list(agentId) });
      queryClient.invalidateQueries({ queryKey: ['agents', 'detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Version restored successfully. A new version was created from the restored configuration.');
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore version');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-muted-foreground" />
              <DialogTitle>Version Comparison</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          {comparisonQuery.isLoading && (
            <div className="flex items-center justify-center py-16">
              <RecoderLoader size="large" />
            </div>
          )}

          {comparisonQuery.error && (
            <div className="text-center py-12">
              <AlertCircle className="h-8 w-8 mx-auto mb-3 text-destructive" />
              <p className="text-sm text-muted-foreground">Failed to load comparison</p>
              <p className="text-xs text-muted-foreground mt-1">
                {comparisonQuery.error.message}
              </p>
            </div>
          )}

          {comparisonQuery.data && (
            <ComparisonContent
              comparison={comparisonQuery.data}
              onRestore={(versionId) => rollbackMutation.mutate(versionId)}
              isRestoring={rollbackMutation.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Comparison Content ----

interface ComparisonContentProps {
  comparison: VersionComparisonResponse;
  onRestore: (versionId: string) => void;
  isRestoring: boolean;
}

function ComparisonContent({ comparison, onRestore, isRestoring }: ComparisonContentProps) {
  const { version1, version2, differences } = comparison;

  const promptDiff = differences.find((d) => d.field === 'system_prompt');
  const modelDiff = differences.find((d) => d.field === 'model');
  const toolDiffs = differences.filter((d) => d.field.startsWith('tool.'));

  return (
    <div className="space-y-4">
      {/* Version headers */}
      <div className="grid grid-cols-2 gap-3">
        <VersionCard version={version1} label="Version A" />
        <VersionCard version={version2} label="Version B" />
      </div>

      {/* No differences */}
      {differences.length === 0 && (
        <div className="text-center py-8 bg-muted/20 rounded-xl border border-border">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-medium">Versions are identical</p>
          <p className="text-xs text-muted-foreground mt-1">
            No differences found between these two versions.
          </p>
        </div>
      )}

      {/* Diff summary */}
      {differences.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <span>
            {differences.length} difference{differences.length !== 1 ? 's' : ''} found
          </span>
        </div>
      )}

      {/* System Prompt Diff */}
      {promptDiff && (
        <DiffSection title="System Prompt" icon={FileText}>
          <SystemPromptDiff
            oldValue={promptDiff.old_value || ''}
            newValue={promptDiff.new_value || ''}
            v1Name={version1.version_name}
            v2Name={version2.version_name}
          />
        </DiffSection>
      )}

      {/* Model Diff */}
      {modelDiff && (
        <DiffSection title="Model" icon={FileText}>
          <div className="flex items-center gap-3 p-3">
            <Badge
              variant="outline"
              className="font-mono text-xs bg-red-500/5 text-red-400 border-red-500/20"
            >
              {modelDiff.old_value || 'None'}
            </Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Badge
              variant="outline"
              className="font-mono text-xs bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
            >
              {modelDiff.new_value || 'None'}
            </Badge>
          </div>
        </DiffSection>
      )}

      {/* Tool Diffs */}
      {toolDiffs.length > 0 && (
        <DiffSection title="Tools" icon={Wrench}>
          <div className="space-y-2 p-3">
            {toolDiffs.map((diff) => {
              const toolName = diff.field.replace('tool.', '');
              return (
                <div key={diff.field} className="flex items-center gap-2">
                  {diff.type === 'added' && (
                    <>
                      <Plus className="h-3.5 w-3.5 text-emerald-500" />
                      <Badge
                        variant="outline"
                        className="font-mono text-xs bg-emerald-500/5 text-emerald-400 border-emerald-500/20"
                      >
                        {toolName}
                      </Badge>
                      <span className="text-xs text-emerald-500">added</span>
                    </>
                  )}
                  {diff.type === 'removed' && (
                    <>
                      <Minus className="h-3.5 w-3.5 text-red-500" />
                      <Badge
                        variant="outline"
                        className="font-mono text-xs bg-red-500/5 text-red-400 border-red-500/20"
                      >
                        {toolName}
                      </Badge>
                      <span className="text-xs text-red-500">removed</span>
                    </>
                  )}
                  {diff.type === 'modified' && (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-amber-500" />
                      <Badge
                        variant="outline"
                        className="font-mono text-xs bg-amber-500/5 text-amber-400 border-amber-500/20"
                      >
                        {toolName}
                      </Badge>
                      <span className="text-xs text-amber-500">modified</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </DiffSection>
      )}

      {/* Restore buttons */}
      {differences.length > 0 && (
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => onRestore(version1.version_id)}
            disabled={isRestoring || version1.is_active}
          >
            {isRestoring ? (
              <RecoderLoader customSize={14} />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Restore {version1.version_name}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => onRestore(version2.version_id)}
            disabled={isRestoring || version2.is_active}
          >
            {isRestoring ? (
              <RecoderLoader customSize={14} />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Restore {version2.version_name}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Helper Components ----

function VersionCard({ version, label }: { version: AgentVersion; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </span>
        {version.is_active && (
          <Badge
            variant="default"
            className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
          >
            Active
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium truncate">{version.version_name}</p>
      <p className="text-xs text-muted-foreground">
        v{version.version_number} &middot;{' '}
        {format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}
      </p>
      {version.change_description && (
        <p className="text-xs text-muted-foreground italic truncate">
          {version.change_description}
        </p>
      )}
    </div>
  );
}

function DiffSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </button>
      {isOpen && (
        <>
          <Separator />
          {children}
        </>
      )}
    </div>
  );
}

function SystemPromptDiff({
  oldValue,
  newValue,
  v1Name,
  v2Name,
}: {
  oldValue: string;
  newValue: string;
  v1Name: string;
  v2Name: string;
}) {
  const oldLines = oldValue.split('\n');
  const newLines = newValue.split('\n');
  const diffLines = computeLineDiff(oldLines, newLines);

  return (
    <div className="overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-2 gap-0 text-xs text-muted-foreground border-b border-border">
        <div className="px-3 py-1.5 bg-red-500/5 truncate">{v1Name}</div>
        <div className="px-3 py-1.5 bg-emerald-500/5 border-l border-border truncate">
          {v2Name}
        </div>
      </div>

      <ScrollArea className="max-h-[400px]">
        <div className="grid grid-cols-2 gap-0">
          {/* Left column (old) */}
          <div className="font-mono text-xs leading-relaxed">
            {diffLines.map((line, i) => (
              <div
                key={`old-${i}`}
                className={cn(
                  'px-3 py-0.5 min-h-[1.5rem] whitespace-pre-wrap break-all',
                  line.type === 'removed' && 'bg-red-500/10 text-red-400',
                  line.type === 'modified' && 'bg-red-500/5 text-red-300',
                  line.type === 'unchanged' && 'text-muted-foreground',
                  line.type === 'added' && 'bg-transparent'
                )}
              >
                {line.type === 'added' ? '' : (line.oldLine ?? '')}
              </div>
            ))}
          </div>

          {/* Right column (new) */}
          <div className="font-mono text-xs leading-relaxed border-l border-border">
            {diffLines.map((line, i) => (
              <div
                key={`new-${i}`}
                className={cn(
                  'px-3 py-0.5 min-h-[1.5rem] whitespace-pre-wrap break-all',
                  line.type === 'added' && 'bg-emerald-500/10 text-emerald-400',
                  line.type === 'modified' && 'bg-emerald-500/5 text-emerald-300',
                  line.type === 'unchanged' && 'text-muted-foreground',
                  line.type === 'removed' && 'bg-transparent'
                )}
              >
                {line.type === 'removed' ? '' : (line.newLine ?? '')}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ---- Diff Algorithm ----

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  oldLine?: string;
  newLine?: string;
}

function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const lcs = computeLCS(oldLines, newLines);

  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (lcsIdx < lcs.length) {
      while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
        if (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
          result.push({
            type: 'modified',
            oldLine: oldLines[oldIdx],
            newLine: newLines[newIdx],
          });
          oldIdx++;
          newIdx++;
        } else {
          result.push({ type: 'removed', oldLine: oldLines[oldIdx] });
          oldIdx++;
        }
      }

      while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
        result.push({ type: 'added', newLine: newLines[newIdx] });
        newIdx++;
      }

      if (lcsIdx < lcs.length) {
        result.push({
          type: 'unchanged',
          oldLine: oldLines[oldIdx],
          newLine: newLines[newIdx],
        });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      }
    } else {
      if (oldIdx < oldLines.length && newIdx < newLines.length) {
        result.push({
          type: 'modified',
          oldLine: oldLines[oldIdx],
          newLine: newLines[newIdx],
        });
        oldIdx++;
        newIdx++;
      } else if (oldIdx < oldLines.length) {
        result.push({ type: 'removed', oldLine: oldLines[oldIdx] });
        oldIdx++;
      } else if (newIdx < newLines.length) {
        result.push({ type: 'added', newLine: newLines[newIdx] });
        newIdx++;
      }
    }
  }

  return result;
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  if (m > 500 || n > 500) {
    const result: string[] = [];
    const bSet = new Set(b);
    for (const line of a) {
      if (bSet.has(line)) {
        result.push(line);
      }
    }
    return result;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}
