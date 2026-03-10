'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useCreateThreadTemplate } from '@/hooks/threads/use-thread-templates';
import { toast } from '@/lib/toast';

interface Message {
  role: string;
  content: string;
}

interface SaveAsTemplateDialogProps {
  threadName?: string;
  agentId?: string;
  messages?: Message[];
}

const CATEGORIES = ['general', 'coding', 'research', 'writing', 'analysis'];

export function SaveAsTemplateDialog({
  threadName,
  agentId,
  messages = [],
}: SaveAsTemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(threadName || '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [selectedMessages, setSelectedMessages] = useState<boolean[]>(
    messages.slice(0, 10).map(() => true)
  );
  const createTemplate = useCreateThreadTemplate();

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    const filteredMessages = messages
      .slice(0, 10)
      .filter((_, i) => selectedMessages[i])
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      await createTemplate.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        agent_id: agentId || undefined,
        initial_messages: filteredMessages,
        category,
      });
      toast.success('Thread saved as template');
      setOpen(false);
    } catch {
      toast.error('Failed to save template');
    }
  };

  // Reset form state when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(threadName || '');
      setDescription('');
      setCategory('general');
      setSelectedMessages(messages.slice(0, 10).map(() => true));
    }
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Save className="h-4 w-4" />
          <span className="hidden sm:inline">Save as Template</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save as Thread Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Template Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Code Review Session"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
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
          {messages.length > 0 && (
            <div className="space-y-2">
              <Label>
                Include Messages ({selectedMessages.filter(Boolean).length} selected)
              </Label>
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                {messages.slice(0, 10).map((msg, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2 text-xs p-1 rounded hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMessages[i] ?? false}
                      onChange={(e) => {
                        const next = [...selectedMessages];
                        next[i] = e.target.checked;
                        setSelectedMessages(next);
                      }}
                      className="mt-0.5"
                    />
                    <span className="font-medium text-muted-foreground w-14 shrink-0">
                      {msg.role}
                    </span>
                    <span className="truncate">{msg.content.slice(0, 100)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createTemplate.isPending}>
            {createTemplate.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
