'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileJson,
  AlertTriangle,
  Brain,
  Wrench,
  BookOpen,
  Clock,
  KeyRound,
  Gauge,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useImportAgent } from '@/hooks/agents/use-agent-import-export';
import type { AgentExportConfig } from '@/lib/api/agent-import-export';
import { toast } from '@/lib/toast';
import { useRouter } from 'next/navigation';

interface AgentImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentImportDialog({
  open,
  onOpenChange,
}: AgentImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedConfig, setParsedConfig] = useState<AgentExportConfig | null>(null);
  const [rawJson, setRawJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState('');
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [isDragOver, setIsDragOver] = useState(false);

  const importMutation = useImportAgent();

  const resetState = useCallback(() => {
    setParsedConfig(null);
    setRawJson('');
    setParseError(null);
    setNameOverride('');
    setMode('upload');
    setIsDragOver(false);
  }, []);

  const parseConfigJson = useCallback((text: string) => {
    try {
      const json = JSON.parse(text);

      // Validate basic structure
      if (!json.agent || typeof json.agent !== 'object') {
        setParseError('Invalid config: missing "agent" object');
        setParsedConfig(null);
        return;
      }

      if (!json.agent.name) {
        setParseError('Invalid config: agent name is required');
        setParsedConfig(null);
        return;
      }

      setParsedConfig(json as AgentExportConfig);
      setNameOverride(json.agent.name);
      setParseError(null);
    } catch {
      setParseError('Invalid JSON format');
      setParsedConfig(null);
    }
  }, []);

  const handleFileUpload = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.json')) {
        setParseError('Please upload a .json file');
        return;
      }
      file.text().then((text) => {
        setRawJson(text);
        parseConfigJson(text);
      });
    },
    [parseConfigJson]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handlePasteChange = useCallback(
    (text: string) => {
      setRawJson(text);
      if (text.trim()) {
        parseConfigJson(text);
      } else {
        setParsedConfig(null);
        setParseError(null);
      }
    },
    [parseConfigJson]
  );

  const handleImport = useCallback(() => {
    if (!parsedConfig) return;

    const config = JSON.parse(rawJson || JSON.stringify(parsedConfig));
    const finalName = nameOverride.trim() || parsedConfig.agent.name;

    importMutation.mutate(
      { config, nameOverride: finalName !== parsedConfig.agent.name ? finalName : undefined },
      {
        onSuccess: (result) => {
          toast.success(`Agent "${result.name}" imported successfully`);
          onOpenChange(false);
          resetState();
          // Navigate to the new agent's config page
          router.push(`/agents/config/${result.agent_id}`);
        },
        onError: (err) => {
          toast.error(err.message || 'Failed to import agent');
        },
      }
    );
  }, [parsedConfig, rawJson, nameOverride, importMutation, onOpenChange, resetState, router]);

  const toolCount = parsedConfig
    ? Object.keys(parsedConfig.tools?.agentpress_tools || {}).length +
      (parsedConfig.tools?.configured_mcps?.length || 0) +
      (parsedConfig.tools?.custom_mcps?.length || 0)
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val);
        if (!val) resetState();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Agent
          </DialogTitle>
          <DialogDescription>
            Import an agent from a previously exported JSON configuration file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!parsedConfig ? (
            <>
              {/* Mode tabs */}
              <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                <button
                  onClick={() => setMode('upload')}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === 'upload'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Upload File
                </button>
                <button
                  onClick={() => setMode('paste')}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === 'paste'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Paste JSON
                </button>
              </div>

              {mode === 'upload' ? (
                <div
                  className={cn(
                    'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileJson className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    Drop a .json file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Agent configuration files only
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              ) : (
                <textarea
                  value={rawJson}
                  onChange={(e) => handlePasteChange(e.target.value)}
                  placeholder='Paste agent JSON config here...\n{\n  "export_version": "1.0",\n  "agent": { "name": "..." },\n  ...\n}'
                  rows={8}
                  className={cn(
                    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none',
                    'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring'
                  )}
                />
              )}

              {parseError && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {parseError}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Parsed config preview */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <h4 className="text-sm font-semibold text-foreground">Config Parsed Successfully</h4>
                </div>

                {/* Editable name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Agent Name</label>
                  <input
                    type="text"
                    value={nameOverride}
                    onChange={(e) => setNameOverride(e.target.value)}
                    className={cn(
                      'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
                      'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring'
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Brain className="h-3.5 w-3.5" />
                    <span>Instructions</span>
                  </div>
                  <span className="text-foreground truncate">
                    {parsedConfig.agent.system_prompt
                      ? `${parsedConfig.agent.system_prompt.slice(0, 50)}...`
                      : 'None'}
                  </span>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Tools</span>
                  </div>
                  <Badge variant="secondary" className="w-fit">
                    {toolCount} tool{toolCount !== 1 ? 's' : ''}
                  </Badge>

                  {parsedConfig.knowledge_entries?.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Knowledge Refs</span>
                      </div>
                      <Badge variant="secondary" className="w-fit">
                        {parsedConfig.knowledge_entries.length}
                      </Badge>
                    </>
                  )}

                  {parsedConfig.schedules?.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Schedules</span>
                      </div>
                      <Badge variant="secondary" className="w-fit">
                        {parsedConfig.schedules.length}
                      </Badge>
                    </>
                  )}

                  {parsedConfig.quota_config && (
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

              {/* Warnings */}
              {parsedConfig.secret_keys?.length > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                  <KeyRound className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Secrets not imported</p>
                    <p className="text-xs mt-0.5 opacity-80">
                      This agent uses {parsedConfig.secret_keys.length} secret{parsedConfig.secret_keys.length !== 1 ? 's' : ''} (
                      {parsedConfig.secret_keys.join(', ')}). You will need to add them manually after import.
                    </p>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={resetState}
                className="text-xs"
              >
                Choose a different file
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsedConfig || !nameOverride.trim() || importMutation.isPending}
            className="gap-1.5"
          >
            {importMutation.isPending ? (
              <>
                <RecoderLoader customSize={16} />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import Agent
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
