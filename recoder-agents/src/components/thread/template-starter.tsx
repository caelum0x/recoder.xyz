'use client';

import React, { useState } from 'react';
import {
  FileText,
  MessageSquare,
  Code,
  Search,
  Bug,
  ClipboardList,
  Sparkles,
  Play,
  BarChart3,
  BookOpen,
  Lightbulb,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useConversationTemplates,
  usePopularTemplates,
  useTemplateAction,
} from '@/hooks/threads/use-conversation-templates';
import type { ConversationTemplate } from '@/lib/api/conversation-templates';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  general: FileText,
  coding: Code,
  analysis: BarChart3,
  writing: BookOpen,
  research: Search,
  debugging: Bug,
  planning: ClipboardList,
  custom: Sparkles,
};

interface TemplateStarterProps {
  onSelectTemplate: (messages: Array<{ role: string; content: string }>, agentId?: string) => void;
}

export function TemplateStarter({ onSelectTemplate }: TemplateStarterProps) {
  const { data: popularTemplates = [] } = usePopularTemplates(8);
  const { data: recentTemplates = [] } = useConversationTemplates({ limit: 8 });
  const useTemplateMutation = useTemplateAction();

  const [selectedTemplate, setSelectedTemplate] = useState<ConversationTemplate | null>(null);
  const [variableInputs, setVariableInputs] = useState<Record<string, string>>({});

  const templates = popularTemplates.length > 0 ? popularTemplates : recentTemplates;

  if (templates.length === 0) {
    return null;
  }

  const handleSelect = (template: ConversationTemplate) => {
    if ((template.variables?.length || 0) > 0) {
      setSelectedTemplate(template);
      const initialVars: Record<string, string> = {};
      template.variables.forEach((v) => {
        initialVars[v] = '';
      });
      setVariableInputs(initialVars);
    } else {
      handleUse(template);
    }
  };

  const handleUse = async (template: ConversationTemplate, vars?: Record<string, string>) => {
    try {
      const resolved = await useTemplateMutation.mutateAsync({
        id: template.id,
        variableValues: vars,
      });
      onSelectTemplate(
        resolved.starter_messages || [],
        resolved.agent_id || undefined
      );
      setSelectedTemplate(null);
    } catch {
      // Fallback: use unresolved messages
      onSelectTemplate(
        template.starter_messages || [],
        template.agent_id || undefined
      );
      setSelectedTemplate(null);
    }
  };

  const handleSubmitVariables = () => {
    if (selectedTemplate) {
      handleUse(selectedTemplate, variableInputs);
    }
  };

  return (
    <>
      <div className="w-full">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Start from a template
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {templates.slice(0, 8).map((template) => {
            const Icon = CATEGORY_ICONS[template.category] || FileText;
            return (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className="text-left rounded-lg border p-3 hover:border-primary/50 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium truncate">{template.title}</span>
                </div>
                {template.description && (
                  <p className="text-[10px] text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <Badge variant="outline" className="text-[8px] px-1 py-0">
                    {template.category}
                  </Badge>
                  <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Variable Input Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedTemplate?.title}</DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">
                Fill in the variables to customize this template.
              </p>
              {selectedTemplate.variables.map((v) => (
                <div key={v} className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" />
                    {v}
                  </Label>
                  <Input
                    placeholder={`Enter ${v}...`}
                    value={variableInputs[v] || ''}
                    onChange={(e) =>
                      setVariableInputs((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitVariables}
              disabled={useTemplateMutation.isPending}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
