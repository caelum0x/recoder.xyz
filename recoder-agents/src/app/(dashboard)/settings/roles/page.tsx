'use client';

import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Key,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useSeedRoles,
} from '@/hooks/agents/use-agent-permissions';
import type { AgentRole } from '@/lib/api/agent-permissions';
import { toast } from '@/lib/toast';

const ALL_PERMISSIONS = [
  'run', 'configure', 'delete', 'export', 'share',
  'view_logs', 'manage_triggers', 'manage_kb', 'manage_env',
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  run: 'Run Agent',
  configure: 'Configure Agent',
  delete: 'Delete Agent',
  export: 'Export Agent',
  share: 'Share Agent',
  view_logs: 'View Logs',
  manage_triggers: 'Manage Triggers',
  manage_kb: 'Manage Knowledge Base',
  manage_env: 'Manage Environment',
};

export default function RolesSettingsPage() {
  const { data: roles = [], isLoading } = useRoles();
  const createRoleMutation = useCreateRole();
  const updateRoleMutation = useUpdateRole();
  const deleteRoleMutation = useDeleteRole();
  const seedRolesMutation = useSeedRoles();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  const openCreate = () => {
    setFormName('');
    setFormDescription('');
    setFormPermissions([]);
    setEditingRole(null);
    setShowCreateDialog(true);
  };

  const openEdit = (role: AgentRole) => {
    setFormName(role.name);
    setFormDescription(role.description || '');
    setFormPermissions([...role.permissions]);
    setEditingRole(role);
    setShowCreateDialog(true);
  };

  const togglePermission = (perm: string) => {
    setFormPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    try {
      if (editingRole) {
        await updateRoleMutation.mutateAsync({
          roleId: editingRole.id,
          name: formName,
          description: formDescription || undefined,
          permissions: formPermissions,
        });
        toast.success('Role updated');
      } else {
        await createRoleMutation.mutateAsync({
          name: formName,
          description: formDescription || undefined,
          permissions: formPermissions,
        });
        toast.success('Role created');
      }
      setShowCreateDialog(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save role');
    }
  };

  const handleDelete = async (roleId: string) => {
    try {
      await deleteRoleMutation.mutateAsync(roleId);
      toast.success('Role deleted');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete role');
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await seedRolesMutation.mutateAsync();
      toast.success('Default roles seeded');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to seed roles');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage roles that control agent access and capabilities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeedDefaults}
            disabled={seedRolesMutation.isPending}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Seed Defaults
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Role
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-sm mb-2">No roles defined yet.</p>
            <p className="text-muted-foreground text-xs mb-4">
              Click &quot;Seed Defaults&quot; to create admin, operator, and viewer roles.
            </p>
            <Button size="sm" onClick={handleSeedDefaults} disabled={seedRolesMutation.isPending}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Seed Default Roles
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{role.name}</CardTitle>
                    {role.is_system && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Lock className="h-2.5 w-2.5 mr-1" />
                        System
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {!role.is_system && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(role)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(role.id)}
                        disabled={deleteRoleMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {role.description && (
                  <CardDescription className="mt-1">{role.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((perm) => (
                    <Badge key={perm} variant="outline" className="text-xs">
                      {PERMISSION_LABELS[perm] || perm}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'New Role'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. deployer"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What can this role do?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {ALL_PERMISSIONS.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2 hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formPermissions.includes(perm)}
                      onChange={() => togglePermission(perm)}
                      className="rounded border-border"
                    />
                    {PERMISSION_LABELS[perm] || perm}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !formName.trim() ||
                formPermissions.length === 0 ||
                createRoleMutation.isPending ||
                updateRoleMutation.isPending
              }
            >
              {editingRole ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
