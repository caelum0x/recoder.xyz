'use client';

export const dynamic = 'force-dynamic';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Video,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Clock,
  Bookmark,
  Filter,
  ChevronRight,
  Loader2,
  Activity,
  Hash,
  Bot,
  MessageSquare,
  Zap,
  Code2,
  FileText,
  Search,
  Plus,
  CheckCircle2,
  Circle,
  Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useRecordings,
  useRecordingDetail,
  useRecordingBookmarks,
  useAddBookmark,
} from '@/hooks/debugging/use-session-replay';
import type {
  SessionRecording,
  RecordingEvent,
  SessionBookmark,
} from '@/lib/api/session-replay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusIcon(status: string) {
  switch (status) {
    case 'recording':
      return <Circle className="h-3 w-3 text-red-500 fill-red-500" />;
    case 'completed':
      return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    case 'archived':
      return <Archive className="h-3 w-3 text-muted-foreground" />;
    default:
      return <Circle className="h-3 w-3 text-muted-foreground" />;
  }
}

function eventTypeIcon(type: string) {
  switch (type) {
    case 'message':
    case 'user_message':
      return <MessageSquare className="h-3.5 w-3.5 text-blue-500" />;
    case 'tool_call':
    case 'tool':
      return <Zap className="h-3.5 w-3.5 text-amber-500" />;
    case 'code':
    case 'code_execution':
      return <Code2 className="h-3.5 w-3.5 text-purple-500" />;
    case 'file':
    case 'file_operation':
      return <FileText className="h-3.5 w-3.5 text-emerald-500" />;
    case 'agent':
    case 'agent_response':
      return <Bot className="h-3.5 w-3.5 text-cyan-500" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recording list item
// ---------------------------------------------------------------------------

function RecordingListItem({
  recording,
  isSelected,
  onSelect,
}: {
  recording: SessionRecording;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg border transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-transparent hover:bg-muted/50',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-xs">
          {statusIcon(recording.status)}
          <span className="capitalize text-muted-foreground">{recording.status}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(recording.started_at)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm font-medium truncate">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{recording.thread_id}</span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        {recording.agent_id && (
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {recording.agent_id.slice(0, 8)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Hash className="h-3 w-3" />
          {recording.event_count} events
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(recording.duration_ms)}
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Timeline Scrubber
// ---------------------------------------------------------------------------

function TimelineScrubber({
  eventCount,
  currentIndex,
  bookmarks,
  onSeek,
}: {
  eventCount: number;
  currentIndex: number;
  bookmarks: SessionBookmark[];
  onSeek: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = eventCount > 0 ? (currentIndex / Math.max(eventCount - 1, 1)) * 100 : 0;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || eventCount === 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(Math.round(ratio * (eventCount - 1)));
    },
    [eventCount, onSeek],
  );

  return (
    <div className="px-3 py-2">
      <div
        ref={trackRef}
        onClick={handleClick}
        className="relative h-2 bg-muted rounded-full cursor-pointer group"
      >
        <div
          className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
        {/* Bookmark markers */}
        {bookmarks.map((bm) => {
          const bmPct =
            eventCount > 1 ? (bm.event_index / (eventCount - 1)) * 100 : 0;
          return (
            <div
              key={bm.id}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-amber-400 rounded-full border border-background"
              style={{ left: `${bmPct}%` }}
              title={bm.label}
            />
          );
        })}
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full border-2 border-background shadow-sm transition-all"
          style={{ left: `${pct}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground tabular-nums">
        <span>Event {currentIndex + 1}</span>
        <span>{eventCount} total</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Timeline
// ---------------------------------------------------------------------------

function EventTimeline({
  events,
  currentIndex,
  bookmarks,
  onSelectEvent,
}: {
  events: RecordingEvent[];
  currentIndex: number;
  bookmarks: SessionBookmark[];
  onSelectEvent: (index: number) => void;
}) {
  const bookmarkIndices = useMemo(
    () => new Set(bookmarks.map((b) => b.event_index)),
    [bookmarks],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current event
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current.children[currentIndex] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto space-y-px">
      {events.map((event, idx) => (
        <button
          key={idx}
          onClick={() => onSelectEvent(idx)}
          className={cn(
            'w-full flex items-start gap-2 px-3 py-2 text-left text-sm transition-colors rounded',
            idx === currentIndex
              ? 'bg-primary/10 border-l-2 border-primary'
              : 'hover:bg-muted/50 border-l-2 border-transparent',
          )}
        >
          <div className="mt-0.5 shrink-0">{eventTypeIcon(event.type)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium truncate">{event.type}</span>
              {bookmarkIndices.has(idx) && (
                <Bookmark className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
              )}
            </div>
            {event.data && Object.keys(event.data).length > 0 && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {JSON.stringify(event.data).slice(0, 80)}
              </p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            #{idx + 1}
          </span>
        </button>
      ))}
      {events.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No events recorded yet.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Detail (JSON viewer)
// ---------------------------------------------------------------------------

function EventDetail({
  event,
  index,
  recordingId,
}: {
  event: RecordingEvent | null;
  index: number;
  recordingId: string;
}) {
  const addBookmarkMutation = useAddBookmark();
  const [bookmarkLabel, setBookmarkLabel] = useState('');

  if (!event) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select an event to view details
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {eventTypeIcon(event.type)}
          <span className="font-medium text-sm">{event.type}</span>
          <span className="text-xs text-muted-foreground">Event #{index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Bookmark label..."
            value={bookmarkLabel}
            onChange={(e) => setBookmarkLabel(e.target.value)}
            className="h-7 px-2 text-xs rounded border border-border bg-background w-32 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={() => {
              if (!bookmarkLabel.trim()) return;
              addBookmarkMutation.mutate(
                { recordingId, body: { event_index: index, label: bookmarkLabel.trim() } },
                { onSuccess: () => setBookmarkLabel('') },
              );
            }}
            disabled={!bookmarkLabel.trim() || addBookmarkMutation.isPending}
            className="h-7 px-2 rounded bg-primary text-primary-foreground text-xs flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Bookmark
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/50 rounded-lg p-4 border border-border">
          {JSON.stringify(event.data, null, 2)}
        </pre>
        {event.timestamp && (
          <p className="mt-3 text-xs text-muted-foreground">
            Timestamp: {event.timestamp}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playback Controls
// ---------------------------------------------------------------------------

function PlaybackControls({
  isPlaying,
  speed,
  onTogglePlay,
  onSpeedChange,
  onStepBack,
  onStepForward,
}: {
  isPlaying: boolean;
  speed: number;
  onTogglePlay: () => void;
  onSpeedChange: (s: number) => void;
  onStepBack: () => void;
  onStepForward: () => void;
}) {
  const speeds = [0.5, 1, 2, 4];

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
      <button
        onClick={onStepBack}
        className="p-1.5 rounded hover:bg-muted transition-colors"
        title="Previous event"
      >
        <SkipBack className="h-4 w-4" />
      </button>
      <button
        onClick={onTogglePlay}
        className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        onClick={onStepForward}
        className="p-1.5 rounded hover:bg-muted transition-colors"
        title="Next event"
      >
        <SkipForward className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-1 ml-2">
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
              speed === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SessionReplayPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [filterThread, setFilterThread] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (filterThread) f.thread_id = filterThread;
    if (filterAgent) f.agent_id = filterAgent;
    if (filterStatus) f.status = filterStatus;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [filterThread, filterAgent, filterStatus]);

  const { data: recordings, isLoading: listLoading } = useRecordings(filters);
  const { data: detail, isLoading: detailLoading } = useRecordingDetail(selectedId);
  const { data: bookmarks = [] } = useRecordingBookmarks(selectedId);

  const events = detail?.events ?? [];

  // Playback timer
  const playRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isPlaying && events.length > 0) {
      playRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= events.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / speed);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [isPlaying, speed, events.length]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setCurrentIndex(0);
    setIsPlaying(false);
  }, []);

  // Stats
  const totalRecordings = recordings?.length ?? 0;
  const activeRecordings = recordings?.filter((r) => r.status === 'recording').length ?? 0;
  const totalEvents = recordings?.reduce((sum, r) => sum + r.event_count, 0) ?? 0;
  const avgDuration =
    totalRecordings > 0
      ? Math.round(
          (recordings?.reduce((sum, r) => sum + r.duration_ms, 0) ?? 0) / totalRecordings,
        )
      : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Video className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Session Replay</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Record, replay, and debug agent sessions with event-level detail.
        </p>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Recordings" value={totalRecordings} icon={Video} />
        <StatCard label="Active" value={activeRecordings} icon={Activity} />
        <StatCard label="Total Events" value={totalEvents} icon={Hash} />
        <StatCard label="Avg Duration" value={formatDuration(avgDuration)} icon={Clock} />
      </div>

      {/* Filters */}
      <div className="px-6 pb-3 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Thread ID..."
            value={filterThread}
            onChange={(e) => setFilterThread(e.target.value)}
            className="h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="relative">
          <Bot className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Agent ID..."
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All statuses</option>
          <option value="recording">Recording</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden border-t border-border">
        {/* Recordings list */}
        <div className="w-72 border-r border-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
            Recordings ({totalRecordings})
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {listLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recordings && recordings.length > 0 ? (
              recordings.map((rec) => (
                <RecordingListItem
                  key={rec.id}
                  recording={rec}
                  isSelected={selectedId === rec.id}
                  onSelect={() => handleSelect(rec.id)}
                />
              ))
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No recordings found.
              </div>
            )}
          </div>
        </div>

        {/* Replay viewer */}
        {selectedId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Scrubber */}
                <TimelineScrubber
                  eventCount={events.length}
                  currentIndex={currentIndex}
                  bookmarks={bookmarks}
                  onSeek={setCurrentIndex}
                />
                {/* Playback controls */}
                <PlaybackControls
                  isPlaying={isPlaying}
                  speed={speed}
                  onTogglePlay={() => setIsPlaying((p) => !p)}
                  onSpeedChange={setSpeed}
                  onStepBack={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  onStepForward={() =>
                    setCurrentIndex((i) => Math.min(events.length - 1, i + 1))
                  }
                />
                {/* Event timeline + detail split */}
                <div className="flex-1 flex overflow-hidden border-t border-border">
                  {/* Event timeline */}
                  <div className="w-72 border-r border-border flex flex-col overflow-hidden">
                    <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border flex items-center justify-between">
                      <span>Event Timeline</span>
                      <span className="tabular-nums">{events.length}</span>
                    </div>
                    <EventTimeline
                      events={events}
                      currentIndex={currentIndex}
                      bookmarks={bookmarks}
                      onSelectEvent={setCurrentIndex}
                    />
                  </div>
                  {/* Event detail */}
                  <EventDetail
                    event={events[currentIndex] ?? null}
                    index={currentIndex}
                    recordingId={selectedId}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Video className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a recording to start replay</p>
            <ChevronRight className="h-4 w-4 opacity-30" />
          </div>
        )}
      </div>
    </div>
  );
}
