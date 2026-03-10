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
  ArrowRight,
  ChevronDown,
  ChevronUp,
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
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TEMPLATE_CATEGORIES, AGENT_TEMPLATES, type AgentTemplate } from '@/lib/data/agent-templates';
import { TemplatePreviewDialog } from '@/components/agents/template-preview-dialog';

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

export default function TemplatesPage() {
  const router = useRouter();
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleTemplateClick = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
            Agent Templates
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl">
            Start with a proven template and customize to your needs. Each template
            comes with pre-configured instructions, tools, and model settings.
          </p>
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATE_CATEGORIES.map((category) => {
            const Icon = ICON_MAP[category.icon] || Code;
            return (
              <button
                key={category.id}
                onClick={() => router.push(`/agents/templates/${category.id}`)}
                className="group flex flex-col items-start text-left p-5 rounded-xl border border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30 transition-all"
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/60 group-hover:bg-primary/10 transition-colors">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {category.templateCount} templates
                  </Badge>
                </div>
                <span className="text-sm font-medium text-foreground mb-1">
                  {category.name}
                </span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {category.description}
                </span>
                <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                  Browse
                  <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Browse All Toggle */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setShowAllTemplates(!showAllTemplates)}
            className="gap-2"
          >
            {showAllTemplates ? (
              <>
                Hide All Templates
                <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Browse All Templates
                <ChevronDown className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {/* All Templates Grid */}
        {showAllTemplates && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">
              All Templates ({AGENT_TEMPLATES.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {AGENT_TEMPLATES.map((template) => {
                const Icon = ICON_MAP[template.icon] || Code;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className="group flex flex-col items-start text-left p-5 rounded-xl border border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3 w-full">
                      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/60 group-hover:bg-primary/10 transition-colors flex-shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground block truncate">
                          {template.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {template.estimatedCostPerRun}/run
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                      {template.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {template.tools.slice(0, 3).map((tool) => (
                        <Badge key={tool} variant="outline" className="text-[10px] px-1.5 py-0">
                          {tool}
                        </Badge>
                      ))}
                      {template.tools.length > 3 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          +{template.tools.length - 3}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <TemplatePreviewDialog
        template={selectedTemplate}
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setSelectedTemplate(null);
        }}
      />
    </div>
  );
}
