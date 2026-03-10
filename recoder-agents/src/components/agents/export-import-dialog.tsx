'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  Upload,
  Package,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  useExportAgent,
  useImportAgent,
  useAgentBundles,
  useBundleDetail,
} from '@/hooks/agents/use-agent-bundles';
import type { AgentBundle } from '@/lib/api/agent-bundles';

// ============================================================================
// Section definitions
// ============================================================================

const SECTIONS = [
  { key: 'instructions', label: 'Instructions' },
  { key: 'tools', label: 'Tools' },
  { key: 'model', label: 'Model' },
  { key: 'env_vars', label: 'Env Vars' },
  { key: 'triggers', label: 'Triggers' },
  { key: 'kb_refs', label: 'KB References' },
] as const;

const BUNDLE_TYPES = [
  { value: 'full', label: 'Full' },
  { value: 'config_only', label: 'Config Only' },
  { value: 'template', label: 'Template' },
] as const;

// ============================================================================
// ExportAgentDialog
// ============================================================================

interface ExportAgentDialogProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportAgentDialog({
  agentId,
  agentName,
  open,
  onOpenChange,
}: ExportAgentDialogProps) {
  const exportAgent = useExportAgent();
  const [bundleName, setBundleName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [bundleType, setBundleType] = useState('full');
  const [selectedSections, setSelectedSections] = useState<string[]>(
    SECTIONS.map((s) => s.key)
  );
  const [isPublic, setIsPublic] = useState(false);
  const [createdBundleId, setCreatedBundleId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      const dateStr = new Date().toISOString().slice(0, 10);
      setBundleName(`${agentName} - ${dateStr}`);
      setVersion('1.0.0');
      setBundleType('full');
      setSelectedSections(SECTIONS.map((s) => s.key));
      setIsPublic(false);
      setCreatedBundleId(null);
      setCopied(false);
    }
  }, [open, agentName]);

  const toggleSection = (key: string) => {
    setSelectedSections((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const handleExport = () => {
    exportAgent.mutate(
      {
        agentId,
        data: {
          bundle_name: bundleName,
          bundle_type: bundleType,
          included_sections: selectedSections,
          is_public: isPublic,
        },
      },
      {
        onSuccess: (data) => {
          setCreatedBundleId(data.id);
          toast.success('Agent exported as bundle successfully');
        },
        onError: (err) => {
          toast.error(`Export failed: ${err.message}`);
        },
      }
    );
  };

  const handleCopyId = async () => {
    if (!createdBundleId) return;
    try {
      await navigator.clipboard.writeText(createdBundleId);
      setCopied(true);
      toast.success('Bundle ID copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Agent as Bundle
          </DialogTitle>
          <DialogDescription>
            Package your agent configuration for reuse or sharing.
          </DialogDescription>
        </DialogHeader>

        {createdBundleId ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="rounded-full bg-green-500/10 p-3">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium">Bundle created successfully!</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Bundle ID</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={createdBundleId}
                  readOnly
                  className="text-xs font-mono"
                />
                <Button variant="outline" size="icon" onClick={handleCopyId}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this ID so others can import your agent.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Bundle Name */}
            <div className="space-y-2">
              <Label htmlFor="bundle-name">Bundle Name</Label>
              <Input
                id="bundle-name"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="My Agent Bundle"
              />
            </div>

            {/* Version */}
            <div className="space-y-2">
              <Label htmlFor="bundle-version">Version</Label>
              <Input
                id="bundle-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>

            {/* Bundle Type */}
            <div className="space-y-2">
              <Label>Bundle Type</Label>
              <Select value={bundleType} onValueChange={setBundleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUNDLE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sections */}
            <div className="space-y-2">
              <Label>Included Sections</Label>
              <div className="grid grid-cols-2 gap-2">
                {SECTIONS.map((section) => (
                  <label
                    key={section.key}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSections.includes(section.key)}
                      onCheckedChange={() => toggleSection(section.key)}
                    />
                    {section.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Make Public</Label>
                <p className="text-xs text-muted-foreground">
                  Others can discover and import this bundle
                </p>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>

            <Button
              className="w-full"
              onClick={handleExport}
              disabled={
                exportAgent.isPending || !bundleName.trim() || selectedSections.length === 0
              }
            >
              {exportAgent.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Export Bundle
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ImportAgentDialog
// ============================================================================

interface ImportAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function BundlePreview({ bundle }: { bundle: AgentBundle }) {
  const sectionLabels: Record<string, string> = {
    instructions: 'Instructions',
    tools: 'Tools',
    model: 'Model',
    env_vars: 'Env Vars',
    triggers: 'Triggers',
    kb_refs: 'KB References',
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{bundle.bundle_name}</p>
        <Badge variant="outline" className="text-[10px]">
          v{bundle.bundle_version}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px]">
          {bundle.bundle_type}
        </Badge>
        {(bundle.included_sections || []).map((s) => (
          <Badge key={s} variant="outline" className="text-[10px]">
            {sectionLabels[s] || s}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {(bundle.file_size_bytes / 1024).toFixed(1)} KB
        {bundle.download_count > 0 && (
          <> &middot; {bundle.download_count} downloads</>
        )}
      </p>
    </div>
  );
}

export function ImportAgentDialog({ open, onOpenChange }: ImportAgentDialogProps) {
  const importAgent = useImportAgent();
  const { data: bundlesResponse, isLoading: loadingBundles } = useAgentBundles();
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [manualBundleId, setManualBundleId] = useState('');
  const [previewBundleId, setPreviewBundleId] = useState('');
  const { data: previewBundle, isLoading: loadingPreview } = useBundleDetail(
    previewBundleId
  );

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedBundleId(null);
      setManualBundleId('');
      setPreviewBundleId('');
    }
  }, [open]);

  const bundles = bundlesResponse?.bundles || [];

  const selectedBundle = selectedBundleId
    ? bundles.find((b) => b.id === selectedBundleId) || previewBundle || null
    : previewBundle || null;

  const handleImport = () => {
    const bundleId = selectedBundleId || previewBundleId;
    if (!bundleId) return;

    importAgent.mutate(
      { bundle_id: bundleId },
      {
        onSuccess: (data) => {
          toast.success(`Agent "${data.name}" imported successfully`);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(`Import failed: ${err.message}`);
        },
      }
    );
  };

  const handlePreview = () => {
    if (manualBundleId.trim()) {
      setPreviewBundleId(manualBundleId.trim());
      setSelectedBundleId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Agent from Bundle
          </DialogTitle>
          <DialogDescription>
            Create a new agent from a previously exported bundle.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="my-bundles" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="my-bundles">My Bundles</TabsTrigger>
            <TabsTrigger value="bundle-id">From Bundle ID</TabsTrigger>
          </TabsList>

          <TabsContent value="my-bundles" className="space-y-3 mt-3">
            {loadingBundles ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : bundles.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No bundles yet. Export an agent first.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {bundles.map((bundle) => (
                  <button
                    key={bundle.id}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      selectedBundleId === bundle.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/40'
                    }`}
                    onClick={() => {
                      setSelectedBundleId(bundle.id);
                      setPreviewBundleId('');
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">
                        {bundle.bundle_name}
                      </span>
                      <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                        {bundle.bundle_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      v{bundle.bundle_version} &middot;{' '}
                      {new Date(bundle.created_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="bundle-id" className="space-y-3 mt-3">
            <div className="space-y-2">
              <Label htmlFor="manual-bundle-id">Bundle ID</Label>
              <div className="flex gap-2">
                <Input
                  id="manual-bundle-id"
                  value={manualBundleId}
                  onChange={(e) => setManualBundleId(e.target.value)}
                  placeholder="Paste bundle ID here..."
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={!manualBundleId.trim() || loadingPreview}
                >
                  {loadingPreview ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Preview'
                  )}
                </Button>
              </div>
            </div>

            {previewBundle && <BundlePreview bundle={previewBundle} />}
          </TabsContent>
        </Tabs>

        {/* Selected bundle preview (from My Bundles tab) */}
        {selectedBundleId && selectedBundle && (
          <BundlePreview bundle={selectedBundle} />
        )}

        <Button
          className="w-full"
          onClick={handleImport}
          disabled={
            importAgent.isPending || (!selectedBundleId && !previewBundleId)
          }
        >
          {importAgent.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Import as New Agent
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
