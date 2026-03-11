'use client';

import { useState } from 'react';
import {
  Gauge,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Star,
  Users,
  Unlink,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRateTiers,
  useCreateRateTier,
  useUpdateRateTier,
  useDeleteRateTier,
  useAssignRateTier,
  useRemoveRateTier,
  useRateTierUsage,
} from '@/hooks/agents/use-rate-limit-tiers';
import type {
  RateLimitTier,
  RateTierUsage,
  CreateRateTierData,
} from '@/lib/api/rate-limit-tiers';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ============================================================================
// Tier Dialog
// ============================================================================

interface TierDialogProps {
  open: boolean;
  onClose: () => void;
  existing?: RateLimitTier | null;
}

function TierDialog({ open, onClose, existing }: TierDialogProps) {
  const createMutation = useCreateRateTier();
  const updateMutation = useUpdateRateTier();

  const [tierName, setTierName] = useState(existing?.tier_name ?? '');
  const [rpm, setRpm] = useState(String(existing?.requests_per_minute ?? 60));
  const [rph, setRph] = useState(String(existing?.requests_per_hour ?? 1000));
  const [rpd, setRpd] = useState(String(existing?.requests_per_day ?? 10000));
  const [burst, setBurst] = useState(String(existing?.burst_allowance ?? 10));
  const [isDefault, setIsDefault] = useState(existing?.is_default ?? false);

  const isEdit = !!existing;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (!tierName.trim()) return;
    const data: CreateRateTierData = {
      tier_name: tierName.trim(),
      requests_per_minute: parseInt(rpm, 10),
      requests_per_hour: parseInt(rph, 10),
      requests_per_day: parseInt(rpd, 10),
      burst_allowance: parseInt(burst, 10),
      is_default: isDefault,
    };

    if (isEdit) {
      updateMutation.mutate({ tierId: existing.id, data }, { onSuccess: onClose });
    } else {
      createMutation.mutate(data, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Rate Limit Tier' : 'New Rate Limit Tier'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tier_name">Tier Name *</Label>
            <Input
              id="tier_name"
              placeholder="e.g. Standard, Premium, Internal"
              value={tierName}
              onChange={(e) => setTierName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rpm">Requests / Minute</Label>
              <Input
                id="rpm"
                type="number"
                min={1}
                value={rpm}
                onChange={(e) => setRpm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rph">Requests / Hour</Label>
              <Input
                id="rph"
                type="number"
                min={1}
                value={rph}
                onChange={(e) => setRph(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rpd">Requests / Day</Label>
              <Input
                id="rpd"
                type="number"
                min={1}
                value={rpd}
                onChange={(e) => setRpd(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="burst">Burst Allowance</Label>
              <Input
                id="burst"
                type="number"
                min={0}
                value={burst}
                onChange={(e) => setBurst(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is_default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
            <Label htmlFor="is_default">Set as default tier</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !tierName.trim()}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Save Changes' : 'Create Tier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Tier Card
// ============================================================================

function TierCard({
  tier,
  agentCount,
  onEdit,
  onDelete,
}: {
  tier: RateLimitTier;
  agentCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={cn(tier.is_default && 'ring-2 ring-primary/30')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{tier.tier_name}</CardTitle>
            {tier.is_default && (
              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                <Star className="h-2.5 w-2.5 mr-1" />
                Default
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Per Minute</p>
            <p className="font-medium">{tier.requests_per_minute.toLocaleString()}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Per Hour</p>
            <p className="font-medium">{tier.requests_per_hour.toLocaleString()}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Per Day</p>
            <p className="font-medium">{tier.requests_per_day.toLocaleString()}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Burst</p>
            <p className="font-medium">+{tier.burst_allowance}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{agentCount} agent{agentCount !== 1 ? 's' : ''} assigned</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tier List Section
// ============================================================================

function TierListSection() {
  const { data: tiers, isLoading: tiersLoading } = useRateTiers();
  const { data: usage } = useRateTierUsage();
  const deleteMutation = useDeleteRateTier();
  const [editTarget, setEditTarget] = useState<RateLimitTier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RateLimitTier | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  const agentCountByTier = (tierId: string): number => {
    return usage?.find((u) => u.tier_id === tierId)?.agent_count ?? 0;
  };

  if (tiersLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-muted/40 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">Rate Limit Tiers</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4" />
          New Tier
        </Button>
      </div>

      {(!tiers || tiers.length === 0) ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Gauge className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No tiers configured</p>
            <p className="text-xs text-muted-foreground">
              Create a rate limit tier to control how many requests agents can make.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              agentCount={agentCountByTier(tier.id)}
              onEdit={() => setEditTarget(tier)}
              onDelete={() => setDeleteTarget(tier)}
            />
          ))}
        </div>
      )}

      <TierDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
      <TierDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        existing={editTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tier</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the <strong>{deleteTarget?.tier_name}</strong> tier? All agent assignments
              to this tier will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// Agent Assignments Section
// ============================================================================

function AgentAssignmentsSection() {
  const { data: usage, isLoading } = useRateTierUsage();
  const { data: tiers } = useRateTiers();
  const assignMutation = useAssignRateTier();
  const removeMutation = useRemoveRateTier();

  const [agentId, setAgentId] = useState('');
  const [selectedTierId, setSelectedTierId] = useState('');
  const [overrideRpm, setOverrideRpm] = useState('');
  const [overrideRph, setOverrideRph] = useState('');

  const handleAssign = () => {
    if (!agentId.trim() || !selectedTierId) return;
    assignMutation.mutate(
      {
        agentId: agentId.trim(),
        data: {
          tier_id: selectedTierId,
          override_rpm: overrideRpm ? parseInt(overrideRpm, 10) : null,
          override_rph: overrideRph ? parseInt(overrideRph, 10) : null,
        },
      },
      {
        onSuccess: () => {
          setAgentId('');
          setSelectedTierId('');
          setOverrideRpm('');
          setOverrideRph('');
        },
      }
    );
  };

  // Build assignment rows from usage data
  // Note: usage stats provide agent_count per tier but not per-agent details.
  // For the full table we rely on the usage endpoint which aggregates by tier.

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">Assign Tier to Agent</h2>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign_agent_id">Agent ID</Label>
              <Input
                id="assign_agent_id"
                placeholder="Enter agent ID"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tier</Label>
              <Select value={selectedTierId} onValueChange={setSelectedTierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tier..." />
                </SelectTrigger>
                <SelectContent>
                  {tiers?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.tier_name}
                      {t.is_default && ' (default)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="override_rpm">Override RPM (optional)</Label>
              <Input
                id="override_rpm"
                type="number"
                min={1}
                placeholder="Use tier default"
                value={overrideRpm}
                onChange={(e) => setOverrideRpm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="override_rph">Override RPH (optional)</Label>
              <Input
                id="override_rph"
                type="number"
                min={1}
                placeholder="Use tier default"
                value={overrideRph}
                onChange={(e) => setOverrideRph(e.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={handleAssign}
            disabled={!agentId.trim() || !selectedTierId || assignMutation.isPending}
            className="gap-1.5"
          >
            {assignMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link className="h-4 w-4" />
            )}
            Assign Tier
          </Button>
        </CardContent>
      </Card>

      {/* Usage Table by Tier */}
      <h2 className="text-sm font-medium text-muted-foreground">Usage by Tier</h2>
      {isLoading ? (
        <div className="h-24 bg-muted/40 rounded-lg animate-pulse" />
      ) : !usage || usage.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No tiers configured yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Agents</TableHead>
                <TableHead className="text-right">RPM</TableHead>
                <TableHead className="text-right">RPH</TableHead>
                <TableHead className="text-right">RPD</TableHead>
                <TableHead className="text-right">Burst</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.map((u) => (
                <TableRow key={u.tier_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.tier_name}</span>
                      {u.is_default && (
                        <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                          Default
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{u.agent_count}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{u.requests_per_minute.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{u.requests_per_hour.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{u.requests_per_day.toLocaleString()}</TableCell>
                  <TableCell className="text-right">+{u.burst_allowance}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function RateLimitTiersPage() {
  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 pt-16 sm:pt-20 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">API Rate Limit Tiers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define rate limit tiers and assign them to agents to control request throughput.
        </p>
      </div>

      <TierListSection />

      <AgentAssignmentsSection />
    </div>
  );
}
