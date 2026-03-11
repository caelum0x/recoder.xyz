'use client';

import { useState, useMemo } from 'react';
import {
  Rocket,
  ArrowUp,
  RotateCcw,
  Server,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDeploymentSlots,
  useDeployToSlot,
  usePromoteSlot,
  useRollbackSlot,
  useUpdateTraffic,
  useDeploymentHistory,
} from '@/hooks/agents/use-agent-deployment';
import type { DeploymentSlot, DeploymentHistoryEntry } from '@/lib/api/agent-deployment';
import { toast } from '@/lib/toast';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ============================================================================
// Constants
// ============================================================================

const SLOT_CONFIG = {
  production: { label: 'Production', color: 'border-green-500/40 bg-green-500/5', badge: 'bg-green-500/10 text-green-600 dark:text-green-400', dot: 'bg-green-500' },
  staging: { label: 'Staging', color: 'border-blue-500/40 bg-blue-500/5', badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  canary: { label: 'Canary', color: 'border-amber-500/40 bg-amber-500/5', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  rollback: { label: 'Rollback', color: 'border-muted bg-muted/20', badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
} as const;

const ACTION_CONFIG = {
  deploy: { label: 'Deploy', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  promote: { label: 'Promote', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  rollback: { label: 'Rollback', color: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  deactivate: { label: 'Deactivate', color: 'bg-muted text-muted-foreground' },
} as const;

// ============================================================================
// Slot Card
// ============================================================================

function SlotCard({
  slot,
  agentId,
}: {
  slot: DeploymentSlot | undefined;
  agentId: string;
  slotName: 'production' | 'staging' | 'canary' | 'rollback';
}) {
  const updateTraffic = useUpdateTraffic();
  const slotName = slot?.slot_name ?? 'production';
  const config = SLOT_CONFIG[slotName as keyof typeof SLOT_CONFIG] ?? SLOT_CONFIG.production;

  const handleTrafficChange = (values: number[]) => {
    if (!slot) return;
    updateTraffic.mutate({
      agentId,
      slotName: slot.slot_name,
      trafficPercent: values[0],
    });
  };

  const configPreview = slot?.config_snapshot
    ? JSON.stringify(slot.config_snapshot).slice(0, 120)
    : 'No config';

  return (
    <Card className={cn('transition-all', config.color)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full', config.dot)} />
            {config.label}
          </CardTitle>
          <Badge className={cn('text-[10px]', slot?.is_active ? config.badge : 'bg-muted text-muted-foreground')}>
            {slot?.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {slot ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Traffic</span>
              <span className="font-medium">{slot.traffic_percent}%</span>
            </div>

            {slot.is_active && (
              <Slider
                defaultValue={[slot.traffic_percent]}
                max={100}
                step={1}
                onValueCommit={handleTrafficChange}
                className="w-full"
                disabled={updateTraffic.isPending}
              />
            )}

            <div className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(slot.deployed_at).toLocaleString()}
            </div>

            <div className="text-[10px] text-muted-foreground/70 font-mono break-all line-clamp-2 bg-muted/30 rounded p-1.5">
              {configPreview}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No deployment in this slot
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Traffic Bar
// ============================================================================

function TrafficBar({ slots }: { slots: DeploymentSlot[] }) {
  const activeSlots = slots.filter((s) => s.is_active && s.traffic_percent > 0);
  const totalTraffic = activeSlots.reduce((sum, s) => sum + s.traffic_percent, 0);

  if (activeSlots.length === 0) {
    return (
      <div className="w-full h-6 rounded-full bg-muted flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">No active traffic</span>
      </div>
    );
  }

  return (
    <div className="w-full h-6 rounded-full bg-muted overflow-hidden flex">
      {activeSlots.map((slot) => {
        const config = SLOT_CONFIG[slot.slot_name as keyof typeof SLOT_CONFIG];
        const widthPercent = totalTraffic > 0 ? (slot.traffic_percent / totalTraffic) * 100 : 0;
        return (
          <div
            key={slot.slot_name}
            className={cn('h-full flex items-center justify-center', config?.dot?.replace('bg-', 'bg-') || 'bg-muted')}
            style={{ width: `${widthPercent}%`, backgroundColor: undefined }}
          >
            <div
              className={cn('h-full flex items-center justify-center transition-all')}
              style={{
                width: '100%',
                background:
                  slot.slot_name === 'production' ? 'rgba(34,197,94,0.6)' :
                  slot.slot_name === 'staging' ? 'rgba(59,130,246,0.6)' :
                  slot.slot_name === 'canary' ? 'rgba(245,158,11,0.6)' :
                  'rgba(156,163,175,0.4)',
              }}
            >
              {widthPercent > 15 && (
                <span className="text-[10px] font-medium text-white truncate px-1">
                  {slot.slot_name} {slot.traffic_percent}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// History Timeline
// ============================================================================

function HistoryTimeline({ agentId }: { agentId: string }) {
  const { data: history, isLoading } = useDeploymentHistory(agentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No deployment history yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => {
        const actionConfig = ACTION_CONFIG[entry.action as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.deploy;
        return (
          <div key={entry.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0">
            <Badge className={cn('text-[10px] flex-shrink-0', actionConfig.color)}>
              {actionConfig.label}
            </Badge>
            <span className="text-muted-foreground flex-shrink-0 text-xs">
              {entry.slot_name}
            </span>
            <span className="text-xs text-muted-foreground flex-1 text-right">
              {new Date(entry.created_at).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export function DeploymentScreen({ agentId }: { agentId: string }) {
  const { data: slots, isLoading } = useDeploymentSlots(agentId);
  const deployMutation = useDeployToSlot();
  const promoteMutation = usePromoteSlot();
  const rollbackMutation = useRollbackSlot();

  const [confirmDialog, setConfirmDialog] = useState<'promote' | 'rollback' | null>(null);

  const slotMap = useMemo(() => {
    const map: Record<string, DeploymentSlot | undefined> = {};
    if (slots) {
      for (const slot of slots) {
        map[slot.slot_name] = slot;
      }
    }
    return map;
  }, [slots]);

  const handleDeployToStaging = () => {
    deployMutation.mutate(
      {
        agentId,
        data: {
          slot_name: 'staging',
          config_snapshot: { deployed_from: 'ui', timestamp: new Date().toISOString() },
          traffic_percent: 0,
        },
      },
      {
        onSuccess: () => toast.success('Deployed to staging'),
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handlePromote = () => {
    promoteMutation.mutate(
      { agentId },
      {
        onSuccess: () => {
          toast.success('Promoted staging to production');
          setConfirmDialog(null);
        },
        onError: (err) => {
          toast.error(err.message);
          setConfirmDialog(null);
        },
      }
    );
  };

  const handleRollback = () => {
    rollbackMutation.mutate(
      { agentId },
      {
        onSuccess: () => {
          toast.success('Rolled back production');
          setConfirmDialog(null);
        },
        onError: (err) => {
          toast.error(err.message);
          setConfirmDialog(null);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-1">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-1 space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleDeployToStaging}
          disabled={deployMutation.isPending}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          {deployMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          Deploy to Staging
        </Button>

        <Button
          onClick={() => setConfirmDialog('promote')}
          disabled={!slotMap.staging || promoteMutation.isPending}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          {promoteMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
          Promote to Production
        </Button>

        <Button
          onClick={() => setConfirmDialog('rollback')}
          disabled={!slotMap.rollback || rollbackMutation.isPending}
          size="sm"
          variant="outline"
          className="gap-2 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
        >
          {rollbackMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Rollback
        </Button>
      </div>

      {/* Traffic Bar */}
      {slots && slots.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Traffic Distribution</p>
          <TrafficBar slots={slots} />
        </div>
      )}

      {/* Slot Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['production', 'staging', 'canary', 'rollback'] as const).map((slotName) => (
          <SlotCard
            key={slotName}
            slot={slotMap[slotName]}
            agentId={agentId}
            slotName={slotName}
          />
        ))}
      </div>

      {/* Deployment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Deployment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryTimeline agentId={agentId} />
        </CardContent>
      </Card>

      {/* Confirm Promote Dialog */}
      <Dialog open={confirmDialog === 'promote'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote to Production</DialogTitle>
            <DialogDescription>
              This will copy the staging configuration to production and save the current production config as a rollback. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handlePromote} disabled={promoteMutation.isPending}>
              {promoteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowUp className="h-4 w-4 mr-2" />
              )}
              Promote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Rollback Dialog */}
      <Dialog open={confirmDialog === 'rollback'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback Production</DialogTitle>
            <DialogDescription>
              This will replace the current production configuration with the rollback config. This action cannot be undone. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRollback}
              disabled={rollbackMutation.isPending}
            >
              {rollbackMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
