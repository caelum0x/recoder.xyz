'use client';

import { useState, useCallback } from 'react';
import {
  Trash2,
  Archive,
  Download,
  Tag,
  TagX,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExecuteBulkOp, usePreviewBulkOp } from '@/hooks/use-bulk-operations';
import type { BulkPreviewResponse, BulkExecuteResponse } from '@/lib/api/bulk-operations';

// ============================================================================
// Types
// ============================================================================

interface BulkOperationBarProps {
  selectedIds: string[];
  targetType: 'agent' | 'thread';
  onClearSelection: () => void;
  tagId?: string;
}

type OpAction = 'delete' | 'archive' | 'export' | 'tag_assign' | 'tag_remove';

// ============================================================================
// Helpers
// ============================================================================

function getOperationType(action: OpAction, targetType: 'agent' | 'thread'): string {
  switch (action) {
    case 'delete':
      return `${targetType}_delete`;
    case 'archive':
      return 'thread_archive';
    case 'export':
      return `${targetType}_export`;
    case 'tag_assign':
      return 'tag_assign';
    case 'tag_remove':
      return 'tag_remove';
  }
}

const ACTION_META: Record<OpAction, { label: string; icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' }> = {
  delete: { label: 'Delete', icon: <Trash2 className="h-3.5 w-3.5" />, variant: 'destructive' },
  archive: { label: 'Archive', icon: <Archive className="h-3.5 w-3.5" />, variant: 'outline' },
  export: { label: 'Export', icon: <Download className="h-3.5 w-3.5" />, variant: 'outline' },
  tag_assign: { label: 'Assign Tag', icon: <Tag className="h-3.5 w-3.5" />, variant: 'outline' },
  tag_remove: { label: 'Remove Tag', icon: <TagX className="h-3.5 w-3.5" />, variant: 'outline' },
};

// ============================================================================
// Component
// ============================================================================

export function BulkOperationBar({
  selectedIds,
  targetType,
  onClearSelection,
  tagId,
}: BulkOperationBarProps) {
  const [confirmAction, setConfirmAction] = useState<OpAction | null>(null);
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);
  const [result, setResult] = useState<BulkExecuteResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const executeMutation = useExecuteBulkOp();
  const previewMutation = usePreviewBulkOp();

  const availableActions: OpAction[] =
    targetType === 'agent'
      ? ['delete', 'export', 'tag_assign', 'tag_remove']
      : ['delete', 'archive', 'export'];

  const handleAction = useCallback(
    async (action: OpAction) => {
      setConfirmAction(action);
      setResult(null);
      setIsLoadingPreview(true);

      try {
        const operationType = getOperationType(action, targetType);
        const params: Record<string, unknown> = {};
        if ((action === 'tag_assign' || action === 'tag_remove') && tagId) {
          params.tag_id = tagId;
        }

        const previewResult = await previewMutation.mutateAsync({
          operation_type: operationType,
          target_ids: selectedIds,
          params: Object.keys(params).length > 0 ? params : undefined,
        });

        setPreview(previewResult);
      } catch {
        setPreview(null);
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [selectedIds, targetType, tagId, previewMutation],
  );

  const handleConfirm = useCallback(async () => {
    if (!confirmAction) return;

    const operationType = getOperationType(confirmAction, targetType);
    const params: Record<string, unknown> = {};
    if ((confirmAction === 'tag_assign' || confirmAction === 'tag_remove') && tagId) {
      params.tag_id = tagId;
    }

    try {
      const opResult = await executeMutation.mutateAsync({
        operation_type: operationType,
        target_ids: selectedIds,
        params: Object.keys(params).length > 0 ? params : undefined,
      });

      setResult(opResult);
    } catch {
      // Error handled by mutation
    }
  }, [confirmAction, targetType, selectedIds, tagId, executeMutation]);

  const handleClose = useCallback(() => {
    setConfirmAction(null);
    setPreview(null);
    setResult(null);
    if (result?.status === 'completed') {
      onClearSelection();
    }
  }, [result, onClearSelection]);

  if (selectedIds.length === 0) return null;

  const isExecuting = executeMutation.isPending;
  const progressPct =
    result && result.target_count > 0
      ? Math.round((result.processed_count / result.target_count) * 100)
      : 0;

  return (
    <>
      {/* Floating bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5 shadow-lg">
        <Badge variant="secondary" className="text-sm font-medium">
          {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
        </Badge>

        <div className="h-5 w-px bg-border" />

        {availableActions.map((action) => {
          const meta = ACTION_META[action];
          return (
            <Button
              key={action}
              variant={meta.variant}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => handleAction(action)}
            >
              {meta.icon}
              {meta.label}
            </Button>
          );
        })}

        <div className="h-5 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClearSelection}
          title="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmAction && ACTION_META[confirmAction].icon}
              Confirm {confirmAction && ACTION_META[confirmAction].label}
            </DialogTitle>
            <DialogDescription>
              {result
                ? 'Operation complete.'
                : isLoadingPreview
                  ? 'Validating targets...'
                  : preview?.preview_message || 'Preparing operation...'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Preview info */}
            {!result && preview && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Valid targets</span>
                  <Badge variant="outline">{preview.valid_count}</Badge>
                </div>
                {preview.invalid_ids.length > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      {preview.invalid_ids.length} target(s) not found and will be skipped
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Execution progress */}
            {isExecuting && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </div>
                <Progress value={progressPct} className="h-2" />
              </div>
            )}

            {/* Result summary */}
            {result && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {result.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : result.status === 'partial' ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="text-sm font-medium capitalize">{result.status}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-1.5">
                    <span className="text-muted-foreground">Processed</span>
                    <span className="font-mono">{result.processed_count}</span>
                  </div>
                  <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-1.5">
                    <span className="text-muted-foreground">Errors</span>
                    <span className="font-mono text-red-500">{result.error_count}</span>
                  </div>
                </div>

                {result.errors && result.errors.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    <p className="text-xs font-medium text-muted-foreground">Error details:</p>
                    {result.errors.map((err, i) => (
                      <div
                        key={i}
                        className="text-xs bg-red-500/5 border border-red-500/20 rounded px-2 py-1 font-mono"
                      >
                        <span className="text-red-500">{err.target_id.slice(0, 8)}...</span>{' '}
                        {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {result ? (
              <Button onClick={handleClose}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleClose} disabled={isExecuting}>
                  Cancel
                </Button>
                <Button
                  variant={confirmAction === 'delete' ? 'destructive' : 'default'}
                  onClick={handleConfirm}
                  disabled={isExecuting || isLoadingPreview || (preview?.valid_count === 0)}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Confirm ${confirmAction ? ACTION_META[confirmAction].label : ''}`
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
