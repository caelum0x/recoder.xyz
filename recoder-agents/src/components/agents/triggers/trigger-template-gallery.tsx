'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Zap,
  HeartPulse,
  FileText,
  BarChart3,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  LayoutTemplate,
  Loader2,
  Check,
  Clock,
  Shield,
  Database,
  Wrench,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import {
  useTriggerTemplates,
  useApplyTemplate,
  useSeedTemplates,
} from '@/hooks/triggers/use-trigger-templates';
import type { TriggerTemplate } from '@/lib/api/trigger-templates';

// ── Icon resolver ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  zap: Zap,
  'heart-pulse': HeartPulse,
  'file-text': FileText,
  'bar-chart-3': BarChart3,
  'alert-triangle': AlertTriangle,
  'dollar-sign': DollarSign,
  'refresh-cw': RefreshCw,
  clock: Clock,
  shield: Shield,
  database: Database,
  wrench: Wrench,
  bell: Bell,
};

function resolveIcon(iconName: string) {
  return ICON_MAP[iconName] || Zap;
}

// ── Category data ────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'data_sync', label: 'Data Sync' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'alerts', label: 'Alerts' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  monitoring: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  reporting: 'bg-green-500/10 text-green-600 border-green-500/20',
  data_sync: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  maintenance: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  alerts: 'bg-red-500/10 text-red-600 border-red-500/20',
  custom: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

// ── Props ────────────────────────────────────────────────────────────────────

interface TriggerTemplateGalleryProps {
  agentId: string;
  onTemplateApplied?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TriggerTemplateGallery({ agentId, onTemplateApplied }: TriggerTemplateGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TriggerTemplate | null>(null);

  const {
    data: templates = [],
    isLoading,
    error,
  } = useTriggerTemplates(
    activeCategory === 'all' ? undefined : { category: activeCategory }
  );

  const applyMutation = useApplyTemplate();
  const seedMutation = useSeedTemplates();

  // Auto-seed templates if none exist
  useEffect(() => {
    if (!isLoading && templates.length === 0 && !error) {
      seedMutation.mutate(undefined, {
        onError: () => {
          // Silently fail — user can still create custom templates
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, templates.length]);

  const filteredTemplates = useMemo(() => {
    if (activeCategory === 'all') return templates;
    return templates.filter((t) => t.category === activeCategory);
  }, [templates, activeCategory]);

  const handleUseTemplate = (template: TriggerTemplate) => {
    setSelectedTemplate(template);
    setApplyDialogOpen(true);
  };

  const handleConfirmApply = async () => {
    if (!selectedTemplate) return;

    try {
      await applyMutation.mutateAsync({
        templateId: selectedTemplate.id,
        payload: { agent_id: agentId },
      });
      toast.success(`Template "${selectedTemplate.name}" applied successfully`);
      setApplyDialogOpen(false);
      setSelectedTemplate(null);
      onTemplateApplied?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply template');
    }
  };

  if (error) {
    return null; // Silently fail - the gallery is an enhancement
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">Quick Start Templates</h3>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs rounded-lg"
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Template cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No templates found for this category.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredTemplates.map((template) => {
            const Icon = resolveIcon(template.icon);
            return (
              <SpotlightCard
                key={template.id}
                className="bg-card border border-border hover:border-border/80 transition-colors"
              >
                <div className="p-4 flex flex-col h-full">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-muted/50 border border-border/50 flex-shrink-0">
                      <Icon className="h-4 w-4 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-foreground truncate">
                        {template.name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {template.description || 'No description'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[template.category] || ''}`}
                      >
                        {template.category.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {template.trigger_type}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleUseTemplate(template)}
                    >
                      Use
                    </Button>
                  </div>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      {/* Apply confirmation dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Template</DialogTitle>
            <DialogDescription>
              This will create a new trigger from the "{selectedTemplate?.name}" template for this
              worker.
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                {(() => {
                  const Icon = resolveIcon(selectedTemplate.icon);
                  return <Icon className="h-5 w-5 text-foreground flex-shrink-0" />;
                })()}
                <div>
                  <p className="text-sm font-medium">{selectedTemplate.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedTemplate.description}
                  </p>
                </div>
              </div>

              {selectedTemplate.trigger_type === 'schedule' &&
                selectedTemplate.config_template.cron && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Cron:</span>{' '}
                    <code className="bg-muted px-1.5 py-0.5 rounded">
                      {selectedTemplate.config_template.cron}
                    </code>
                  </div>
                )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApply}
              disabled={applyMutation.isPending}
              className="gap-2"
            >
              {applyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
