'use client';

import React, { useState } from 'react';
import {
  Database,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Package,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/lib/toast';
import {
  useCacheStats,
  useInvalidateCacheEntry,
  useClearAgentCache,
  useCachePolicy,
  useSetCachePolicy,
  useCleanupCache,
} from '@/hooks/agents/use-agent-output-cache';

interface CacheScreenProps {
  agentId: string;
}

function formatTtlLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function CacheScreen({ agentId }: CacheScreenProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<number | null>(null);
  const [policyTtl, setPolicyTtl] = useState<number | null>(null);
  const [policyMaxEntries, setPolicyMaxEntries] = useState<number | null>(null);

  const { data: stats, isLoading: statsLoading } = useCacheStats(agentId);
  const { data: policy, isLoading: policyLoading } = useCachePolicy(agentId);

  const invalidateMutation = useInvalidateCacheEntry(agentId);
  const clearMutation = useClearAgentCache(agentId);
  const setPolicyMutation = useSetCachePolicy(agentId);
  const cleanupMutation = useCleanupCache();

  // Sync local slider values from loaded policy
  const effectiveTtl = policyTtl ?? policy?.default_ttl_seconds ?? 3600;
  const effectiveMaxEntries = policyMaxEntries ?? policy?.max_entries ?? 100;
  const isEnabled = policy?.is_enabled ?? true;
  const cacheSimilarInputs = policy?.cache_similar_inputs ?? false;

  const handleClearAll = async () => {
    try {
      const result = await clearMutation.mutateAsync();
      toast.success(`Cleared ${result.deleted_count} cache entries`);
      setConfirmClear(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to clear cache');
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await cleanupMutation.mutateAsync();
      setCleanupResult(result.deleted_count);
      toast.success(`Cleaned up ${result.deleted_count} expired entries`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to cleanup cache');
    }
  };

  const handleSavePolicy = async () => {
    if (!policy) return;
    try {
      await setPolicyMutation.mutateAsync({
        is_enabled: policy.is_enabled,
        default_ttl_seconds: effectiveTtl,
        max_entries: effectiveMaxEntries,
        cache_similar_inputs: cacheSimilarInputs,
        similarity_threshold: policy.similarity_threshold ?? 0.9,
      });
      toast.success('Cache policy saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save policy');
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    try {
      await setPolicyMutation.mutateAsync({
        is_enabled: enabled,
        default_ttl_seconds: effectiveTtl,
        max_entries: effectiveMaxEntries,
        cache_similar_inputs: cacheSimilarInputs,
        similarity_threshold: policy?.similarity_threshold ?? 0.9,
      });
      toast.success(enabled ? 'Cache enabled' : 'Cache disabled');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update cache policy');
    }
  };

  const handleToggleSimilar = async (enabled: boolean) => {
    try {
      await setPolicyMutation.mutateAsync({
        is_enabled: isEnabled,
        default_ttl_seconds: effectiveTtl,
        max_entries: effectiveMaxEntries,
        cache_similar_inputs: enabled,
        similarity_threshold: policy?.similarity_threshold ?? 0.9,
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update cache policy');
    }
  };

  if (statsLoading || policyLoading) {
    return (
      <div className="flex-1 overflow-y-auto pb-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Output Cache</h2>
          <p className="text-sm text-muted-foreground">
            Cache agent outputs to reduce latency and token usage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanup}
            disabled={cleanupMutation.isPending}
            className="gap-1.5"
          >
            {cleanupMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Cleanup Expired
            {cleanupResult !== null && (
              <Badge variant="secondary" className="text-[10px]">
                {cleanupResult} removed
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmClear(true)}
            disabled={clearMutation.isPending || (stats?.total_entries ?? 0) === 0}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Entries</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.total_entries ?? 0}</p>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Hits</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.total_hits ?? 0}</p>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Hit Rate</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.hit_rate_pct ?? 0}%</p>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">Expired</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.expired_count ?? 0}</p>
        </SpotlightCard>
      </div>

      {/* Cache Policy */}
      <SpotlightCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Cache Policy</h3>
            <p className="text-xs text-muted-foreground">
              Configure caching behavior for this agent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={setPolicyMutation.isPending}
            />
          </div>
        </div>

        <div className="space-y-5">
          {/* TTL Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Default TTL</Label>
              <span className="text-xs font-medium text-muted-foreground">
                {formatTtlLabel(effectiveTtl)}
              </span>
            </div>
            <Slider
              min={60}
              max={86400}
              step={60}
              value={[effectiveTtl]}
              onValueChange={([v]) => setPolicyTtl(v)}
              disabled={!isEnabled}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>1m</span>
              <span>1h</span>
              <span>12h</span>
              <span>24h</span>
            </div>
          </div>

          {/* Max Entries */}
          <div>
            <Label htmlFor="max-entries" className="text-xs mb-1 block">
              Max Entries
            </Label>
            <Input
              id="max-entries"
              type="number"
              value={effectiveMaxEntries}
              onChange={(e) => setPolicyMaxEntries(Number(e.target.value) || 100)}
              min={1}
              max={10000}
              disabled={!isEnabled}
              className="w-32 h-8 text-sm"
            />
          </div>

          {/* Cache Similar Inputs Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Cache Similar Inputs</p>
              <p className="text-xs text-muted-foreground">
                Return cached results for semantically similar inputs
              </p>
            </div>
            <Switch
              checked={cacheSimilarInputs}
              onCheckedChange={handleToggleSimilar}
              disabled={!isEnabled || setPolicyMutation.isPending}
            />
          </div>

          {cacheSimilarInputs && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Similarity Threshold</Label>
                <span className="text-xs font-medium text-muted-foreground">
                  {((policy?.similarity_threshold ?? 0.9) * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[(policy?.similarity_threshold ?? 0.9) * 100]}
                onValueChange={async ([v]) => {
                  try {
                    await setPolicyMutation.mutateAsync({
                      is_enabled: isEnabled,
                      default_ttl_seconds: effectiveTtl,
                      max_entries: effectiveMaxEntries,
                      cache_similar_inputs: cacheSimilarInputs,
                      similarity_threshold: v / 100,
                    });
                  } catch {
                    /* handled below */
                  }
                }}
                disabled={!isEnabled}
                className="w-full"
              />
            </div>
          )}

          <Button
            size="sm"
            onClick={handleSavePolicy}
            disabled={setPolicyMutation.isPending || !isEnabled}
            className="gap-1.5"
          >
            {setPolicyMutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Save Policy
          </Button>
        </div>
      </SpotlightCard>

      {/* Empty State */}
      {(stats?.total_entries ?? 0) === 0 && (
        <div className="text-center py-16">
          <Database className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No cache entries yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cache entries will appear here once the agent starts caching outputs
          </p>
        </div>
      )}

      {/* Clear All Confirmation */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Cache</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {stats?.total_entries ?? 0} cache entries
              for this agent. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
