'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Copy,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  FileText,
  Wrench,
  Workflow,
  Route,
  Tag,
  Settings,
  Sparkles,
  Clock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useClonePreview,
  useCloneAgent,
  useCloneHistory,
  useCloneSuggestions,
} from '@/hooks/agents/use-agent-clone-wizard';
import type {
  SectionPreview,
  CloneHistoryWizardItem,
} from '@/lib/api/agent-clone-wizard';

// ============================================================================
// Constants
// ============================================================================

const SECTION_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; description: string }
> = {
  instructions: {
    label: 'Instructions',
    icon: FileText,
    description: 'System prompt and behavioral instructions',
  },
  tools: {
    label: 'Tools',
    icon: Wrench,
    description: 'Configured tools and capabilities',
  },
  workflows: {
    label: 'Workflows',
    icon: Workflow,
    description: 'Automation workflows and steps',
  },
  routing_rules: {
    label: 'Routing Rules',
    icon: Route,
    description: 'MCP servers and routing configuration',
  },
  tags: {
    label: 'Tags',
    icon: Tag,
    description: 'Agent tags and labels',
  },
  deployment_config: {
    label: 'Deployment Config',
    icon: Settings,
    description: 'Model, provider, and appearance settings',
  },
};

const STEPS = ['Select Sections', 'Customize', 'Review & Clone'] as const;

// ============================================================================
// Section Checkbox
// ============================================================================

function SectionCheckbox({
  section,
  checked,
  onChange,
}: {
  section: SectionPreview;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const config = SECTION_CONFIG[section.section] ?? {
    label: section.section,
    icon: Settings,
    description: '',
  };
  const Icon = config.icon;

  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
        checked
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:bg-muted/50',
        !section.available && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!section.available}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-input"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{config.label}</span>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {section.item_count} item{section.item_count !== 1 ? 's' : ''} ({section.size_estimate})
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
        {section.preview && (
          <div className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 truncate max-w-full">
            {typeof section.preview === 'string'
              ? section.preview
              : Array.isArray(section.preview)
                ? section.preview.join(', ')
                : JSON.stringify(section.preview).substring(0, 100)}
          </div>
        )}
      </div>
    </label>
  );
}

// ============================================================================
// Step 1: Select Sections
// ============================================================================

function Step1SelectSections({
  sections,
  selectedSections,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  sections: SectionPreview[];
  selectedSections: Set<string>;
  onToggle: (section: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Choose which sections to include in the clone
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs text-primary hover:underline"
          >
            Select All
          </button>
          <span className="text-xs text-muted-foreground">|</span>
          <button
            onClick={onDeselectAll}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Deselect All
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {sections.map((section) => (
          <SectionCheckbox
            key={section.section}
            section={section}
            checked={selectedSections.has(section.section)}
            onChange={(checked) => onToggle(section.section, checked)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Step 2: Customize
// ============================================================================

function Step2Customize({
  agentName,
  newName,
  onNameChange,
  description,
  onDescriptionChange,
  selectedSections,
  sections,
  suggestions,
}: {
  agentName: string;
  newName: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  selectedSections: Set<string>;
  sections: SectionPreview[];
  suggestions?: { suggested_name: string; suggested_tweaks: string[] } | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1.5">New Agent Name</label>
        <input
          type="text"
          value={newName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`Copy of ${agentName}`}
          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5">
          Description <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Optional description for the cloned agent..."
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {suggestions && suggestions.suggested_tweaks.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Suggestions</span>
          </div>
          <ul className="space-y-1">
            {suggestions.suggested_tweaks.map((tweak, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                {tweak}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-2">Selected Sections</p>
        <div className="space-y-1">
          {sections
            .filter((s) => selectedSections.has(s.section))
            .map((section) => {
              const config = SECTION_CONFIG[section.section] ?? { label: section.section, icon: Settings };
              const Icon = config.icon;
              return (
                <div
                  key={section.section}
                  className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-2 rounded bg-muted/50"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{config.label}</span>
                  <span className="ml-auto tabular-nums">
                    {section.item_count} item{section.item_count !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Step 3: Review & Clone
// ============================================================================

function Step3Review({
  agentName,
  newName,
  selectedSections,
  sections,
}: {
  agentName: string;
  newName: string;
  selectedSections: Set<string>;
  sections: SectionPreview[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium mb-1">Clone Summary</p>
        <p className="text-xs text-muted-foreground">
          Creating <span className="font-medium text-foreground">{newName}</span> from{' '}
          <span className="font-medium text-foreground">{agentName}</span>
        </p>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Sections to Clone</p>
        <div className="space-y-1.5">
          {Object.keys(SECTION_CONFIG).map((sectionName) => {
            const included = selectedSections.has(sectionName);
            const config = SECTION_CONFIG[sectionName];
            const Icon = config.icon;
            const section = sections.find((s) => s.section === sectionName);

            return (
              <div
                key={sectionName}
                className={cn(
                  'flex items-center gap-2.5 text-sm py-1.5 px-2 rounded',
                  included ? 'text-foreground' : 'text-muted-foreground line-through'
                )}
              >
                {included ? (
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{config.label}</span>
                {included && section && (
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {section.item_count} item{section.item_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Clone History Section
// ============================================================================

function CloneHistorySection() {
  const { data: historyData, isLoading } = useCloneHistory(20);
  const history = historyData?.history ?? [];

  if (isLoading) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-sm font-medium mb-2">Recent Clones</p>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (history.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <p className="text-sm font-medium mb-2 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Recent Clones
      </p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {history.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-muted/50"
          >
            <span className="font-medium truncate max-w-[120px]">
              {item.source_agent_name ?? item.source_agent_id.substring(0, 8)}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium truncate max-w-[120px]">
              {item.target_agent_name ?? item.target_agent_id?.substring(0, 8) ?? '?'}
            </span>
            {item.cloned_sections.length > 0 && (
              <span className="text-muted-foreground">
                ({item.cloned_sections.length} section{item.cloned_sections.length !== 1 ? 's' : ''})
              </span>
            )}
            <span className="ml-auto text-muted-foreground tabular-nums shrink-0">
              {item.created_at ? new Date(item.created_at).toLocaleDateString() : '--'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Dialog
// ============================================================================

interface CloneWizardDialogProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: (newAgentId: string) => void;
}

export function CloneWizardDialog({
  agentId,
  agentName,
  open,
  onClose,
  onSuccess,
}: CloneWizardDialogProps) {
  const [step, setStep] = useState(0);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [description, setDescription] = useState('');
  const [cloneResult, setCloneResult] = useState<{ agent_id: string; name: string } | null>(null);

  const { data: previewData, isLoading: previewLoading } = useClonePreview(agentId, {
    enabled: open,
  });
  const { data: suggestionsData } = useCloneSuggestions(agentId, { enabled: open });
  const cloneMutation = useCloneAgent();

  const sections = previewData?.sections ?? [];

  // Initialize selections when preview loads
  useEffect(() => {
    if (previewData && selectedSections.size === 0) {
      const availableSections = previewData.sections
        .filter((s) => s.available)
        .map((s) => s.section);
      setSelectedSections(new Set(availableSections));
    }
  }, [previewData, selectedSections.size]);

  // Initialize name from suggestions
  useEffect(() => {
    if (suggestionsData && !newName) {
      setNewName(suggestionsData.suggested_name);
    }
  }, [suggestionsData, newName]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedSections(new Set());
      setNewName('');
      setDescription('');
      setCloneResult(null);
    }
  }, [open]);

  const handleToggle = useCallback((section: string, checked: boolean) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (checked) next.add(section);
      else next.delete(section);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedSections(new Set(sections.filter((s) => s.available).map((s) => s.section)));
  }, [sections]);

  const handleDeselectAll = useCallback(() => {
    setSelectedSections(new Set());
  }, []);

  const handleClone = useCallback(() => {
    const overrides: Record<string, any> = {};
    if (description) overrides.description = description;

    cloneMutation.mutate(
      {
        agentId,
        request: {
          new_name: newName || `Copy of ${agentName}`,
          sections: Array.from(selectedSections),
          overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        },
      },
      {
        onSuccess: (data) => {
          setCloneResult({ agent_id: data.agent_id, name: data.name });
          onSuccess?.(data.agent_id);
        },
      }
    );
  }, [agentId, agentName, cloneMutation, description, newName, onSuccess, selectedSections]);

  if (!open) return null;

  const canProceed = step === 0
    ? selectedSections.size > 0
    : step === 1
      ? (newName || '').trim().length > 0
      : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl mx-4">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4 rounded-t-xl">
          <div className="flex items-center gap-2.5">
            <Copy className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Clone Agent</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        {!cloneResult && (
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div
                    className={cn(
                      'flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium transition-colors',
                      i <= step
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {i < step ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      'text-xs hidden sm:inline',
                      i <= step ? 'text-foreground font-medium' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-px',
                        i < step ? 'bg-primary' : 'bg-border'
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4">
          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cloneResult ? (
            /* Success state */
            <div className="text-center py-6 space-y-4">
              <div className="flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
              </div>
              <div>
                <p className="text-base font-medium">Agent Cloned Successfully</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">{cloneResult.name}</span> has been
                  created
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-input hover:bg-muted transition-colors"
                >
                  Close
                </button>
                <a
                  href={`/agents/config/${cloneResult.agent_id}`}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Go to Agent
                </a>
              </div>
            </div>
          ) : (
            <>
              {step === 0 && (
                <Step1SelectSections
                  sections={sections}
                  selectedSections={selectedSections}
                  onToggle={handleToggle}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                />
              )}
              {step === 1 && (
                <Step2Customize
                  agentName={agentName}
                  newName={newName}
                  onNameChange={setNewName}
                  description={description}
                  onDescriptionChange={setDescription}
                  selectedSections={selectedSections}
                  sections={sections}
                  suggestions={suggestionsData}
                />
              )}
              {step === 2 && (
                <Step3Review
                  agentName={agentName}
                  newName={newName || `Copy of ${agentName}`}
                  selectedSections={selectedSections}
                  sections={sections}
                />
              )}
            </>
          )}

          {/* Clone history section */}
          {!cloneResult && step === 0 && <CloneHistorySection />}
        </div>

        {/* Footer with navigation */}
        {!cloneResult && !previewLoading && (
          <div className="sticky bottom-0 flex items-center justify-between border-t border-border bg-card px-5 py-3 rounded-b-xl">
            <button
              onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border border-input hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              {step > 0 ? 'Back' : 'Cancel'}
            </button>

            {step < 2 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:pointer-events-none'
                )}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleClone}
                disabled={cloneMutation.isPending || !canProceed}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:pointer-events-none'
                )}
              >
                {cloneMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Clone Agent
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
