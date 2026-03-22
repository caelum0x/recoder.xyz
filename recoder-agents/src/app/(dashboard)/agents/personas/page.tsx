'use client';

import React, { useState } from 'react';
import {
  Plus,
  Bot,
  Pencil,
  Trash2,
  UserCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import {
  usePersonas,
  useCreatePersona,
  useUpdatePersona,
  useDeletePersona,
  useAssignPersona,
} from '@/hooks/agents/use-agent-personas';
import type { AgentPersona, PersonaTone, CreatePersonaData, UpdatePersonaData } from '@/lib/api/agent-personas';

const TONE_OPTIONS: PersonaTone[] = [
  'professional',
  'casual',
  'friendly',
  'formal',
  'technical',
  'creative',
];

const TONE_COLORS: Record<PersonaTone, string> = {
  professional: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  casual: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  friendly: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  formal: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  technical: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  creative: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
};

// ---- Create / Edit Dialog ----

interface PersonaFormData {
  avatar_emoji: string;
  persona_name: string;
  description: string;
  tone: PersonaTone;
  personality_traits: string;
  communication_style: string;
  custom_instructions: string;
}

const EMPTY_FORM: PersonaFormData = {
  avatar_emoji: '🤖',
  persona_name: '',
  description: '',
  tone: 'professional',
  personality_traits: '',
  communication_style: '',
  custom_instructions: '',
};

function personaToForm(p: AgentPersona): PersonaFormData {
  return {
    avatar_emoji: p.avatar_emoji,
    persona_name: p.persona_name,
    description: p.description ?? '',
    tone: p.tone,
    personality_traits: p.personality_traits.join(', '),
    communication_style: p.communication_style ?? '',
    custom_instructions: p.custom_instructions ?? '',
  };
}

interface PersonaDialogProps {
  open: boolean;
  onClose: () => void;
  editing?: AgentPersona | null;
}

function PersonaDialog({ open, onClose, editing }: PersonaDialogProps) {
  const [form, setForm] = useState<PersonaFormData>(
    editing ? personaToForm(editing) : EMPTY_FORM,
  );
  const createMutation = useCreatePersona();
  const updateMutation = useUpdatePersona();

  React.useEffect(() => {
    if (open) {
      setForm(editing ? personaToForm(editing) : EMPTY_FORM);
    }
  }, [open, editing]);

  const set = (field: keyof PersonaFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const busy = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    if (!form.persona_name.trim()) {
      toast.error('Persona name is required.');
      return;
    }
    const traits = form.personality_traits
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editing) {
        const data: UpdatePersonaData = {
          avatar_emoji: form.avatar_emoji,
          persona_name: form.persona_name,
          description: form.description || undefined,
          tone: form.tone,
          personality_traits: traits,
          communication_style: form.communication_style || undefined,
          custom_instructions: form.custom_instructions || undefined,
        };
        await updateMutation.mutateAsync({ personaId: editing.id, data });
        toast.success('Persona updated.');
      } else {
        const data: CreatePersonaData = {
          avatar_emoji: form.avatar_emoji,
          persona_name: form.persona_name,
          description: form.description || undefined,
          tone: form.tone,
          personality_traits: traits,
          communication_style: form.communication_style || undefined,
          custom_instructions: form.custom_instructions || undefined,
        };
        await createMutation.mutateAsync(data);
        toast.success('Persona created.');
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save persona.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Persona' : 'Create Persona'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-3">
            <div className="w-24">
              <Label htmlFor="avatar_emoji">Emoji</Label>
              <Input
                id="avatar_emoji"
                value={form.avatar_emoji}
                onChange={set('avatar_emoji')}
                className="text-2xl text-center"
                maxLength={4}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="persona_name">Name *</Label>
              <Input
                id="persona_name"
                value={form.persona_name}
                onChange={set('persona_name')}
                placeholder="e.g. Support Agent"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={set('description')}
              placeholder="Brief description of this persona"
            />
          </div>

          <div>
            <Label htmlFor="tone">Tone</Label>
            <Select
              value={form.tone}
              onValueChange={(v) => setForm((prev) => ({ ...prev, tone: v as PersonaTone }))}
            >
              <SelectTrigger id="tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="personality_traits">Personality Traits (comma-separated)</Label>
            <Input
              id="personality_traits"
              value={form.personality_traits}
              onChange={set('personality_traits')}
              placeholder="e.g. empathetic, concise, proactive"
            />
          </div>

          <div>
            <Label htmlFor="communication_style">Communication Style</Label>
            <Textarea
              id="communication_style"
              value={form.communication_style}
              onChange={set('communication_style')}
              placeholder="Describe how this persona communicates..."
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="custom_instructions">Custom Instructions</Label>
            <Textarea
              id="custom_instructions"
              value={form.custom_instructions}
              onChange={set('custom_instructions')}
              placeholder="Additional instructions for the agent..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Assign Dialog ----

interface AssignDialogProps {
  open: boolean;
  onClose: () => void;
  persona: AgentPersona;
}

function AssignDialog({ open, onClose, persona }: AssignDialogProps) {
  const [agentId, setAgentId] = useState('');
  const [overrideInstructions, setOverrideInstructions] = useState('');
  const assignMutation = useAssignPersona(agentId);

  React.useEffect(() => {
    if (open) {
      setAgentId('');
      setOverrideInstructions('');
    }
  }, [open]);

  const busy = assignMutation.isPending;

  const handleAssign = async () => {
    if (!agentId.trim()) {
      toast.error('Agent ID is required.');
      return;
    }
    try {
      await assignMutation.mutateAsync({
        persona_id: persona.id,
        override_instructions: overrideInstructions || undefined,
      });
      toast.success(`Persona "${persona.persona_name}" assigned to agent.`);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to assign persona.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Assign {persona.avatar_emoji} {persona.persona_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="agent_id">Agent ID *</Label>
            <Input
              id="agent_id"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Paste the agent ID here"
            />
          </div>
          <div>
            <Label htmlFor="override_instructions">Override Instructions (optional)</Label>
            <Textarea
              id="override_instructions"
              value={overrideInstructions}
              onChange={(e) => setOverrideInstructions(e.target.value)}
              placeholder="Override specific instructions for this assignment..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Persona Card ----

interface PersonaCardProps {
  persona: AgentPersona;
  onEdit: (p: AgentPersona) => void;
  onDelete: (p: AgentPersona) => void;
  onAssign: (p: AgentPersona) => void;
}

function PersonaCard({ persona, onEdit, onDelete, onAssign }: PersonaCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none select-none">{persona.avatar_emoji}</span>
          <div>
            <p className="font-semibold text-base leading-tight">{persona.persona_name}</p>
            {persona.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {persona.description}
              </p>
            )}
          </div>
        </div>
        <Badge className={TONE_COLORS[persona.tone]}>
          {persona.tone}
        </Badge>
      </div>

      {persona.personality_traits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {persona.personality_traits.map((trait) => (
            <Badge key={trait} variant="secondary" className="text-xs">
              {trait}
            </Badge>
          ))}
        </div>
      )}

      {persona.assignment_count !== undefined && (
        <p className="text-xs text-muted-foreground">
          Assigned to {persona.assignment_count} agent{persona.assignment_count !== 1 ? 's' : ''}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => onAssign(persona)} className="flex-1">
          <UserCheck className="h-3.5 w-3.5 mr-1.5" />
          Assign to Agent
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(persona)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(persona)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---- Page ----

export default function AgentPersonasPage() {
  const { data: personas, isLoading, error } = usePersonas();
  const deleteMutation = useDeletePersona();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<AgentPersona | null>(null);
  const [assignPersona, setAssignPersona] = useState<AgentPersona | null>(null);

  const handleDelete = async (persona: AgentPersona) => {
    if (!confirm(`Delete persona "${persona.persona_name}"? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(persona.id);
      toast.success('Persona deleted.');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete persona.');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Personas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define tone and personality profiles to attach to your agents.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Persona
        </Button>
      </div>

      {/* State: loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* State: error */}
      {error && (
        <div className="flex items-center gap-2 text-destructive py-8">
          <AlertCircle className="h-5 w-5" />
          <p>Failed to load personas: {error.message}</p>
        </div>
      )}

      {/* State: empty */}
      {!isLoading && !error && (!personas || personas.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Bot className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg font-medium">No personas yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Create your first persona to define how agents communicate with users.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Persona
          </Button>
        </div>
      )}

      {/* Grid */}
      {personas && personas.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              onEdit={(p) => setEditingPersona(p)}
              onDelete={handleDelete}
              onAssign={(p) => setAssignPersona(p)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <PersonaDialog
        open={createOpen || !!editingPersona}
        onClose={() => {
          setCreateOpen(false);
          setEditingPersona(null);
        }}
        editing={editingPersona}
      />

      {/* Assign Dialog */}
      {assignPersona && (
        <AssignDialog
          open={!!assignPersona}
          onClose={() => setAssignPersona(null)}
          persona={assignPersona}
        />
      )}
    </div>
  );
}
