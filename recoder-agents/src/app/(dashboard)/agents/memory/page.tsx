'use client';

import React, { useState, useCallback } from 'react';
import {
  Brain,
  Plus,
  Trash2,
  Pencil,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  FileText,
  List,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  useMemoryProfiles,
  useCreateMemoryProfile,
  useUpdateMemoryProfile,
  useDeleteMemoryProfile,
  useMemorySlots,
  useSetMemorySlot,
  useDeleteMemorySlot,
  useMemoryAccessLog,
} from '@/hooks/agents/use-agent-memory-profiles';
import type { MemoryProfile, MemorySlot, ValueType } from '@/lib/api/agent-memory-profiles';

// ============================================================================
// Helpers
// ============================================================================

const VALUE_TYPE_ICONS: Record<ValueType, React.ReactNode> = {
  text: <FileText className="h-3 w-3" />,
  number: <Hash className="h-3 w-3" />,
  json: <Database className="h-3 w-3" />,
  list: <List className="h-3 w-3" />,
};

const VALUE_TYPE_COLORS: Record<ValueType, string> = {
  text: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  number: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  json: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  list: 'bg-green-500/10 text-green-500 border-green-500/20',
};

const ACCESS_TYPE_COLORS = {
  read: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  write: 'bg-green-500/10 text-green-500 border-green-500/20',
  delete: 'bg-red-500/10 text-red-500 border-red-500/20',
};

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), 'MMM d, HH:mm');
  } catch {
    return iso;
  }
}

// ============================================================================
// Slot Sheet
// ============================================================================

function SlotSheet({
  profile,
  open,
  onClose,
}: {
  profile: MemoryProfile;
  open: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState('slots');
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [slotKey, setSlotKey] = useState('');
  const [slotValue, setSlotValue] = useState('');
  const [slotType, setSlotType] = useState<ValueType>('text');
  const [slotDesc, setSlotDesc] = useState('');

  const slotsQuery = useMemorySlots(profile.id);
  const logQuery = useMemoryAccessLog(profile.id, 100);
  const setSlotMutation = useSetMemorySlot(profile.id);
  const deleteSlotMutation = useDeleteMemorySlot(profile.id);

  const slots = slotsQuery.data ?? [];
  const log = logQuery.data ?? [];

  const handleSaveSlot = () => {
    if (!slotKey.trim() || !slotValue.trim()) return;
    setSlotMutation.mutate(
      { slot_key: slotKey.trim(), slot_value: slotValue.trim(), value_type: slotType, description: slotDesc || undefined },
      {
        onSuccess: () => {
          setSlotKey('');
          setSlotValue('');
          setSlotType('text');
          setSlotDesc('');
          setShowSlotForm(false);
        },
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            {profile.profile_name}
          </SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="slots">Slots</TabsTrigger>
            <TabsTrigger value="log">Access Log</TabsTrigger>
          </TabsList>

          {/* Slots Tab */}
          <TabsContent value="slots" className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
              <Button size="sm" className="gap-1.5" onClick={() => setShowSlotForm((v) => !v)}>
                <Plus className="h-3.5 w-3.5" />
                Set Slot
              </Button>
            </div>

            {/* Inline slot form */}
            {showSlotForm && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Key *</label>
                    <Input
                      placeholder="e.g. user_name"
                      value={slotKey}
                      onChange={(e) => setSlotKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                    <Select value={slotType} onValueChange={(v) => setSlotType(v as ValueType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">text</SelectItem>
                        <SelectItem value="number">number</SelectItem>
                        <SelectItem value="json">json</SelectItem>
                        <SelectItem value="list">list</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Value *</label>
                  <Textarea
                    placeholder="Slot value…"
                    value={slotValue}
                    onChange={(e) => setSlotValue(e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                  <Input
                    placeholder="Optional description…"
                    value={slotDesc}
                    onChange={(e) => setSlotDesc(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowSlotForm(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={handleSaveSlot}
                    disabled={!slotKey.trim() || !slotValue.trim() || setSlotMutation.isPending}
                  >
                    {setSlotMutation.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            )}

            {slotsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No slots yet. Use "Set Slot" to add memory.
              </div>
            ) : (
              <div className="space-y-1.5">
                {slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-semibold">{slot.slot_key}</span>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 py-0 gap-1', VALUE_TYPE_COLORS[slot.value_type])}
                        >
                          {VALUE_TYPE_ICONS[slot.value_type]}
                          {slot.value_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">
                        {slot.slot_value.length > 80 ? `${slot.slot_value.slice(0, 80)}…` : slot.slot_value}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {slot.access_count} access{slot.access_count !== 1 ? 'es' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtDate(slot.last_updated_at)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      disabled={deleteSlotMutation.isPending}
                      onClick={() => deleteSlotMutation.mutate(slot.slot_key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Access Log Tab */}
          <TabsContent value="log" className="space-y-1.5">
            {logQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : log.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No access log entries.</div>
            ) : (
              log.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-xs">
                  <span className="text-muted-foreground shrink-0 w-28">{fmtDate(entry.accessed_at)}</span>
                  <Badge
                    variant="outline"
                    className={cn('text-[10px] px-1.5 py-0 shrink-0', ACCESS_TYPE_COLORS[entry.access_type])}
                  >
                    {entry.access_type}
                  </Badge>
                  <span className="font-mono shrink-0">{entry.slot_key}</span>
                  {entry.access_type !== 'read' && (
                    <span className="text-muted-foreground truncate">
                      {entry.old_value !== null && (
                        <span className="line-through mr-1 opacity-60">
                          {entry.old_value?.slice(0, 20)}{entry.old_value && entry.old_value.length > 20 ? '…' : ''}
                        </span>
                      )}
                      {entry.new_value !== null && (
                        <span>
                          {entry.new_value?.slice(0, 30)}{entry.new_value && entry.new_value.length > 30 ? '…' : ''}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Profile Card
// ============================================================================

function ProfileCard({
  profile,
  agentId,
  onViewSlots,
}: {
  profile: MemoryProfile;
  agentId: string;
  onViewSlots: (p: MemoryProfile) => void;
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState(profile.profile_name);
  const [editActive, setEditActive] = useState(profile.is_active);

  const updateMutation = useUpdateMemoryProfile(agentId);
  const deleteMutation = useDeleteMemoryProfile(agentId);

  const handleUpdate = () => {
    updateMutation.mutate(
      { profileId: profile.id, data: { profile_name: editName, is_active: editActive } },
      { onSuccess: () => setShowEditDialog(false) }
    );
  };

  return (
    <>
      <SpotlightCard className="bg-card border border-border">
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm truncate">{profile.profile_name}</span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 shrink-0',
                profile.is_active
                  ? 'bg-green-500/10 text-green-500 border-green-500/20'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {profile.is_active ? (
                <><CheckCircle2 className="h-2.5 w-2.5 mr-1" />active</>
              ) : (
                <><XCircle className="h-2.5 w-2.5 mr-1" />inactive</>
              )}
            </Badge>
          </div>

          <div className="text-xs text-muted-foreground mb-3">
            {(profile as any).slot_count ?? 0} slot{((profile as any).slot_count ?? 0) !== 1 ? 's' : ''} · Created {fmtDate(profile.created_at)}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs gap-1.5"
              onClick={() => onViewSlots(profile)}
            >
              <Eye className="h-3 w-3" />
              View Slots
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditName(profile.profile_name);
                setEditActive(profile.is_active);
                setShowEditDialog(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(profile.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SpotlightCard>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Profile Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active-toggle"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="active-toggle" className="text-sm">Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button
              onClick={handleUpdate}
              disabled={!editName.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function AgentMemoryProfilesPage() {
  const [agentId, setAgentId] = useState('');
  const [submittedAgentId, setSubmittedAgentId] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<MemoryProfile | null>(null);

  const profilesQuery = useMemoryProfiles(submittedAgentId);
  const createMutation = useCreateMemoryProfile(submittedAgentId);

  const profiles = profilesQuery.data ?? [];

  const handleScopeAgent = useCallback(() => {
    setSubmittedAgentId(agentId.trim());
  }, [agentId]);

  const handleCreateProfile = () => {
    if (!newProfileName.trim()) return;
    createMutation.mutate(
      { profile_name: newProfileName.trim() },
      {
        onSuccess: () => {
          setNewProfileName('');
          setShowCreateDialog(false);
        },
      }
    );
  };

  return (
    <div className="flex-1 overflow-auto pb-8 px-4 md:px-6">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-lg font-semibold">Agent Memory Profiles</h1>
          <p className="text-sm text-muted-foreground">Persistent key-value memory slots scoped per agent profile</p>
        </div>
        {submittedAgentId && (
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4" />
            Create Profile
          </Button>
        )}
      </div>

      {/* Agent ID Scope */}
      <div className="flex gap-2 mb-6">
        <Input
          className="h-10 max-w-sm"
          placeholder="Enter Agent ID to scope view…"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScopeAgent()}
        />
        <Button className="h-10" onClick={handleScopeAgent} disabled={!agentId.trim()}>
          Load
        </Button>
        {submittedAgentId && (
          <Button
            variant="ghost"
            className="h-10 px-3 text-muted-foreground"
            onClick={() => {
              setAgentId('');
              setSubmittedAgentId('');
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Profiles Grid */}
      {!submittedAgentId ? (
        <SpotlightCard className="bg-card border border-border">
          <div className="p-12 text-center">
            <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h4 className="text-sm font-medium mb-1">Enter an Agent ID</h4>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Type an agent ID above and click Load to view or manage its memory profiles.
            </p>
          </div>
        </SpotlightCard>
      ) : profilesQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : profiles.length === 0 ? (
        <SpotlightCard className="bg-card border border-border">
          <div className="p-12 text-center">
            <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h4 className="text-sm font-medium mb-1">No memory profiles</h4>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto mb-4">
              Create a memory profile to start storing persistent key-value slots for this agent.
            </p>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Profile
            </Button>
          </div>
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              agentId={submittedAgentId}
              onViewSlots={setSelectedProfile}
            />
          ))}
        </div>
      )}

      {/* Create Profile Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Memory Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Profile Name *</label>
              <Input
                placeholder="e.g. default, user-context, session"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProfile()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateProfile}
              disabled={!newProfileName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot Sheet */}
      {selectedProfile && (
        <SlotSheet
          profile={selectedProfile}
          open={!!selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  );
}
