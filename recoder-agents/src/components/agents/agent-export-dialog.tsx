'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Download,
  Copy,
  Check,
  Brain,
  Wrench,
  BookOpen,
  Clock,
  KeyRound,
  Gauge,
  FileJson,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExportAgentMutation, useDownloadAgentExport } from '@/hooks/agents/use-agent-import-export';
import type { AgentExportConfig } from '@/lib/api/agent-import-export';
import { toast } from '@/lib/toast';

interface AgentExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
}

export function AgentExportDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
}: AgentExportDialogProps) {
  const [includeKnowledge, setIncludeKnowledge] = useState(true);
  const [includeSchedules, setIncludeSchedules] = useState(true);
  const [includeQuota, setIncludeQuota] = useState(true);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<AgentExportConfig | null>(null);

  const exportMutation = useExportAgentMutation();
  const downloadMutation = useDownloadAgentExport();

  // Fetch preview when dialog opens
  useEffect(() => {
    if (open && agentId) {
      setPreview(null);
      exportMutation.mutate(
        { agentId, options: { includeKnowledge, includeSchedules, includeQuota } },
        {
          onSuccess: (data) => setPreview(data),
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentId]);

  // Re-fetch preview when options change
  useEffect(() => {
    if (open && agentId && preview) {
      exportMutation.mutate(
        { agentId, options: { includeKnowledge, includeSchedules, includeQuota } },
        {
          onSuccess: (data) => setPreview(data),
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeKnowledge, includeSchedules, includeQuota]);

  const handleDownload = useCallback(() => {
    downloadMutation.mutate(
      { agentId, agentName, options: { includeKnowledge, includeSchedules, includeQuota } },
      {
        onSuccess: () => {
          toast.success('Agent config downloaded');
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message || 'Failed to download');
        },
      }
    );
  }, [agentId, agentName, includeKnowledge, includeSchedules, includeQuota, downloadMutation, onOpenChange]);

  const handleCopyToClipboard = useCallback(() => {
    if (!preview) return;
    const jsonStr = JSON.stringify(preview, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopied(true);
      toast.success('Config copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [preview]);

  const toolCount = preview
    ? Object.keys(preview.tools.agentpress_tools || {}).length +
      (preview.tools.configured_mcps?.length || 0) +
      (preview.tools.custom_mcps?.length || 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-primary" />
            Export Agent
          </DialogTitle>
          <DialogDescription>
            Export &quot;{agentName}&quot; configuration as a JSON file. Secrets values are never included.
          </DialogDescription>
        </DialogHeader>

        {exportMutation.isPending && !preview ? (
          <div className="flex items-center justify-center py-8">
            <RecoderLoader size="medium" />
          </div>
        ) : preview ? (
          <div className="space-y-4 py-2">
            {/* Preview summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Export Preview</h4>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Brain className="h-3.5 w-3.5" />
                  <span>Instructions</span>
                </div>
                <span className="text-foreground truncate">
                  {preview.agent.system_prompt
                    ? `${preview.agent.system_prompt.slice(0, 60)}...`
                    : 'None'}
                </span>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Tools</span>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {toolCount} tool{toolCount !== 1 ? 's' : ''}
                </Badge>

                {includeKnowledge && (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Knowledge</span>
                    </div>
                    <Badge variant="secondary" className="w-fit">
                      {preview.knowledge_entries.length} entr{preview.knowledge_entries.length !== 1 ? 'ies' : 'y'}
                    </Badge>
                  </>
                )}

                {includeSchedules && (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Schedules</span>
                    </div>
                    <Badge variant="secondary" className="w-fit">
                      {preview.schedules.length} schedule{preview.schedules.length !== 1 ? 's' : ''}
                    </Badge>
                  </>
                )}

                <div className="flex items-center gap-2 text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Secret Keys</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {preview.secret_keys.length > 0 ? (
                    preview.secret_keys.map((key) => (
                      <Badge key={key} variant="outline" className="text-xs font-mono">
                        {key}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">None</span>
                  )}
                </div>

                {includeQuota && preview.quota_config && (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" />
                      <span>Quota</span>
                    </div>
                    <Badge variant="secondary" className="w-fit">
                      Included
                    </Badge>
                  </>
                )}
              </div>
            </div>

            {/* Export options */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Options</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={includeKnowledge}
                    onCheckedChange={(checked) => setIncludeKnowledge(!!checked)}
                  />
                  Include knowledge entry names
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={includeSchedules}
                    onCheckedChange={(checked) => setIncludeSchedules(!!checked)}
                  />
                  Include schedule configs
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={includeQuota}
                    onCheckedChange={(checked) => setIncludeQuota(!!checked)}
                  />
                  Include quota config
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Failed to load export preview.
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCopyToClipboard}
            disabled={!preview || downloadMutation.isPending}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy to Clipboard
              </>
            )}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!preview || downloadMutation.isPending}
            className="gap-1.5"
          >
            {downloadMutation.isPending ? (
              <>
                <RecoderLoader customSize={16} />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download .json
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
