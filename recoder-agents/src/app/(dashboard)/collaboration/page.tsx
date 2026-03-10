'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Users,
  MessageSquare,
  Plus,
  Send,
  Archive,
  CheckCircle,
  Code,
  Lightbulb,
  AlertCircle,
  Clock,
  Settings,
  Trash2,
  RotateCcw,
  BarChart3,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useCollaborationRooms,
  useRoom,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useRoomMessages,
  useSendMessage,
  useRoomSummary,
} from '@/hooks/collaboration/use-collaboration-rooms';
import type {
  CollaborationRoom,
  CollaborationMessage,
} from '@/lib/api/collaboration-rooms';

// ============================================================================
// Constants
// ============================================================================

const ROOM_TYPE_CONFIG = {
  discussion: { label: 'Discussion', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  review: { label: 'Review', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  debugging: { label: 'Debugging', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  planning: { label: 'Planning', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
} as const;

const MESSAGE_TYPE_CONFIG = {
  text: { label: 'Text', badge: null },
  code: { label: 'Code', badge: 'bg-purple-500/20 text-purple-400' },
  suggestion: { label: 'Suggestion', badge: 'bg-blue-500/20 text-blue-400' },
  decision: { label: 'Decision', badge: 'bg-green-500/20 text-green-400' },
  action_item: { label: 'Action Item', badge: 'bg-amber-500/20 text-amber-400' },
} as const;

const SENDER_COLORS = {
  user: 'bg-blue-600',
  agent: 'bg-purple-600',
  system: 'bg-zinc-600',
} as const;

// ============================================================================
// Helpers
// ============================================================================

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ============================================================================
// Create Room Dialog
// ============================================================================

function CreateRoomDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roomType, setRoomType] = useState('discussion');
  const [agentIdsInput, setAgentIdsInput] = useState('');

  const createRoom = useCreateRoom();

  const handleCreate = () => {
    if (!name.trim()) return;
    const agentIds = agentIdsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    createRoom.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        room_type: roomType,
        agent_ids: agentIds,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setDescription('');
          setRoomType('discussion');
          setAgentIdsInput('');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Collaboration Room</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Name</label>
            <Input
              placeholder="Room name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Description</label>
            <Textarea
              placeholder="What is this room for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-zinc-800 border-zinc-700 resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Room Type</label>
            <Select value={roomType} onValueChange={setRoomType}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="discussion">Discussion</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="debugging">Debugging</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Agent IDs (comma-separated)</label>
            <Input
              placeholder="agent-1, agent-2"
              value={agentIdsInput}
              onChange={(e) => setAgentIdsInput(e.target.value)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || createRoom.isPending}>
            {createRoom.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Room Card
// ============================================================================

function RoomCard({
  room,
  isSelected,
  onClick,
}: {
  room: CollaborationRoom;
  isSelected: boolean;
  onClick: () => void;
}) {
  const typeConfig = ROOM_TYPE_CONFIG[room.room_type] || ROOM_TYPE_CONFIG.discussion;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors border',
        isSelected
          ? 'bg-zinc-800 border-zinc-600'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm text-zinc-100 truncate">{room.name}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {room.status === 'active' && (
              <span className="w-2 h-2 rounded-full bg-green-500" title="Active" />
            )}
            {room.status === 'archived' && (
              <span className="w-2 h-2 rounded-full bg-zinc-500" title="Archived" />
            )}
            {room.status === 'resolved' && (
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', typeConfig.color)}>
            {typeConfig.label}
          </Badge>
          {room.agent_ids.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <Users className="w-3 h-3" />
              {room.agent_ids.length}
            </span>
          )}
          <span className="text-[10px] text-zinc-500 ml-auto">
            {relativeTime(room.updated_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Message Bubble
// ============================================================================

function MessageBubble({ message }: { message: CollaborationMessage }) {
  const senderColor = SENDER_COLORS[message.sender_type] || SENDER_COLORS.user;
  const typeConfig = MESSAGE_TYPE_CONFIG[message.message_type] || MESSAGE_TYPE_CONFIG.text;

  return (
    <div className="flex gap-2.5 py-1.5">
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium shrink-0 mt-0.5',
          senderColor
        )}
      >
        {(message.sender_name || message.sender_type).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300">
            {message.sender_name || message.sender_type}
          </span>
          {typeConfig.badge && (
            <Badge variant="outline" className={cn('text-[9px] px-1 py-0', typeConfig.badge)}>
              {typeConfig.label}
            </Badge>
          )}
          <span className="text-[10px] text-zinc-600 ml-auto shrink-0">
            {relativeTime(message.created_at)}
          </span>
        </div>
        {message.message_type === 'code' ? (
          <pre className="text-xs bg-zinc-950 border border-zinc-800 rounded-md p-2.5 overflow-x-auto font-mono text-zinc-300 whitespace-pre-wrap break-words">
            {message.content}
          </pre>
        ) : (
          <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Room Detail Panel
// ============================================================================

function RoomDetailPanel({
  roomId,
  onClose,
}: {
  roomId: string;
  onClose: () => void;
}) {
  const { data: room, isLoading: roomLoading } = useRoom(roomId);
  const { data: messages = [] } = useRoomMessages(roomId);
  const { data: summary } = useRoomSummary(roomId);
  const updateRoom = useUpdateRoom();
  const deleteRoomMutation = useDeleteRoom();
  const sendMessageMutation = useSendMessage();

  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [showSummary, setShowSummary] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const handleSend = useCallback(() => {
    if (!messageText.trim()) return;
    sendMessageMutation.mutate(
      {
        roomId,
        data: {
          content: messageText.trim(),
          message_type: messageType,
        },
      },
      {
        onSuccess: () => {
          setMessageText('');
        },
      }
    );
  }, [messageText, messageType, roomId, sendMessageMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleStatusChange = (newStatus: string) => {
    updateRoom.mutate({ roomId, data: { status: newStatus } });
  };

  const handleDelete = () => {
    deleteRoomMutation.mutate(roomId, {
      onSuccess: () => onClose(),
    });
  };

  if (roomLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        Loading room...
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        Room not found
      </div>
    );
  }

  const typeConfig = ROOM_TYPE_CONFIG[room.room_type] || ROOM_TYPE_CONFIG.discussion;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-semibold text-zinc-100 truncate">{room.name}</h2>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', typeConfig.color)}>
              {typeConfig.label}
            </Badge>
            {room.agent_ids.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                <Users className="w-3 h-3" /> {room.agent_ids.length} agents
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {room.status === 'active' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleStatusChange('archived')}
                >
                  <Archive className="w-3 h-3" /> Archive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleStatusChange('resolved')}
                >
                  <CheckCircle className="w-3 h-3" /> Resolve
                </Button>
              </>
            )}
            {(room.status === 'archived' || room.status === 'resolved') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleStatusChange('active')}
              >
                <RotateCcw className="w-3 h-3" /> Reopen
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-zinc-500 hover:text-zinc-300"
              onClick={() => setShowSummary(!showSummary)}
            >
              <BarChart3 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-red-400 hover:text-red-300"
              onClick={handleDelete}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        {room.description && (
          <p className="text-xs text-zinc-500">{room.description}</p>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Messages */}
        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
                <MessageSquare className="w-8 h-8" />
                <p className="text-sm">No messages yet. Start the conversation.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <div className="px-4 py-3 border-t border-zinc-800">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Textarea
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="bg-zinc-800 border-zinc-700 resize-none min-h-[38px] max-h-[120px] text-sm"
                />
              </div>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger className="w-[120px] bg-zinc-800 border-zinc-700 h-[38px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="code">Code</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                  <SelectItem value="decision">Decision</SelectItem>
                  <SelectItem value="action_item">Action Item</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-[38px] px-3"
                onClick={handleSend}
                disabled={!messageText.trim() || sendMessageMutation.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary sidebar */}
        {showSummary && summary && (
          <div className="w-56 border-l border-zinc-800 px-3 py-4 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Summary
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Messages
                </span>
                <span className="text-zinc-300">{summary.message_count}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Participants
                </span>
                <span className="text-zinc-300">{summary.unique_participants}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Action Items
                </span>
                <span className="text-zinc-300">{summary.action_items_count}</span>
              </div>
              <Separator className="bg-zinc-800" />
              <div className="text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last activity:{' '}
                  {summary.last_activity ? relativeTime(summary.last_activity) : 'None'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function CollaborationPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const { data: rooms = [], isLoading } = useCollaborationRooms(
    statusFilter !== 'all' ? statusFilter : undefined
  );

  // Apply client-side type filter
  const filteredRooms =
    typeFilter === 'all' ? rooms : rooms.filter((r) => r.room_type === typeFilter);

  return (
    <div className="flex h-[calc(100dvh-4rem)] bg-zinc-950">
      {/* Left panel - Room list */}
      <div className="w-80 border-r border-zinc-800 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold text-zinc-100">Collaboration</h1>
            </div>
            <CreateRoomDialog>
              <Button size="sm" className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> New Room
              </Button>
            </CreateRoomDialog>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 h-7 text-xs flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 h-7 text-xs flex-1">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="discussion">Discussion</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="debugging">Debugging</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Room list */}
        <ScrollArea className="flex-1 px-3 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500 text-sm">
              Loading rooms...
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-3">
              <Users className="w-10 h-10 text-zinc-700" />
              <p className="text-sm text-center">Create your first collaboration room</p>
              <CreateRoomDialog>
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <Plus className="w-3 h-3" /> New Room
                </Button>
              </CreateRoomDialog>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  isSelected={selectedRoomId === room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right panel - Room detail */}
      {selectedRoomId ? (
        <RoomDetailPanel
          key={selectedRoomId}
          roomId={selectedRoomId}
          onClose={() => setSelectedRoomId(null)}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-3">
          <MessageSquare className="w-12 h-12 text-zinc-700" />
          <p className="text-sm">Select a room to start collaborating</p>
        </div>
      )}
    </div>
  );
}
