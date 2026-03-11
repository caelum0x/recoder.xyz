'use client';

import React, { useState, useRef } from 'react';
import {
  Trash2,
  Clock,
  RefreshCw,
  Upload,
  Download,
  Edit2,
  Save,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Settings,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usePreferences,
  useSetPreference,
  useDeletePreference,
  useSyncPush,
  useSyncPull,
  useSyncLog,
} from '@/hooks/settings/use-user-preferences-sync';
import {
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  type PreferenceCategory,
  type UserPreference,
  type SetPreferencePayload,
} from '@/lib/api/user-preferences-sync';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('recoder_device_id');
  if (!id) {
    id = `web-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem('recoder_device_id', id);
  }
  return id;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

// ---------------------------------------------------------------------------
// Edit Preference Dialog
// ---------------------------------------------------------------------------

function EditPreferenceDialog({
  open,
  onOpenChange,
  preference,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preference: UserPreference | null;
}) {
  const setMutation = useSetPreference();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState<PreferenceCategory>('general');

  React.useEffect(() => {
    if (preference) {
      setKey(preference.preference_key);
      setValue(typeof preference.preference_value === 'string'
        ? preference.preference_value
        : JSON.stringify(preference.preference_value, null, 2));
      setCategory(preference.category);
    } else {
      setKey('');
      setValue('');
      setCategory('general');
    }
  }, [preference, open]);

  function handleSave() {
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    setMutation.mutate(
      { preference_key: key, preference_value: parsedValue, category },
      {
        onSuccess: () => {
          toast.success(`Preference "${key}" saved`);
          onOpenChange(false);
        },
        onError: () => toast.error('Failed to save preference'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{preference ? 'Edit Preference' : 'Add Preference'}</DialogTitle>
          <DialogDescription>
            {preference
              ? 'Update the preference value or category.'
              : 'Create a new preference key-value pair.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Key</label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. theme.mode"
              disabled={!!preference}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Value (JSON or plain text)</label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='e.g. "dark" or {"enabled": true}'
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as PreferenceCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!key.trim() || setMutation.isPending}>
            {setMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Preference Row
// ---------------------------------------------------------------------------

function PreferenceRow({
  pref,
  onEdit,
  onDelete,
}: {
  pref: UserPreference;
  onEdit: (pref: UserPreference) => void;
  onDelete: (key: string) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{pref.preference_key}</TableCell>
      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground" title={formatValue(pref.preference_value)}>
        {formatValue(pref.preference_value)}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {CATEGORY_LABELS[pref.category]}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(pref.updated_at)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(pref)}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(pref.preference_key)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PreferencesSyncPage() {
  const { data: preferences, isLoading, error } = usePreferences();
  const { data: syncLog, isLoading: logLoading } = useSyncLog();
  const syncPullQuery = useSyncPull();
  const syncPushMutation = useSyncPush();
  const deleteMutation = useDeletePreference();

  const [editOpen, setEditOpen] = useState(false);
  const [editPref, setEditPref] = useState<UserPreference | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group preferences by category
  const grouped = React.useMemo(() => {
    if (!preferences) return {};
    const map: Record<string, UserPreference[]> = {};
    for (const pref of preferences) {
      const cat = pref.category || 'general';
      if (!map[cat]) map[cat] = [];
      map[cat].push(pref);
    }
    return map;
  }, [preferences]);

  const filteredCategories =
    filterCategory === 'all'
      ? Object.keys(grouped).sort()
      : [filterCategory].filter((c) => grouped[c]);

  function handleEdit(pref: UserPreference) {
    setEditPref(pref);
    setEditOpen(true);
  }

  function handleAdd() {
    setEditPref(null);
    setEditOpen(true);
  }

  function handleDelete(key: string) {
    deleteMutation.mutate(key, {
      onSuccess: () => toast.success(`Preference "${key}" deleted`),
      onError: () => toast.error('Failed to delete preference'),
    });
  }

  function handleSyncNow() {
    if (!preferences || preferences.length === 0) {
      toast.error('No preferences to sync');
      return;
    }

    const payload: SetPreferencePayload[] = preferences.map((p) => ({
      preference_key: p.preference_key,
      preference_value: p.preference_value,
      category: p.category,
    }));

    syncPushMutation.mutate(
      { device_id: getDeviceId(), preferences: payload },
      {
        onSuccess: (res) => toast.success(`Synced ${res.synced} preferences`),
        onError: () => toast.error('Sync failed'),
      },
    );
  }

  function handleExport() {
    if (!preferences || preferences.length === 0) {
      toast.error('No preferences to export');
      return;
    }

    const exportData = preferences.map((p) => ({
      preference_key: p.preference_key,
      preference_value: p.preference_value,
      category: p.category,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preferences-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Preferences exported');
  }

  function handleImport() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!Array.isArray(data)) {
          toast.error('Invalid format: expected an array of preferences');
          return;
        }

        const payload: SetPreferencePayload[] = data.map((item: Record<string, unknown>) => ({
          preference_key: String(item.preference_key ?? ''),
          preference_value: item.preference_value ?? {},
          category: (item.category as PreferenceCategory) ?? 'general',
        })).filter((p: SetPreferencePayload) => p.preference_key);

        if (payload.length === 0) {
          toast.error('No valid preferences found in file');
          return;
        }

        syncPushMutation.mutate(
          { device_id: getDeviceId(), preferences: payload },
          {
            onSuccess: (res) => toast.success(`Imported ${res.synced} preferences`),
            onError: () => toast.error('Import failed'),
          },
        );
      } catch {
        toast.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-selected
    e.target.value = '';
  }

  // Find last sync info
  const lastSync = syncLog?.[0];

  return (
    <div className="space-y-6">
      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Preferences Sync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and sync your preferences across devices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button
            onClick={handleSyncNow}
            disabled={syncPushMutation.isPending || !preferences?.length}
          >
            {syncPushMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Now
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Failed to load preferences. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm">Sync Status</CardTitle>
          </div>
          <CardDescription>
            Current sync state and device information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Last Sync</p>
              <p className="text-sm font-medium">
                {lastSync ? formatDate(lastSync.synced_at) : 'Never'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Device ID</p>
              <p className="text-sm font-mono">{getDeviceId()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Preferences</p>
              <p className="text-sm font-medium">
                {isLoading ? <Skeleton className="h-4 w-8 inline-block" /> : preferences?.length ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Filter + Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Filter:</span>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {ALL_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleAdd}>
          + Add Preference
        </Button>
      </div>

      {/* Preferences by Category */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      ) : filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="py-8 text-center">
              <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No preferences found. Add your first preference to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        filteredCategories.map((cat) => (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" />
                {CATEGORY_LABELS[cat as PreferenceCategory] ?? cat}
              </CardTitle>
              <CardDescription>
                {grouped[cat]?.length ?? 0} preference{(grouped[cat]?.length ?? 0) !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped[cat]?.map((pref) => (
                    <PreferenceRow
                      key={pref.id}
                      pref={pref}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      {/* Sync Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Sync History
          </CardTitle>
          <CardDescription>
            Recent sync operations across your devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !syncLog || syncLog.length === 0 ? (
            <div className="py-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No sync operations have been performed yet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Preferences Synced</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-sm">{entry.device_id}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.sync_type === 'push'
                            ? 'default'
                            : entry.sync_type === 'pull'
                              ? 'secondary'
                              : 'outline'
                        }
                        className="text-xs"
                      >
                        {entry.sync_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{entry.preferences_synced}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(entry.synced_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditPreferenceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        preference={editPref}
      />
    </div>
  );
}
