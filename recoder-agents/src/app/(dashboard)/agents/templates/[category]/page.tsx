'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
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
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCategoryById, getTemplatesByCategory, type AgentTemplate } from '@/lib/data/agent-templates';
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

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const categoryId = params.category as string;
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const category = getCategoryById(categoryId);
  const templates = getTemplatesByCategory(categoryId);

  const handleTemplateClick = (template: AgentTemplate) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  if (!category) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            Category not found
          </h2>
          <p className="text-sm text-muted-foreground">
            The template category &quot;{categoryId}&quot; does not exist.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push('/agents/templates')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  const CategoryIcon = ICON_MAP[category.icon] || Code;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/agents/templates')}
          className="text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          All Templates
        </Button>

        {/* Category Header */}
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted/60 flex-shrink-0">
            <CategoryIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
              {category.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {category.description}
            </p>
          </div>
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const Icon = ICON_MAP[template.icon] || Code;
            return (
              <div
                key={template.id}
                className="group flex flex-col p-5 rounded-xl border border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/60 group-hover:bg-primary/10 transition-colors flex-shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {template.name}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">
                  {template.description}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {template.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-[10px] px-1.5 py-0">
                      {tool}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    {template.estimatedCostPerRun}/run
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleTemplateClick(template)}
                  >
                    Use Template
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {templates.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              No templates available in this category yet.
            </p>
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
