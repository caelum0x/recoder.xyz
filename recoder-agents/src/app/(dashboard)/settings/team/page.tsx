'use client';

import React, { useState, useMemo } from 'react';
import {
  useTeams,
  useTeamDetail,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
} from '@/hooks/platform/use-teams';
import type { Team, TeamMember } from '@/lib/api/teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Users,
  Plus,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  Eye,
  UserMinus,
  Crown,
  Pencil,
  Trash2,
  LogOut,
  Mail,
  Clock,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  owner: { label: 'Owner', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', icon: Crown },
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: ShieldCheck },
  member: { label: 'Member', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300', icon: Users },
  viewer: { label: 'Viewer', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400', icon: Eye },
};

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.member;
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={`${config.color} gap-1 font-medium`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Create Team Dialog ────────────────────────────────────────────────────────

function CreateTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createTeam = useCreateTeam();

  const handleCreate = () => {
    if (!name.trim()) return;
    createTeam.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Team created successfully');
          onOpenChange(false);
          setName('');
          setDescription('');
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a New Team</DialogTitle>
          <DialogDescription>
            Teams let you collaborate with others and share agents, threads, and resources.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              placeholder="e.g. Engineering"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-desc">Description (optional)</Label>
            <Input
              id="team-desc"
              placeholder="What does this team work on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createTeam.isPending}
          >
            {createTeam.isPending ? 'Creating...' : 'Create Team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite Member Dialog ──────────────────────────────────────────────────────

function InviteMemberDialog({
  open,
  onOpenChange,
  teamId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const inviteMember = useInviteMember();

  const handleInvite = () => {
    if (!email.trim()) return;
    inviteMember.mutate(
      { teamId, email: email.trim(), role },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${email}`);
          onOpenChange(false);
          setEmail('');
          setRole('member');
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join this team. They will appear as pending until they accept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin - Can manage members and settings</SelectItem>
                <SelectItem value="member">Member - Can create and edit resources</SelectItem>
                <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleInvite}
            disabled={!email.trim() || inviteMember.isPending}
          >
            {inviteMember.isPending ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Team Detail Section ───────────────────────────────────────────────────────

function TeamDetailSection({ team }: { team: Team }) {
  const { data: detail, isLoading } = useTeamDetail(team.id);
  const [showInvite, setShowInvite] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDescription, setEditDescription] = useState(team.description || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const removeMember = useRemoveMember();
  const updateRole = useUpdateMemberRole();

  const isOwner = detail?.my_role === 'owner';
  const isAdmin = detail?.my_role === 'admin' || isOwner;

  const acceptedMembers = useMemo(
    () => detail?.members?.filter((m) => m.accepted_at) || [],
    [detail]
  );
  const pendingMembers = useMemo(
    () => detail?.members?.filter((m) => !m.accepted_at) || [],
    [detail]
  );

  const handleSaveTeam = () => {
    updateTeam.mutate(
      { teamId: team.id, name: editName.trim(), description: editDescription.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Team updated');
          setEditingTeam(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleDeleteTeam = () => {
    deleteTeam.mutate(team.id, {
      onSuccess: () => {
        toast.success('Team deleted');
        setShowDeleteConfirm(false);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleRemoveMember = (member: TeamMember) => {
    removeMember.mutate(
      { teamId: team.id, userId: member.user_id },
      {
        onSuccess: () => {
          toast.success('Member removed');
          setMemberToRemove(null);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleRoleChange = (member: TeamMember, newRole: string) => {
    updateRole.mutate(
      { teamId: team.id, userId: member.user_id, role: newRole },
      {
        onSuccess: () => toast.success(`Role updated to ${newRole}`),
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleLeaveTeam = () => {
    // Self-remove: use the current user's membership
    // The backend will handle this via the remove member endpoint
    // We need to find the current user in the members list
    const currentMember = detail?.members?.find(
      (m) => m.role === detail.my_role && m.accepted_at
    );
    if (!currentMember) return;
    removeMember.mutate(
      { teamId: team.id, userId: currentMember.user_id },
      {
        onSuccess: () => {
          toast.success('You left the team');
          setShowLeaveConfirm(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Team Info Card */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {editingTeam ? (
              <div className="space-y-3 max-w-md">
                <div className="space-y-1.5">
                  <Label>Team Name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTeam()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveTeam} disabled={updateTeam.isPending}>
                    {updateTeam.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingTeam(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-xl font-semibold">{detail?.name || team.name}</h3>
                  <RoleBadge role={detail?.my_role || team.my_role} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {detail?.description || team.description || 'No description'}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Created {formatDate(detail?.created_at || team.created_at)}
                </p>
              </>
            )}
          </div>
          {isOwner && !editingTeam && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditName(detail?.name || team.name);
                setEditDescription(detail?.description || team.description || '');
                setEditingTeam(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>

      {/* Members Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold">Members</h4>
            <p className="text-sm text-muted-foreground">
              {acceptedMembers.length} member{acceptedMembers.length !== 1 ? 's' : ''}
              {pendingMembers.length > 0 && `, ${pendingMembers.length} pending`}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Invite Member
            </Button>
          )}
        </div>

        {/* Accepted Members Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Member
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                  Joined
                </th>
                {isAdmin && (
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-12">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {acceptedMembers.map((member) => (
                <tr key={member.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {(member.email || member.user_id)
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {member.email || `User ${member.user_id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {member.user_id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={member.role} />
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(member.accepted_at)}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {member.role !== 'owner' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleRoleChange(member, 'admin')}>
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              Make Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRoleChange(member, 'member')}>
                              <Users className="h-4 w-4 mr-2" />
                              Make Member
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRoleChange(member, 'viewer')}>
                              <Eye className="h-4 w-4 mr-2" />
                              Make Viewer
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setMemberToRemove(member)}
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {acceptedMembers.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pending Invitations */}
        {pendingMembers.length > 0 && (
          <div className="mt-6">
            <h5 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Pending Invitations
            </h5>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <tbody>
                  {pendingMembers.map((member) => (
                    <tr key={member.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted/60 flex items-center justify-center">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">
                              {member.email || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Invited {formatDate(member.invited_at)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={member.role} />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setMemberToRemove(member)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* Danger Zone */}
      <Card className="p-6 border-destructive/30">
        <h4 className="text-lg font-semibold text-destructive mb-1">Danger Zone</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Irreversible actions for this team.
        </p>
        <div className="flex flex-wrap gap-3">
          {!isOwner && (
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => setShowLeaveConfirm(true)}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Leave Team
            </Button>
          )}
          {isOwner && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Team
            </Button>
          )}
        </div>
      </Card>

      {/* Invite Dialog */}
      <InviteMemberDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        teamId={team.id}
      />

      {/* Remove Member Confirm */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>{memberToRemove?.email || 'this member'}</strong> from the team? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => memberToRemove && handleRemoveMember(memberToRemove)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Team Confirm */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this team? You will lose access to all shared
              resources. You will need a new invitation to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleLeaveTeam}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Team Confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the team and remove all members. All shared
              resources will become inaccessible. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteTeam}
            >
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { data: teams, isLoading } = useTeams();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  // Auto-select first team when loaded
  React.useEffect(() => {
    if (teams?.length && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId]);

  // If active team was deleted, reset
  React.useEffect(() => {
    if (teams && activeTeamId && !teams.find((t) => t.id === activeTeamId)) {
      setActiveTeamId(teams.length > 0 ? teams[0].id : null);
    }
  }, [teams, activeTeamId]);

  const activeTeam = useMemo(
    () => teams?.find((t) => t.id === activeTeamId) || null,
    [teams, activeTeamId]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Empty state: no teams yet
  if (!teams || teams.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Team Management</h2>
            <p className="text-muted-foreground">
              Create and manage your teams.
            </p>
          </div>
        </div>

        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Create a team to collaborate with others. Share agents, threads, and resources
            with your teammates.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Team
          </Button>
        </Card>

        <CreateTeamDialog open={showCreate} onOpenChange={setShowCreate} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team Management</h2>
          <p className="text-muted-foreground">
            Manage your teams, members, and permissions.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Team
        </Button>
      </div>

      {/* Team Selector (if multiple teams) */}
      {teams.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {teams.map((t) => (
            <Button
              key={t.id}
              variant={t.id === activeTeamId ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTeamId(t.id)}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              {t.name}
              <Badge variant="secondary" className="ml-1 text-xs">
                {t.member_count}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      {/* Active Team Detail */}
      {activeTeam && <TeamDetailSection team={activeTeam} />}

      {/* Create Dialog */}
      <CreateTeamDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
