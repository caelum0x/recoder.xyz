'use client';

import React, { useState, useCallback } from 'react';
import { Copy, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { useCloneAgent } from '@/hooks/agents/use-agent-clone';
import { AgentDiffView } from './agent-diff-view';
import type { AgentDiffField } from '@/lib/api/agent-clone';
import { AgentAvatar } from '../thread/content/agent-avatar';

interface CloneAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceAgent: {
    agent_id: string;
    name: string;
    system_prompt?: string;
    model?: string | null;
    agentpress_tools?: Record<string, any>;
    icon_name?: string | null;
    icon_color?: string | null;
    icon_background?: string | null;
    metadata?: {
      is_recoder_default?: boolean;
      is_suna_default?: boolean;
    };
  };
  onCloned?: (newAgentId: string) => void;
}

export function CloneAgentDialog({
  open,
  onOpenChange,
  sourceAgent,
  onCloned,
}: CloneAgentDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cloneMutation = useCloneAgent();

  const [cloneName, setCloneName] = useState(`Copy of ${sourceAgent.name}`);
  const [overrideInstructions, setOverrideInstructions] = useState(false);
  const [instructions, setInstructions] = useState(sourceAgent.system_prompt || '');
  const [overrideModel, setOverrideModel] = useState(false);
  const [model, setModel] = useState(sourceAgent.model || '');
  const [showPreview, setShowPreview] = useState(false);

  // Reset state when dialog opens with new agent
  React.useEffect(() => {
    if (open) {
      setCloneName(`Copy of ${sourceAgent.name}`);
      setOverrideInstructions(false);
      setInstructions(sourceAgent.system_prompt || '');
      setOverrideModel(false);
      setModel(sourceAgent.model || '');
      setShowPreview(false);
    }
  }, [open, sourceAgent.name, sourceAgent.system_prompt, sourceAgent.model]);

  const buildPreviewDiffs = useCallback((): AgentDiffField[] => {
    const diffs: AgentDiffField[] = [];

    // Name always changes
    diffs.push({
      field: 'name',
      type: cloneName !== sourceAgent.name ? 'modified' : 'same',
      value_a: sourceAgent.name,
      value_b: cloneName,
    });

    // Instructions
    if (overrideInstructions) {
      diffs.push({
        field: 'instructions',
        type: instructions !== (sourceAgent.system_prompt || '') ? 'modified' : 'same',
        value_a: sourceAgent.system_prompt || '',
        value_b: instructions,
      });
    } else {
      diffs.push({
        field: 'instructions',
        type: 'same',
        value_a: sourceAgent.system_prompt || '',
        value_b: sourceAgent.system_prompt || '',
      });
    }

    // Model
    if (overrideModel) {
      diffs.push({
        field: 'model',
        type: model !== (sourceAgent.model || '') ? 'modified' : 'same',
        value_a: sourceAgent.model || '',
        value_b: model,
      });
    } else {
      diffs.push({
        field: 'model',
        type: 'same',
        value_a: sourceAgent.model || '',
        value_b: sourceAgent.model || '',
      });
    }

    // Tools (not overriding)
    diffs.push({
      field: 'agentpress_tools',
      type: 'same',
      value_a: sourceAgent.agentpress_tools || {},
      value_b: sourceAgent.agentpress_tools || {},
    });

    return diffs;
  }, [cloneName, instructions, model, overrideInstructions, overrideModel, sourceAgent]);

  const handleClone = useCallback(async () => {
    try {
      const request: Record<string, any> = {};
      if (cloneName && cloneName !== `Copy of ${sourceAgent.name}`) {
        request.name = cloneName;
      } else {
        request.name = cloneName;
      }
      if (overrideInstructions) {
        request.instructions_override = instructions;
      }
      if (overrideModel) {
        request.model_override = model;
      }

      const result = await cloneMutation.mutateAsync({
        agentId: sourceAgent.agent_id,
        request,
      });

      toast.success(`"${sourceAgent.name}" cloned successfully`);
      onOpenChange(false);

      if (onCloned) {
        onCloned(result.agent_id);
      } else {
        router.push(`/agents/config/${result.agent_id}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to clone agent';
      toast.error(message);
    }
  }, [
    cloneName,
    instructions,
    model,
    overrideInstructions,
    overrideModel,
    sourceAgent,
    cloneMutation,
    onCloned,
    onOpenChange,
    router,
  ]);

  const isRecoderAgent = sourceAgent.metadata?.is_recoder_default || sourceAgent.metadata?.is_suna_default;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clone Agent
          </DialogTitle>
          <DialogDescription>
            Create a copy of this agent with optional modifications.
          </DialogDescription>
        </DialogHeader>

        {/* Source agent info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
          <AgentAvatar
            iconName={sourceAgent.icon_name}
            iconColor={sourceAgent.icon_color}
            backgroundColor={sourceAgent.icon_background}
            agentName={sourceAgent.name}
            isRecoderDefault={isRecoderAgent}
            size={40}
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{sourceAgent.name}</div>
            <div className="text-xs text-muted-foreground">
              {sourceAgent.model || 'Default model'}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Clone name */}
          <div className="space-y-2">
            <Label htmlFor="clone-name">Clone Name</Label>
            <Input
              id="clone-name"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder="Enter a name for the clone"
            />
          </div>

          {/* Instructions override */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="override-instructions">Override Instructions</Label>
              <Switch
                id="override-instructions"
                checked={overrideInstructions}
                onCheckedChange={setOverrideInstructions}
              />
            </div>
            {overrideInstructions && (
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Enter custom instructions..."
                rows={4}
                className="font-mono text-xs"
              />
            )}
          </div>

          {/* Model override */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="override-model">Override Model</Label>
              <Switch
                id="override-model"
                checked={overrideModel}
                onCheckedChange={setOverrideModel}
              />
            </div>
            {overrideModel && (
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., claude-sonnet-4"
              />
            )}
          </div>

          {/* Preview diff */}
          {showPreview && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium">Preview Changes</div>
              <AgentDiffView
                agentAName={sourceAgent.name}
                agentBName={cloneName || 'Clone'}
                differences={buildPreviewDiffs()}
                compact
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="gap-1.5"
          >
            <Eye className="h-4 w-4" />
            {showPreview ? 'Hide Preview' : 'Preview Changes'}
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleClone}
              disabled={cloneMutation.isPending || !cloneName.trim()}
              className="gap-1.5"
            >
              {cloneMutation.isPending ? (
                <>
                  <RecoderLoader customSize={16} />
                  Cloning...
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Clone Agent
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CloneAgentDialog;
