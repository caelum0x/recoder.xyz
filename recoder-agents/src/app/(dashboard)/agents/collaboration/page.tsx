'use client';

import React, { useState } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Send,
  Bot,
  User,
  Info,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronRight,
  ArrowLeft,
  Target,
  ListTodo,
  MessageSquare,
  Play,
  Pause,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { toast } from '@/lib/toast';
import {
  useCollaborationRooms,
  useRoomDetail,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useRoomMessages,
  usePostMessage,
  useRoomTasks,
  useCreateTask,
  useUpdateTask,
} from '@/hooks/agents/use-collaboration-rooms';
import type {
  CollaborationRoom,
  CollaborationMessage,
  CollaborationTask,
} from '@/lib/api/collaboration-rooms';

// ============================================================================
// Constants
// ============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active: { label: 'Active', className: 'bg-green-500/10 text-green-600 dark:text-green-400', icon: Play },
  paused: { label: 'Paused', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: Pause },
  completed: { label: 'Completed', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', icon: CheckCircle2 },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground', icon: Archive },
};

const TASK_STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: 'Pending', className: 'bg-muted text-muted-foreground', icon: Clock },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', icon: Play },
  completed: { label: 'Completed', className: 'bg-green-500/10 text-green-600 dark:text-green-400', icon: CheckCircle2 },
  blocked: { label: 'Blocked', className: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: AlertCircle },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground', icon: XCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  high: { label: 'High', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  urgent: { label: 'Urgent', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
};

const SENDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  user: User,
  agent: Bot,
  system: Info,
};

const TASK_COLUMNS: CollaborationTask['status'][] = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
];

// ============================================================================
// Sub-components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  return <Badge className={`text-xs font-medium ${cfg.className}`}>{cfg.label}</Badge>;
}

function TaskStatusBadge({ status }: { status: string }) {
  const cfg = TASK_STATUS_CONFIG[status] ?? TASK_STATUS_CONFIG.pending;
  return <Badge className={`text-xs font-medium ${cfg.className}`}>{cfg.label}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return <Badge className={`text-xs font-medium ${cfg.className}`}>{cfg.label}</Badge>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// New Room Dialog
// ============================================================================

function NewRoomDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    room_name: '',
    description: '',
    agent_ids_raw: '',
    objective: '',
  });
  const createRoom = useCreateRoom();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.room_name.trim()) return;

    const agentIds = form.agent_ids_raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await createRoom.mutateAsync({
        room_name: form.room_name.trim(),
        description: form.description.trim() || undefined,
        agent_ids: agentIds,
        objective: form.objective.trim() || undefined,
      });
      toast.success('Collaboration room created');
      setOpen(false);
      setForm({ room_name: '', description: '', agent_ids_raw: '', objective: '' });
      onSuccess?.();
    } catch {
      toast.error('Failed to create room');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Room
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Collaboration Room</DialogTitle>
          <DialogDescription>
            Set up a room where agents can collaborate with you toward a shared objective.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="room_name">Room Name *</Label>
            <Input
              id="room_name"
              placeholder="e.g. Research Sprint #3"
              value={form.room_name}
              onChange={(e) => setForm((f) => ({ ...f, room_name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What is this room for?"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent_ids_raw">Agent IDs (comma-separated)</Label>
            <Input
              id="agent_ids_raw"
              placeholder="agent-123, agent-456"
              value={form.agent_ids_raw}
              onChange={(e) => setForm((f) => ({ ...f, agent_ids_raw: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="objective">Objective</Label>
            <Textarea
              id="objective"
              placeholder="Describe the goal for this collaboration..."
              rows={2}
              value={form.objective}
              onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRoom.isPending || !form.room_name.trim()}>
              {createRoom.isPending ? 'Creating...' : 'Create Room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Message Feed
// ============================================================================

function MessageFeed({ roomId }: { roomId: string }) {
  const { data: messages, isLoading } = useRoomMessages(roomId);
  const postMessage = usePostMessage();
  const [content, setContent] = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await postMessage.mutateAsync({
        roomId,
        data: { content: content.trim(), sender_type: 'user', message_type: 'text' },
      });
      setContent('');
    } catch {
      toast.error('Failed to send message');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RecoderLoader size="small" />
      </div>
    );
  }

  const msgs = messages ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 p-4 min-h-0">
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-10">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          msgs.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>
      <div className="border-t p-3">
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={postMessage.isPending || !content.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: CollaborationMessage }) {
  const SenderIcon = SENDER_ICONS[message.sender_type] ?? User;
  const isUser = message.sender_type === 'user';

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <SenderIcon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? 'items-end' : ''}`}>
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          {message.content}
        </div>
        <div className="flex items-center gap-1.5">
          {message.message_type !== 'text' && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              {message.message_type.replace('_', ' ')}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(message.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Task Board
// ============================================================================

function TaskBoard({ roomId }: { roomId: string }) {
  const { data: tasks, isLoading } = useRoomTasks(roomId);
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      await createTask.mutateAsync({
        roomId,
        data: { task_title: newTaskTitle.trim(), priority: newTaskPriority },
      });
      setNewTaskTitle('');
      toast.success('Task created');
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleStatusChange = async (
    task: CollaborationTask,
    newStatus: CollaborationTask['status']
  ) => {
    try {
      await updateTask.mutateAsync({
        roomId,
        taskId: task.id,
        data: { status: newStatus },
      });
    } catch {
      toast.error('Failed to update task');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RecoderLoader size="small" />
      </div>
    );
  }

  const allTasks = tasks ?? [];

  return (
    <div className="flex flex-col h-full gap-3 p-3">
      {/* Quick add form */}
      <form onSubmit={handleCreateTask} className="flex gap-2">
        <Input
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="New task title..."
          className="flex-1 h-8 text-sm"
        />
        <Select
          value={newTaskPriority}
          onValueChange={(v) => setNewTaskPriority(v as typeof newTaskPriority)}
        >
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" className="h-8 px-2" disabled={!newTaskTitle.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>

      {/* Board columns */}
      <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto">
        {TASK_COLUMNS.map((col) => {
          const colTasks = allTasks.filter((t) => t.status === col);
          const colCfg = TASK_STATUS_CONFIG[col];
          return (
            <div key={col} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <colCfg.icon className="h-3 w-3" />
                {colCfg.label}
                <span className="ml-auto text-[10px]">{colTasks.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 min-h-[60px]">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={(s) => handleStatusChange(task, s)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onStatusChange,
}: {
  task: CollaborationTask;
  onStatusChange: (s: CollaborationTask['status']) => void;
}) {
  return (
    <div className="rounded-md border bg-card p-2 text-xs space-y-1.5 hover:border-primary/50 transition-colors">
      <div className="font-medium leading-tight">{task.task_title}</div>
      <div className="flex items-center gap-1 flex-wrap">
        <PriorityBadge priority={task.priority} />
        {task.assigned_agent_id && (
          <span className="text-muted-foreground truncate max-w-[80px]">
            {task.assigned_agent_id}
          </span>
        )}
      </div>
      <Select
        value={task.status}
        onValueChange={(v) => onStatusChange(v as CollaborationTask['status'])}
      >
        <SelectTrigger className="h-6 text-[10px] w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TASK_STATUS_CONFIG).map(([v, c]) => (
            <SelectItem key={v} value={v} className="text-xs">
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// Room Detail View
// ============================================================================

function RoomDetailView({
  roomId,
  onBack,
}: {
  roomId: string;
  onBack: () => void;
}) {
  const { data: room, isLoading } = useRoomDetail(roomId);
  const updateRoom = useUpdateRoom();
  const [activeTab, setActiveTab] = useState<'messages' | 'tasks'>('messages');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RecoderLoader />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <AlertCircle className="h-8 w-8 opacity-30" />
        <p className="text-sm">Room not found</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Go Back
        </Button>
      </div>
    );
  }

  const handleStatusChange = async (newStatus: CollaborationRoom['status']) => {
    try {
      await updateRoom.mutateAsync({ roomId, data: { status: newStatus } });
      toast.success(`Room ${newStatus}`);
    } catch {
      toast.error('Failed to update room status');
    }
  };

  const nextActions: { label: string; status: CollaborationRoom['status']; icon: React.ComponentType<{ className?: string }> }[] = [];
  if (room.status === 'active') {
    nextActions.push({ label: 'Pause', status: 'paused', icon: Pause });
    nextActions.push({ label: 'Complete', status: 'completed', icon: CheckCircle2 });
  } else if (room.status === 'paused') {
    nextActions.push({ label: 'Resume', status: 'active', icon: Play });
    nextActions.push({ label: 'Complete', status: 'completed', icon: CheckCircle2 });
  } else if (room.status === 'completed') {
    nextActions.push({ label: 'Archive', status: 'archived', icon: Archive });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 w-7 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-semibold text-base">{room.room_name}</h2>
            {room.description && (
              <p className="text-xs text-muted-foreground">{room.description}</p>
            )}
          </div>
          <StatusBadge status={room.status} />
        </div>
        <div className="flex items-center gap-1.5">
          {nextActions.map((a) => (
            <Button
              key={a.status}
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleStatusChange(a.status)}
              disabled={updateRoom.isPending}
            >
              <a.icon className="h-3 w-3" />
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Objective banner */}
      {room.objective && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 border px-3 py-2 text-sm">
          <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground">{room.objective}</span>
        </div>
      )}

      {/* Agent count */}
      {room.agent_ids.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          <span>
            {room.agent_ids.length} agent{room.agent_ids.length !== 1 ? 's' : ''}:{' '}
            {room.agent_ids.join(', ')}
          </span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 border-b">
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-b-2 -mb-px ${
            activeTab === 'messages'
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('messages')}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Messages
        </button>
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-b-2 -mb-px ${
            activeTab === 'tasks'
              ? 'border-primary text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('tasks')}
        >
          <ListTodo className="h-3.5 w-3.5" />
          Tasks
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden border rounded-lg">
        {activeTab === 'messages' ? (
          <MessageFeed roomId={roomId} />
        ) : (
          <TaskBoard roomId={roomId} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Room List Item
// ============================================================================

function RoomListItem({
  room,
  onSelect,
  onDelete,
}: {
  room: CollaborationRoom;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors group"
      onClick={onSelect}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium truncate">{room.room_name}</CardTitle>
            {room.description && (
              <CardDescription className="text-xs truncate mt-0.5">
                {room.description}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge status={room.status} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {room.agent_ids.length} agent{room.agent_ids.length !== 1 ? 's' : ''}
          </span>
          {room.objective && (
            <span className="flex items-center gap-1 truncate">
              <Target className="h-3 w-3 shrink-0" />
              <span className="truncate">{room.objective}</span>
            </span>
          )}
          <span className="ml-auto">{formatDate(room.created_at)}</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function CollaborationPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const { data: rooms, isLoading } = useCollaborationRooms(
    statusFilter !== 'all' ? statusFilter : undefined
  );
  const deleteRoom = useDeleteRoom();

  const handleDeleteRoom = async (roomId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Delete this collaboration room and all its messages and tasks?')) return;
    try {
      await deleteRoom.mutateAsync(roomId);
      if (selectedRoomId === roomId) setSelectedRoomId(null);
      toast.success('Room deleted');
    } catch {
      toast.error('Failed to delete room');
    }
  };

  if (selectedRoomId) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <RoomDetailView
          roomId={selectedRoomId}
          onBack={() => setSelectedRoomId(null)}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Collaboration Rooms
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Multi-agent collaboration spaces with shared objectives, messages, and task boards.
          </p>
        </div>
        <NewRoomDialog />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'active', 'paused', 'completed', 'archived'] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs capitalize"
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {/* Room list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <RecoderLoader />
        </div>
      ) : !rooms || rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Users className="h-12 w-12 opacity-20" />
          <p className="text-sm font-medium">No collaboration rooms yet</p>
          <p className="text-xs">Create a room to start coordinating with agents.</p>
          <NewRoomDialog />
        </div>
      ) : (
        <div className="grid gap-3">
          {rooms.map((room) => (
            <RoomListItem
              key={room.id}
              room={room}
              onSelect={() => setSelectedRoomId(room.id)}
              onDelete={() => handleDeleteRoom(room.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
