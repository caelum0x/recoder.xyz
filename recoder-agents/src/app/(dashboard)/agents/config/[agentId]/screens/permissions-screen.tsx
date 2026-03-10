'use client';

import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Unlock,
  UserCheck,
  Key,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
  useAgentRoles,
  useRoles,
  useAssignRole,
  useRemoveRoleAssignment,
  usePermissionAudit,
  useCreateRole,
} from '@/hooks/agents/use-agent-permissions';
import { toast } from '@/lib/toast';

const ALL_PERMISSIONS = [
  'run', 'configure', 'delete', 'export', 'share',
  'view_logs', 'manage_triggers', 'manage_kb', 'manage_env',
] as const;

interface PermissionsScreenProps {
  agentId: string;
}

export function PermissionsScreen({ agentId }: PermissionsScreenProps) {
  const { data: assignments = [], isLoading: assignmentsLoading } = useAgentRoles(agentId);
  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: auditLog = [], isLoading: auditLoading } = usePermissionAudit(agentId, { limit: 50 });
  const assignRoleMutation = useAssignRole();
  const removeAssignmentMutation = useRemoveRoleAssignment();
  const createRoleMutation = useCreateRole();

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState('');

  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPermissions, setQuickPermissions] = useState<string[]>([]);

  const handleAssignRole = async () => {
    if (!selectedRoleId) return;
    try {
      await assignRoleMutation.mutateAsync({
        agentId,
        role_id: selectedRoleId,
        expires_at: expiresAt || undefined,
      });
      toast.success('Role assigned successfully');
      setShowAssignDialog(false);
      setSelectedRoleId('');
      setExpiresAt('');
    } catch (error) {
      toast.error('Failed to assign role');
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await removeAssignmentMutation.mutateAsync({ agentId, assignmentId });
      toast.success('Role removed');
    } catch (error) {
      toast.error('Failed to remove role');
    }
  };

  const handleQuickCreate = async () => {
    if (!quickName.trim() || quickPermissions.length === 0) return;
    try {
      await createRoleMutation.mutateAsync({
        name: quickName,
        permissions: quickPermissions,
      });
      toast.success('Role created');
      setShowQuickCreate(false);
      setQuickName('');
      setQuickPermissions([]);
    } catch (error) {
      toast.error('Failed to create role');
    }
  };

  const toggleQuickPermission = (perm: string) => {
    setQuickPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  if (assignmentsLoading || rolesLoading) {
    return (
      <div className="flex-1 overflow-auto pb-6">
        <div className="px-1 pt-1 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto pb-6 w-full min-w-0">
      <div className="px-1 pt-1 space-y-6">
        {/* Assigned Roles */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-medium">Assigned Roles</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuickCreate(true)}
              >
                <Key className="h-3.5 w-3.5 mr-1.5" />
                New Role
              </Button>
              <Button size="sm" onClick={() => setShowAssignDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Assign Role
              </Button>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No roles assigned to this agent yet.</p>
              <p className="text-xs mt-1">Assign a role to control what this agent can do.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="rounded-lg border bg-card p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <UserCheck className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{assignment.role_name}</span>
                      {assignment.is_system && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          System
                        </Badge>
                      )}
                    </div>
                    {assignment.role_description && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {assignment.role_description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {assignment.permissions.map((perm) => (
                        <Badge
                          key={perm}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {perm}
                        </Badge>
                      ))}
                    </div>
                    {assignment.expires_at && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Expires: {new Date(assignment.expires_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveAssignment(assignment.id)}
                    disabled={removeAssignmentMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Permission Audit Log */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Unlock className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-medium">Permission Audit Log</h3>
          </div>

          {auditLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : auditLog.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
              <p className="text-sm">No permission audit entries yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Permission</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 text-xs">{entry.action}</td>
                      <td className="p-3">
                        {entry.permission_required ? (
                          <Badge variant="outline" className="text-[10px]">
                            {entry.permission_required}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        {entry.was_allowed ? (
                          <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Allowed
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            <XCircle className="h-3 w-3 mr-1" />
                            Denied
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Assign Role Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                      {role.is_system ? ' (System)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expires At (optional)</Label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignRole}
              disabled={!selectedRoleId || assignRoleMutation.isPending}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Role Dialog */}
      <Dialog open={showQuickCreate} onOpenChange={setShowQuickCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="e.g. deployer"
              />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_PERMISSIONS.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={quickPermissions.includes(perm)}
                      onChange={() => toggleQuickPermission(perm)}
                      className="rounded border-border"
                    />
                    {perm.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleQuickCreate}
              disabled={!quickName.trim() || quickPermissions.length === 0 || createRoleMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
