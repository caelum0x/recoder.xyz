'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code,
  Search,
  PenTool,
  BarChart3,
  Headphones,
  Zap,
  GitPullRequest,
  TestTube,
  Bug,
  Webhook,
  Globe,
  Database,
  TrendingUp,
  FileText,
  Mail,
  ListChecks,
  Table,
  FileBarChart,
  MessageCircleQuestion,
  Tags,
  Calendar,
  GitBranch,
  RefreshCcw,
  Cpu,
  Wrench,
  DollarSign,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCreateAgent } from '@/hooks/agents/use-agents';
import { AgentCountLimitError } from '@/lib/api/errors';
import { toast } from '@/lib/toast';
import type { AgentTemplate } from '@/lib/data/agent-templates';
import { RecoderLoader } from '@/components/ui/recoder-loader';

const ICON_MAP: Record<string, LucideIcon> = {
  Code,
  Search,
  PenTool,
  BarChart3,
  Headphones,
  Zap,
  GitPullRequest,
  TestTube,
  Bug,
  Webhook,
  Globe,
  Database,
  TrendingUp,
  FileText,
  Mail,
  ListChecks,
  Table,
  FileBarChart,
  MessageCircleQuestion,
  Tags,
  Calendar,
  GitBranch,
  RefreshCcw,
};

interface TemplatePreviewDialogProps {
  template: AgentTemplate | null;
  open: boolean;
  onClose: () => void;
}

export function TemplatePreviewDialog({ template, open, onClose }: TemplatePreviewDialogProps) {
  const router = useRouter();
  const createAgentMutation = useCreateAgent();
  const [isCreating, setIsCreating] = useState(false);

  if (!template) return null;

  const Icon = ICON_MAP[template.icon] || Code;

  const handleCreate = async (navigateToConfig: boolean) => {
    setIsCreating(true);
    try {
      const agentData = {
        name: template.name,
        description: template.description,
        system_prompt: template.instructions,
        agentpress_tools: template.tools.reduce<Record<string, { enabled: boolean }>>((acc, tool) => {
          acc[tool] = { enabled: true };
          return acc;
        }, {}),
        is_default: false,
        icon_name: template.icon.toLowerCase(),
        icon_color: '#000000',
        icon_background: '#F3F4F6',
      };

      const newAgent = await createAgentMutation.mutateAsync(agentData);
      onClose();
      router.push(`/agents/config/${newAgent.agent_id}`);
    } catch (error) {
      if (error instanceof AgentCountLimitError) {
        onClose();
      } else {
        const { handleBillingError } = await import('@/lib/error-handler');
        if (handleBillingError(error)) {
          onClose();
          return;
        }
        toast.error(error instanceof Error ? error.message : 'Failed to create Worker from template');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[90vh] sm:max-h-[85vh]">
        <div className="p-5 sm:p-6 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-muted/60 flex-shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                {template.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {template.category.charAt(0).toUpperCase() + template.category.slice(1)} template
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            {template.description}
          </p>

          {/* System Prompt Preview */}
          <div className="mb-5">
            <h3 className="text-xs font-medium text-foreground uppercase tracking-wider mb-2">
              System Prompt
            </h3>
            <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-[300px] overflow-y-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {template.instructions}
              </pre>
            </div>
          </div>

          {/* Meta Info */}
          <div className="space-y-3 mb-5">
            {/* Model */}
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Suggested model:</span>
              <Badge variant="secondary" className="text-xs">
                {template.suggestedModel}
              </Badge>
            </div>

            {/* Tools */}
            {template.tools.length > 0 && (
              <div className="flex items-start gap-2">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground flex-shrink-0">Tools:</span>
                <div className="flex flex-wrap gap-1.5">
                  {template.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-xs">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Cost */}
            <div className="flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Estimated cost:</span>
              <span className="text-xs font-medium text-foreground">
                {template.estimatedCostPerRun}/run
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-3 border-t border-border">
            <Button
              onClick={() => handleCreate(false)}
              disabled={isCreating}
              className="w-full h-9 text-sm"
            >
              {isCreating ? (
                <>
                  <RecoderLoader customSize={16} />
                  <span className="ml-2">Creating...</span>
                </>
              ) : (
                'Create from Template'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleCreate(true)}
              disabled={isCreating}
              className="w-full h-9 text-sm"
            >
              Customize First
            </Button>
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isCreating}
              className="w-full h-9 text-sm text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
