'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  X,
  Send,
  CheckCircle2,
  Circle,
  Reply,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  useAgentComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
  useCommentCounts,
  type AgentComment,
} from '@/hooks/agents/use-agent-comments';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentPanelProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
}

type SectionFilter = 'all' | 'general' | 'instructions' | 'tools' | 'knowledge' | 'triggers' | 'performance';

const SECTIONS: { id: SectionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'tools', label: 'Tools' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'performance', label: 'Performance' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommentPanel({ agentId, isOpen, onClose }: CommentPanelProps) {
  const [activeSection, setActiveSection] = useState<SectionFilter>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newCommentSection, setNewCommentSection] = useState<SectionFilter>('general');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const filters = useMemo(() => ({
    section: activeSection !== 'all' ? activeSection : undefined,
    resolved: showResolved ? undefined : false,
  }), [activeSection, showResolved]);

  const { data: commentsData, isLoading } = useAgentComments(agentId, filters);
  const { data: countsData } = useCommentCounts(agentId);
  const createMutation = useCreateComment();
  const updateMutation = useUpdateComment();
  const deleteMutation = useDeleteComment();

  const comments = commentsData?.comments ?? [];

  // Group comments into threads
  const { topLevel, replies } = useMemo(() => {
    const topLevel: AgentComment[] = [];
    const replies: Record<string, AgentComment[]> = {};

    for (const c of comments) {
      if (!c.parent_id) {
        topLevel.push(c);
      } else {
        if (!replies[c.parent_id]) replies[c.parent_id] = [];
        replies[c.parent_id].push(c);
      }
    }

    return { topLevel, replies };
  }, [comments]);

  const handleSubmitComment = useCallback(() => {
    if (!newComment.trim()) return;
    createMutation.mutate(
      {
        agentId,
        data: {
          content: newComment.trim(),
          section: newCommentSection === 'all' ? 'general' : newCommentSection,
        },
      },
      {
        onSuccess: () => {
          setNewComment('');
        },
      }
    );
  }, [agentId, newComment, newCommentSection, createMutation]);

  const handleSubmitReply = useCallback(
    (parentId: string) => {
      if (!replyContent.trim()) return;
      // Get the parent's section
      const parent = comments.find((c) => c.id === parentId);
      createMutation.mutate(
        {
          agentId,
          data: {
            content: replyContent.trim(),
            section: parent?.section ?? 'general',
            parent_id: parentId,
          },
        },
        {
          onSuccess: () => {
            setReplyContent('');
            setReplyingTo(null);
          },
        }
      );
    },
    [agentId, replyContent, comments, createMutation]
  );

  const handleToggleResolve = useCallback(
    (comment: AgentComment) => {
      updateMutation.mutate({
        agentId,
        commentId: comment.id,
        data: { is_resolved: !comment.is_resolved },
      });
    },
    [agentId, updateMutation]
  );

  const handleDelete = useCallback(
    (commentId: string) => {
      deleteMutation.mutate({ agentId, commentId });
    },
    [agentId, deleteMutation]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-background border-l shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Comments</h2>
          {countsData && countsData.total_unresolved > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
              {countsData.total_unresolved}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowResolved(!showResolved)}
            title={showResolved ? 'Hide resolved' : 'Show resolved'}
          >
            {showResolved ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Section filter tabs */}
      <div className="flex gap-1 p-2 border-b overflow-x-auto">
        {SECTIONS.map((s) => {
          const sectionCount = s.id === 'all'
            ? countsData?.total_unresolved ?? 0
            : countsData?.by_section?.[s.id]?.unresolved ?? 0;

          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors flex items-center gap-1',
                activeSection === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {s.label}
              {sectionCount > 0 && (
                <span className={cn(
                  'text-[10px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1',
                  activeSection === s.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-destructive/10 text-destructive'
                )}>
                  {sectionCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Comment list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))
          ) : topLevel.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No comments yet</p>
              <p className="text-xs mt-1">Add a comment below to start the conversation.</p>
            </div>
          ) : (
            topLevel.map((comment) => (
              <div key={comment.id} className="space-y-2">
                <CommentItem
                  comment={comment}
                  onToggleResolve={() => handleToggleResolve(comment)}
                  onDelete={() => handleDelete(comment.id)}
                  onReply={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                  isReplying={replyingTo === comment.id}
                />

                {/* Replies */}
                {replies[comment.id]?.map((reply) => (
                  <div key={reply.id} className="ml-6">
                    <CommentItem
                      comment={reply}
                      onToggleResolve={() => handleToggleResolve(reply)}
                      onDelete={() => handleDelete(reply.id)}
                      isReply
                    />
                  </div>
                ))}

                {/* Reply input */}
                {replyingTo === comment.id && (
                  <div className="ml-6 flex gap-2">
                    <Textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      className="min-h-[60px] text-sm resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handleSubmitReply(comment.id);
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      disabled={!replyContent.trim() || createMutation.isPending}
                      onClick={() => handleSubmitReply(comment.id)}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* New comment form */}
      <div className="border-t p-3 space-y-2">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {SECTIONS.filter((s) => s.id !== 'all').map((s) => (
            <button
              key={s.id}
              onClick={() => setNewCommentSection(s.id)}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-md whitespace-nowrap transition-colors',
                newCommentSection === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted border'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[60px] text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmitComment();
              }
            }}
          />
          <Button
            size="icon"
            className="h-8 w-8 flex-shrink-0 self-end"
            disabled={!newComment.trim() || createMutation.isPending}
            onClick={handleSubmitComment}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Press Cmd+Enter to submit</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comment Item
// ---------------------------------------------------------------------------

function CommentItem({
  comment,
  onToggleResolve,
  onDelete,
  onReply,
  isReply = false,
  isReplying = false,
}: {
  comment: AgentComment;
  onToggleResolve: () => void;
  onDelete: () => void;
  onReply?: () => void;
  isReply?: boolean;
  isReplying?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        comment.is_resolved ? 'bg-muted/30 opacity-60' : 'bg-background',
        isReply && 'border-l-2 border-l-primary/30'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
              {comment.section}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {comment.content}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onToggleResolve}
          title={comment.is_resolved ? 'Mark unresolved' : 'Resolve'}
        >
          {comment.is_resolved ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Button>
        {!isReply && onReply && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', isReplying && 'bg-muted')}
            onClick={onReply}
            title="Reply"
          >
            <Reply className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive/60 hover:text-destructive"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
