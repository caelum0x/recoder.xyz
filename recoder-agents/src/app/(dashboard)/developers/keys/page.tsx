'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Shield,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FlaskConical,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { TagInput } from '@/components/ui/tag-input';
import { Separator } from '@/components/ui/separator';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { apiKeysApi, type APIKeyResponse, type APIKeyCreateResponse } from '@/lib/api/api-keys';
import {
  useApiKeyPermissions,
  useUpdateApiKeyPermissions,
  useDeleteApiKeyPermissions,
  useTestApiKey,
} from '@/hooks/developers/use-api-key-permissions';

// ---------------------------------------------------------------------------
// Endpoint categories for checkbox selection
// ---------------------------------------------------------------------------

const ENDPOINT_CATEGORIES = [
  {
    name: 'Agents',
    endpoints: ['/agents/*', '/agents/{id}/analytics', '/agents/{id}/versions'],
  },
  {
    name: 'Threads',
    endpoints: ['/threads/*', '/threads/{id}/messages', '/threads/{id}/search'],
  },
  {
    name: 'Knowledge Base',
    endpoints: ['/knowledge-base/*', '/knowledge-base/search'],
  },
  {
    name: 'Workflows',
    endpoints: ['/workflows/*', '/workflows/{id}/execute'],
  },
  {
    name: 'Billing',
    endpoints: ['/billing/*', '/subscription/*'],
  },
  {
    name: 'System',
    endpoints: ['/health', '/metrics'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskKey(key: string) {
  if (key.length <= 8) return key;
  return `${key.slice(0, 6)}${'*'.repeat(Math.min(key.length - 10, 20))}${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Fetch keys
  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await apiKeysApi.list({ showErrors: false });
      if (res.error) throw new Error(res.error.message);
      return res.data!;
    },
    staleTime: 30_000,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.delete(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setDeleteKeyId(null);
      toast.success('API key deleted');
    },
    onError: () => toast.error('Failed to delete API key'),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { title: string; description?: string; expires_in_days?: number }) =>
      apiKeysApi.create(data),
    onSuccess: (res) => {
      if (res.data) {
        setCreatedKey(res.data);
        queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        toast.success('API key created');
      }
    },
    onError: () => toast.error('Failed to create API key'),
  });

  const handleCopyKey = useCallback((text: string, keyId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    });
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-[100dvh]">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold">API Keys</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg">
                Manage your API keys with fine-grained permissions, rate limits, IP restrictions, and expiration control.
              </p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Key
            </Button>
          </div>

          {/* Key list */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : !keys?.length ? (
            <SpotlightCard className="border border-border bg-card">
              <div className="p-12 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
                  <Key className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-medium">No API keys yet</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Create an API key to access the Recoder platform API programmatically.
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Create your first key
                </Button>
              </div>
            </SpotlightCard>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <KeyCard
                  key={key.key_id}
                  apiKey={key}
                  isExpanded={expandedKey === key.key_id}
                  onToggleExpand={() =>
                    setExpandedKey(expandedKey === key.key_id ? null : key.key_id)
                  }
                  onDelete={() => setDeleteKeyId(key.key_id)}
                  onCopy={(text) => handleCopyKey(text, key.key_id)}
                  isCopied={copiedKeyId === key.key_id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Create dialog */}
        <CreateKeyDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />

        {/* Created key reveal dialog */}
        {createdKey && (
          <CreatedKeyRevealDialog
            createdKey={createdKey}
            onClose={() => setCreatedKey(null)}
          />
        )}

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteKeyId} onOpenChange={(open) => !open && setDeleteKeyId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete API Key</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this API key and revoke all access. Any applications using this key will immediately lose access. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteKeyId && deleteMutation.mutate(deleteKeyId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Key Card (expandable)
// ---------------------------------------------------------------------------

function KeyCard({
  apiKey,
  isExpanded,
  onToggleExpand,
  onDelete,
  onCopy,
  isCopied,
}: {
  apiKey: APIKeyResponse;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onCopy: (text: string) => void;
  isCopied: boolean;
}) {
  const isExpired = apiKey.status === 'expired';
  const isRevoked = apiKey.status === 'revoked';
  const isActive = apiKey.status === 'active';

  return (
    <div className={cn(
      'rounded-xl border bg-card transition-colors',
      isExpired || isRevoked ? 'border-border/50 opacity-75' : 'border-border',
    )}>
      {/* Header row */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
        onClick={onToggleExpand}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{apiKey.title}</span>
            <StatusBadge status={apiKey.status} />
            {apiKey.expires_at && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(apiKey.expires_at).toLocaleDateString()}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Expires {new Date(apiKey.expires_at).toLocaleString()}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <code className="text-xs font-mono text-muted-foreground">
              {apiKey.public_key ? maskKey(apiKey.public_key) : '***'}
            </code>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Created {new Date(apiKey.created_at).toLocaleDateString()}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(apiKey.public_key);
                }}
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy key</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete key</TooltipContent>
          </Tooltip>
        </div>
      </button>

      {/* Expanded permissions panel */}
      {isExpanded && (
        <div className="border-t border-border">
          <PermissionsPanel keyId={apiKey.key_id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 text-[10px] px-1.5 py-0 h-4">
          Active
        </Badge>
      );
    case 'revoked':
      return (
        <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25 text-[10px] px-1.5 py-0 h-4">
          Revoked
        </Badge>
      );
    case 'expired':
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25 text-[10px] px-1.5 py-0 h-4">
          Expired
        </Badge>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Permissions Panel
// ---------------------------------------------------------------------------

function PermissionsPanel({ keyId }: { keyId: string }) {
  const { data: permissions, isLoading } = useApiKeyPermissions(keyId);
  const updateMutation = useUpdateApiKeyPermissions();
  const deleteMutation = useDeleteApiKeyPermissions();
  const testMutation = useTestApiKey();

  const [editMode, setEditMode] = useState(false);
  const [allowedEndpoints, setAllowedEndpoints] = useState<string[]>([]);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(60);
  const [rateLimitPerDay, setRateLimitPerDay] = useState(10000);
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  // Sync state when permissions load
  const syncFromPermissions = useCallback(() => {
    if (permissions) {
      setAllowedEndpoints(permissions.allowed_endpoints || []);
      setRateLimitPerMinute(permissions.rate_limit_per_minute);
      setRateLimitPerDay(permissions.rate_limit_per_day);
      setIpWhitelist(permissions.ip_whitelist || []);
      setExpiresAt(permissions.expires_at || '');
    }
  }, [permissions]);

  // Initialize edit form
  const startEdit = useCallback(() => {
    syncFromPermissions();
    setEditMode(true);
  }, [syncFromPermissions]);

  const handleSave = useCallback(() => {
    updateMutation.mutate(
      {
        keyId,
        data: {
          allowed_endpoints: allowedEndpoints,
          rate_limit_per_minute: rateLimitPerMinute,
          rate_limit_per_day: rateLimitPerDay,
          ip_whitelist: ipWhitelist,
          expires_at: expiresAt || null,
        },
      },
      {
        onSuccess: () => {
          setEditMode(false);
          toast.success('Permissions updated');
        },
        onError: () => toast.error('Failed to update permissions'),
      }
    );
  }, [keyId, allowedEndpoints, rateLimitPerMinute, rateLimitPerDay, ipWhitelist, expiresAt, updateMutation]);

  const handleResetDefaults = useCallback(() => {
    deleteMutation.mutate(keyId, {
      onSuccess: () => {
        setEditMode(false);
        toast.success('Permissions reset to defaults');
      },
      onError: () => toast.error('Failed to reset permissions'),
    });
  }, [keyId, deleteMutation]);

  const handleTest = useCallback(() => {
    testMutation.mutate(keyId, {
      onSuccess: (result) => setTestResult(result),
      onError: () => toast.error('Failed to test key'),
    });
  }, [keyId, testMutation]);

  const toggleEndpoint = useCallback(
    (endpoint: string) => {
      setAllowedEndpoints((prev) =>
        prev.includes(endpoint)
          ? prev.filter((e) => e !== endpoint)
          : [...prev, endpoint]
      );
    },
    []
  );

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  const hasCustom = permissions?.has_custom_permissions;

  return (
    <div className="p-4 space-y-5">
      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {!editMode ? (
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
              <Shield className="h-3.5 w-3.5" />
              {hasCustom ? 'Edit Permissions' : 'Set Custom Permissions'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleTest}
              disabled={testMutation.isPending}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              {testMutation.isPending ? 'Testing...' : 'Test Key'}
            </Button>
            {hasCustom && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={handleResetDefaults}
                disabled={deleteMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset to Defaults
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Permissions'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>

      {/* Current permissions summary (view mode) */}
      {!editMode && hasCustom && permissions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard
            label="Rate Limit (per minute)"
            value={`${permissions.rate_limit_per_minute} req/min`}
          />
          <InfoCard
            label="Rate Limit (per day)"
            value={`${permissions.rate_limit_per_day.toLocaleString()} req/day`}
          />
          <InfoCard
            label="Allowed Endpoints"
            value={
              permissions.allowed_endpoints.length
                ? `${permissions.allowed_endpoints.length} endpoint(s)`
                : 'All endpoints'
            }
          />
          <InfoCard
            label="IP Whitelist"
            value={
              permissions.ip_whitelist.length
                ? `${permissions.ip_whitelist.length} IP(s)`
                : 'Any IP'
            }
          />
          {permissions.expires_at && (
            <InfoCard
              label="Expires"
              value={new Date(permissions.expires_at).toLocaleString()}
            />
          )}
        </div>
      )}

      {!editMode && !hasCustom && (
        <p className="text-sm text-muted-foreground">
          Using default permissions: 60 req/min, 10,000 req/day, all endpoints, no IP restrictions.
        </p>
      )}

      {/* Edit mode */}
      {editMode && (
        <div className="space-y-6">
          {/* Endpoint access */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Allowed Endpoints</Label>
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to allow access to all endpoints.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ENDPOINT_CATEGORIES.map((category) => (
                <div key={category.name} className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {category.name}
                  </span>
                  <div className="space-y-1.5">
                    {category.endpoints.map((ep) => (
                      <label
                        key={ep}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox
                          checked={allowedEndpoints.includes(ep)}
                          onCheckedChange={() => toggleEndpoint(ep)}
                        />
                        <code className="text-xs font-mono text-foreground">{ep}</code>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Rate limits */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Rate Limits</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Per minute</span>
                  <span className="text-sm font-mono font-medium">{rateLimitPerMinute}</span>
                </div>
                <Slider
                  value={[rateLimitPerMinute]}
                  onValueChange={([v]) => setRateLimitPerMinute(v)}
                  min={1}
                  max={300}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1</span>
                  <span>300</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Per day</span>
                  <span className="text-sm font-mono font-medium">{rateLimitPerDay.toLocaleString()}</span>
                </div>
                <Slider
                  value={[rateLimitPerDay]}
                  onValueChange={([v]) => setRateLimitPerDay(v)}
                  min={100}
                  max={100000}
                  step={100}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>100</span>
                  <span>100,000</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* IP whitelist */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">IP Whitelist</Label>
            <p className="text-xs text-muted-foreground">
              Restrict API key usage to specific IP addresses. Leave empty to allow any IP.
            </p>
            <TagInput
              tags={ipWhitelist}
              onTagsChange={setIpWhitelist}
              placeholder="Enter IP address and press Enter..."
              maxTags={20}
            />
          </div>

          <Separator />

          {/* Expiration */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Expiration Date</Label>
            <p className="text-xs text-muted-foreground">
              Optionally set an expiration date for this key.
            </p>
            <Input
              type="datetime-local"
              value={expiresAt ? expiresAt.slice(0, 16) : ''}
              onChange={(e) =>
                setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : '')
              }
              className="max-w-xs"
            />
            {expiresAt && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground"
                onClick={() => setExpiresAt('')}
              >
                <X className="h-3 w-3" />
                Clear expiration
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Test Result</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setTestResult(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge
                  className={cn(
                    'text-[10px] px-1.5 py-0 h-4',
                    testResult.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25'
                      : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25'
                  )}
                >
                  {testResult.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Custom permissions:</span>
                <span>{testResult.has_custom_permissions ? 'Yes' : 'No (defaults)'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Rate limit:</span>
                <span>{testResult.rate_limit_per_minute} req/min, {testResult.rate_limit_per_day.toLocaleString()} req/day</span>
              </div>
              {testResult.allowed_endpoints.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Allowed endpoints:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {testResult.allowed_endpoints.map((ep: string) => (
                      <code key={ep} className="text-xs bg-background rounded px-1.5 py-0.5">
                        {ep}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {testResult.ip_whitelist.length > 0 && (
                <div>
                  <span className="text-muted-foreground">IP whitelist:</span>
                  <span className="ml-1">{testResult.ip_whitelist.join(', ')}</span>
                </div>
              )}
              {testResult.expires_at && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Expires:</span>
                  <span className={testResult.is_expired ? 'text-red-500' : ''}>
                    {new Date(testResult.expires_at).toLocaleString()}
                    {testResult.is_expired && ' (EXPIRED)'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info Card (small stat display)
// ---------------------------------------------------------------------------

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Key Dialog
// ---------------------------------------------------------------------------

function CreateKeyDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { title: string; description?: string; expires_in_days?: number }) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      expires_in_days: expiresInDays ? parseInt(expiresInDays) : undefined,
    });
    setTitle('');
    setDescription('');
    setExpiresInDays('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for programmatic access to the Recoder platform.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Production API Key"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-2">
            <Label>Expiration (days)</Label>
            <Input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="Leave empty for no expiration"
              min={1}
              max={365}
            />
            <p className="text-xs text-muted-foreground">
              You can set more granular permissions after creation.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || isLoading}>
            {isLoading ? 'Creating...' : 'Create Key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Created Key Reveal Dialog
// ---------------------------------------------------------------------------

function CreatedKeyRevealDialog({
  createdKey,
  onClose,
}: {
  createdKey: APIKeyCreateResponse;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(createdKey.secret_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-emerald-500" />
            API Key Created
          </DialogTitle>
          <DialogDescription>
            Copy your secret key now. You will not be able to see it again after closing this dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Make sure to copy your secret key now. For security, it cannot be displayed again.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Key Name</Label>
            <p className="text-sm font-medium">{createdKey.title}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Secret Key</Label>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <code className="text-xs font-mono text-foreground flex-1 break-all">
                {showSecret ? createdKey.secret_key : '***********************************'}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
