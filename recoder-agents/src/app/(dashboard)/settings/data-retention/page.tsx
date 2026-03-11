'use client';

import React, { useState } from 'react';
import {
  Trash2,
  Clock,
  Eye,
  Play,
  Info,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useRetentionPolicies,
  useSetRetentionPolicy,
  useDeleteRetentionPolicy,
  useRunCleanup,
  useCleanupLog,
  useCleanupPreview,
} from '@/hooks/settings/use-data-retention';
import {
  RESOURCE_TYPE_LABELS,
  RECOMMENDED_DEFAULTS,
  type ResourceType,
  type CleanupPreviewItem,
} from '@/lib/api/data-retention';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_RESOURCE_TYPES = Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

// ---------------------------------------------------------------------------
// Policy Row
// ---------------------------------------------------------------------------

function PolicyRow({
  resourceType,
  policy,
}: {
  resourceType: ResourceType;
  policy?: {
    id: string;
    retention_days: number;
    is_active: boolean;
    last_cleanup_at: string | null;
    items_cleaned: number;
  };
}) {
  const setMutation = useSetRetentionPolicy();
  const deleteMutation = useDeleteRetentionPolicy();
  const [days, setDays] = useState(
    policy?.retention_days ?? RECOMMENDED_DEFAULTS[resourceType],
  );

  const isActive = policy?.is_active ?? false;

  function handleToggle(checked: boolean) {
    setMutation.mutate(
      { resource_type: resourceType, retention_days: days, is_active: checked },
      {
        onSuccess: () => toast.success(`${RESOURCE_TYPE_LABELS[resourceType]} policy updated`),
        onError: () => toast.error('Failed to update policy'),
      },
    );
  }

  function handleDaysChange(value: string) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.max(7, Math.min(365, n));
    setDays(clamped);
  }

  function handleDaysBlur() {
    if (!policy && !isActive) return;
    setMutation.mutate(
      { resource_type: resourceType, retention_days: days, is_active: isActive },
      {
        onSuccess: () => toast.success(`Retention for ${RESOURCE_TYPE_LABELS[resourceType]} set to ${days} days`),
        onError: () => toast.error('Failed to update policy'),
      },
    );
  }

  function handleDelete() {
    if (!policy) return;
    deleteMutation.mutate(policy.id, {
      onSuccess: () => toast.success(`Policy for ${RESOURCE_TYPE_LABELS[resourceType]} removed`),
      onError: () => toast.error('Failed to delete policy'),
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {RESOURCE_TYPE_LABELS[resourceType]}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={7}
            max={365}
            className="w-20 h-8 text-sm"
            value={days}
            onChange={(e) => handleDaysChange(e.target.value)}
            onBlur={handleDaysBlur}
          />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
      </TableCell>
      <TableCell>
        <Switch
          checked={isActive}
          onCheckedChange={handleToggle}
          disabled={setMutation.isPending}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(policy?.last_cleanup_at)}
      </TableCell>
      <TableCell className="text-sm">
        {policy ? (
          <Badge variant="secondary">{policy.items_cleaned.toLocaleString()}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {policy && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Preview Dialog
// ---------------------------------------------------------------------------

function PreviewDialog({
  open,
  onOpenChange,
  preview,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: CleanupPreviewItem[];
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cleanup Preview</DialogTitle>
          <DialogDescription>
            Items that would be deleted based on your current active policies.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : preview.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No items to clean up. All data is within retention windows.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Retention</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((item) => (
                <TableRow key={item.resource_type}>
                  <TableCell className="font-medium">
                    {RESOURCE_TYPE_LABELS[item.resource_type]}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={item.items_to_delete > 0 ? 'destructive' : 'secondary'}>
                      {item.items_to_delete.toLocaleString()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {item.retention_days}d
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Cleanup Confirmation Dialog
// ---------------------------------------------------------------------------

function CleanupConfirmDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
  isRunning,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: CleanupPreviewItem[];
  onConfirm: () => void;
  isRunning: boolean;
}) {
  const totalItems = preview.reduce((s, p) => s + p.items_to_delete, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Cleanup</DialogTitle>
          <DialogDescription>
            This will process data cleanup based on your active retention policies.
            The following items will be affected:
          </DialogDescription>
        </DialogHeader>

        {preview.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No items to clean up.
          </p>
        ) : (
          <div className="space-y-2 py-2">
            {preview.filter((p) => p.items_to_delete > 0).map((item) => (
              <div key={item.resource_type} className="flex items-center justify-between text-sm">
                <span>{RESOURCE_TYPE_LABELS[item.resource_type]}</span>
                <Badge variant="destructive">{item.items_to_delete.toLocaleString()} items</Badge>
              </div>
            ))}
            <div className="pt-2 border-t flex items-center justify-between text-sm font-medium">
              <span>Total</span>
              <span>{totalItems.toLocaleString()} items</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isRunning || totalItems === 0}
          >
            {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run Cleanup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DataRetentionPage() {
  const { data: policies, isLoading, error } = useRetentionPolicies();
  const { data: cleanupLog, isLoading: logLoading } = useCleanupLog();
  const previewMutation = useCleanupPreview();
  const cleanupMutation = useRunCleanup();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewData, setPreviewData] = useState<CleanupPreviewItem[]>([]);

  function policyForType(resourceType: ResourceType) {
    return policies?.find((p) => p.resource_type === resourceType);
  }

  function handlePreview() {
    previewMutation.mutate(undefined, {
      onSuccess: (data) => {
        setPreviewData(data);
        setPreviewOpen(true);
      },
      onError: () => toast.error('Failed to generate preview'),
    });
  }

  function handleCleanupClick() {
    previewMutation.mutate(undefined, {
      onSuccess: (data) => {
        setPreviewData(data);
        setConfirmOpen(true);
      },
      onError: () => toast.error('Failed to generate preview'),
    });
  }

  function handleCleanupConfirm() {
    cleanupMutation.mutate(undefined, {
      onSuccess: (result) => {
        const total = result.results.reduce((s, r) => s + r.items_deleted, 0);
        toast.success(`Cleanup complete: ${total.toLocaleString()} items processed`);
        setConfirmOpen(false);
      },
      onError: () => toast.error('Cleanup failed'),
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Retention</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure how long data is kept before automatic cleanup.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            Preview Cleanup
          </Button>
          <Button
            variant="destructive"
            onClick={handleCleanupClick}
            disabled={previewMutation.isPending || cleanupMutation.isPending}
          >
            {cleanupMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run Cleanup Now
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Failed to load retention policies. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommended Defaults Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm">Recommended Defaults</CardTitle>
          </div>
          <CardDescription>
            Suggested retention periods based on data type and compliance best practices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALL_RESOURCE_TYPES.map((rt) => (
              <div key={rt} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-xs">
                  {RECOMMENDED_DEFAULTS[rt]}d
                </Badge>
                <span className="text-muted-foreground">{RESOURCE_TYPE_LABELS[rt]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Policies Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Retention Policies
          </CardTitle>
          <CardDescription>
            Set retention periods per resource type. Toggle active to enable automatic cleanup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last Cleanup</TableHead>
                  <TableHead>Total Cleaned</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_RESOURCE_TYPES.map((rt) => (
                  <PolicyRow
                    key={rt}
                    resourceType={rt}
                    policy={policyForType(rt)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cleanup Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Cleanup History
          </CardTitle>
          <CardDescription>
            Recent cleanup operations and their results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !cleanupLog || cleanupLog.length === 0 ? (
            <div className="py-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No cleanup operations have been run yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead className="text-right">Items Deleted</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cleanupLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {RESOURCE_TYPE_LABELS[entry.resource_type] ?? entry.resource_type}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={entry.items_deleted > 0 ? 'default' : 'secondary'}>
                        {entry.items_deleted.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {entry.cleanup_duration_ms != null
                        ? `${entry.cleanup_duration_ms}ms`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(entry.cleaned_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        preview={previewData}
        isLoading={previewMutation.isPending}
      />
      <CleanupConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        preview={previewData}
        onConfirm={handleCleanupConfirm}
        isRunning={cleanupMutation.isPending}
      />
    </div>
  );
}
