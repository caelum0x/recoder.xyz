'use client';

import { useState } from 'react';
import {
  useMultilangPromptSets,
  useMultilangStats,
  useCreatePromptSet,
  useDeletePromptSet,
  useUpsertVariant,
  usePromptSetDetail,
} from '@/hooks/prompts/use-multilang-prompts';
import type {
  MultilangPromptSet,
  MultilangPromptVariant,
} from '@/lib/api/multilang-prompts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { handleApiError } from '@/lib/error-handler';
import {
  Globe,
  Plus,
  Trash2,
  Star,
  ChevronDown,
  ChevronRight,
  Languages,
  CheckCircle2,
  XCircle,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COMMON_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja', 'zh', 'pt', 'ko'];
const ALL_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ko', label: 'Korean' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
];

const CATEGORIES = [
  'general',
  'system',
  'coding',
  'writing',
  'analysis',
  'creative',
  'custom',
];

function LanguageDot({
  has,
  isBase,
}: {
  has: boolean | null;
  isBase?: boolean;
}) {
  if (has === null)
    return <Circle className="h-3 w-3 text-muted-foreground/30" />;
  if (isBase && has)
    return <CheckCircle2 className="h-3 w-3 text-blue-500" />;
  if (has) return <CheckCircle2 className="h-3 w-3 text-green-500" />;
  return <XCircle className="h-3 w-3 text-red-400" />;
}

function CoverageBar({ count, total }: { count: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {count}/{total}
      </span>
    </div>
  );
}

function QualityStars({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const filled = Math.round(score);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            'h-3 w-3',
            s <= filled ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
          )}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Prompt Set Dialog
// ---------------------------------------------------------------------------
function NewPromptSetDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [baseLang, setBaseLang] = useState('en');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');

  const create = useCreatePromptSet();

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Prompt name is required');
      return;
    }
    try {
      await create.mutateAsync({
        prompt_name: name.trim(),
        base_language: baseLang,
        description: description.trim() || undefined,
        category,
      });
      toast.success('Prompt set created');
      setName('');
      setDescription('');
      setCategory('general');
      setBaseLang('en');
      onClose();
    } catch (err) {
      handleApiError(err, 'Failed to create prompt set');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Prompt Set</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Prompt Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. greeting_message"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Base Language</Label>
            <Select value={baseLang} onValueChange={setBaseLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label} ({l.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Variant Editor (expanded panel)
// ---------------------------------------------------------------------------
function VariantEditor({ promptSetId }: { promptSetId: string }) {
  const { data: detail, isLoading } = usePromptSetDetail(promptSetId);
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [isMachine, setIsMachine] = useState(false);
  const [addingLang, setAddingLang] = useState('');

  const upsert = useUpsertVariant(promptSetId);

  const variants: MultilangPromptVariant[] = detail?.variants ?? [];

  const handleSelectLang = (code: string) => {
    setSelectedLang(code);
    const v = variants.find((vv) => vv.language_code === code);
    setContent(v?.content ?? '');
    setIsMachine(v?.is_machine_translated ?? false);
  };

  const handleAddLang = () => {
    if (!addingLang) return;
    handleSelectLang(addingLang);
    setAddingLang('');
  };

  const handleSave = async () => {
    if (!selectedLang || !content.trim()) {
      toast.error('Language and content are required');
      return;
    }
    try {
      await upsert.mutateAsync({
        language_code: selectedLang,
        content: content.trim(),
        is_machine_translated: isMachine,
      });
      toast.success(`Variant saved for ${selectedLang}`);
    } catch (err) {
      handleApiError(err, 'Failed to save variant');
    }
  };

  const existingLangCodes = variants.map((v) => v.language_code);
  const availableToAdd = ALL_LANGUAGES.filter(
    (l) => !existingLangCodes.includes(l.code)
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Language tabs */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {variants.map((v) => (
          <button
            key={v.language_code}
            onClick={() => handleSelectLang(v.language_code)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
              selectedLang === v.language_code
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted border-transparent hover:border-border'
            )}
          >
            {v.language_code.toUpperCase()}
            {v.is_machine_translated && (
              <span className="ml-1 opacity-60">(MT)</span>
            )}
          </button>
        ))}
        {/* Add language */}
        <div className="flex gap-1 items-center">
          <Select value={addingLang} onValueChange={setAddingLang}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue placeholder="Add language…" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleAddLang}
            disabled={!addingLang}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {selectedLang && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {ALL_LANGUAGES.find((l) => l.code === selectedLang)?.label ??
                selectedLang.toUpperCase()}
            </span>
            {(() => {
              const v = variants.find((vv) => vv.language_code === selectedLang);
              if (!v) return null;
              return (
                <div className="flex items-center gap-2">
                  {v.is_machine_translated && (
                    <Badge variant="secondary" className="text-xs">
                      Machine Translated
                    </Badge>
                  )}
                  <QualityStars score={v.quality_score} />
                </div>
              );
            })()}
          </div>

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="Enter prompt content for this language…"
            className="font-mono text-sm resize-none"
          />

          <div className="flex items-center gap-2">
            <input
              id="machine-translated"
              type="checkbox"
              checked={isMachine}
              onChange={(e) => setIsMachine(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="machine-translated" className="text-sm cursor-pointer">
              Machine translated
            </label>
          </div>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={upsert.isPending}
          >
            {upsert.isPending ? 'Saving…' : 'Save Variant'}
          </Button>
        </div>
      )}

      {variants.length === 0 && !selectedLang && (
        <p className="text-sm text-muted-foreground">
          No variants yet. Add a language above to get started.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt Set Row
// ---------------------------------------------------------------------------
function PromptSetRow({
  ps,
  onDelete,
}: {
  ps: MultilangPromptSet;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const languages: string[] = (ps as unknown as { languages?: string[] }).languages ?? [];
  const variantCount = ps.variant_count ?? 0;
  const total = COMMON_LANGUAGES.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <button
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{ps.prompt_name}</span>
            <Badge variant="outline" className="text-xs capitalize">
              {ps.category}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {ps.base_language.toUpperCase()}
            </Badge>
          </div>
          {ps.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {ps.description}
            </p>
          )}
        </div>

        {/* Language dots for common languages */}
        <div className="hidden md:flex items-center gap-1">
          {COMMON_LANGUAGES.map((lang) => (
            <div key={lang} title={lang} className="flex flex-col items-center gap-0.5">
              <LanguageDot
                has={languages.includes(lang)}
                isBase={lang === ps.base_language}
              />
              <span className="text-[9px] text-muted-foreground leading-none">
                {lang}
              </span>
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        <div className="hidden sm:block">
          <CoverageBar count={variantCount} total={total} />
        </div>

        {/* Date */}
        <span className="hidden lg:block text-xs text-muted-foreground whitespace-nowrap">
          {new Date(ps.created_at).toLocaleDateString()}
        </span>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(ps.id);
          }}
          className="text-muted-foreground hover:text-destructive transition-colors ml-1"
          aria-label="Delete prompt set"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded variant editor */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t bg-muted/20">
          <VariantEditor promptSetId={ps.id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Header
// ---------------------------------------------------------------------------
function StatsHeader() {
  const { data: stats, isLoading } = useMultilangStats();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const s = stats.summary;
  const totalLangs = stats.language_distribution.length;
  const needingTranslation = stats.sets_needing_translation.length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">Total Prompt Sets</p>
        <p className="text-2xl font-bold mt-1">{s.total_sets}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">Languages Covered</p>
        <p className="text-2xl font-bold mt-1">{totalLangs}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">Full Coverage Sets</p>
        <p className="text-2xl font-bold mt-1 text-green-600">
          {s.fully_covered_sets}
        </p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">Needs Translation</p>
        <p className="text-2xl font-bold mt-1 text-yellow-600">
          {needingTranslation}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function MultilangPromptsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: sets, isLoading } = useMultilangPromptSets({
    search: search || undefined,
    category: category || undefined,
  });

  const deleteSet = useDeletePromptSet();

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteSet.mutateAsync(deleteId);
      toast.success('Prompt set deleted');
    } catch (err) {
      handleApiError(err, 'Failed to delete prompt set');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Languages className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Multi-Language Prompts</h1>
            <p className="text-sm text-muted-foreground">
              Manage prompt sets with per-language variants and coverage tracking
            </p>
          </div>
        </div>
        <Button onClick={() => setNewDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Prompt Set
        </Button>
      </div>

      {/* Stats */}
      <StatsHeader />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search prompt sets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={category || '__all__'}
          onValueChange={(v) => setCategory(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Language Coverage Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        <span>Coverage:</span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-blue-500" /> base language
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" /> translated
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="h-3 w-3 text-red-400" /> missing
        </span>
      </div>

      {/* Prompt Set List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (sets ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg">
          <Languages className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-medium">No prompt sets yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first multi-language prompt set to get started.
          </p>
          <Button
            className="mt-4"
            onClick={() => setNewDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Prompt Set
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {(sets ?? []).map((ps) => (
            <PromptSetRow
              key={ps.id}
              ps={ps}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </div>
      )}

      {/* New Prompt Set Dialog */}
      <NewPromptSetDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete prompt set?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the prompt set and all its language
              variants. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
