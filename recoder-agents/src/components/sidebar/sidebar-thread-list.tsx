'use client';

import { useState, useMemo, startTransition, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Frown,
  ExternalLink,
  Pencil,
  Pin,
  PinOff,
  Archive,
  CheckSquare,
  Tag,
} from 'lucide-react';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { ThreadIcon } from './thread-icon';
import { toast } from '@/lib/toast';
import Link from 'next/link';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { DeleteConfirmationDialog } from '@/components/thread/DeleteConfirmationDialog';
import { Button } from '@/components/ui/button';
import {
  ThreadWithProject,
  ProjectGroup,
  GroupedByDateThenProject,
  groupThreadsByDateThenProject,
} from '@/hooks/sidebar/use-sidebar';
import {
  useDeleteMultipleThreads,
  useDeleteThread,
} from '@/hooks/sidebar/use-sidebar';
import { threadKeys, projectKeys } from '@/hooks/threads/keys';
import { useThreadAgentStatuses } from '@/hooks/threads';
import { formatDateForList } from '@/lib/utils/date-formatting';
import { createThreadInProject } from '@/lib/api/threads';
import { useThreads } from '@/hooks/threads/use-threads';
import { useTranslations } from 'next-intl';
import { useDeleteOperation } from '@/stores/delete-operation-store';
import { useStartNavigation } from '@/stores/thread-navigation-store';
import { useUpdateProject } from '@/hooks/threads/use-project';
import { RenameProjectDialog } from '@/components/sidebar/rename-project-dialog';
import { usePinnedThreads, useTogglePin } from '@/hooks/threads/use-pinned-threads';
import { Checkbox } from '@/components/ui/checkbox';
import { ThreadTagDots, TagSelectorPopover, TagFilterDropdown } from '@/components/thread/thread-tag-manager';
import { useTaggedThreads } from '@/hooks/threads/use-thread-tags';
import { ArchivedThreadsSection } from '@/components/sidebar/archived-threads';
import { useBulkArchiveThreads } from '@/hooks/threads/use-thread-bulk';
import { ThreadFolderList } from '@/components/sidebar/thread-folder-list';
import { useFolderThreads } from '@/hooks/threads/use-thread-folders';

// Date group header component - shared across tabs
const DateGroupHeader: React.FC<{ dateGroup: string }> = ({ dateGroup }) => {
  return (
    <div className="py-2 mt-4 first:mt-2">
      <div className="text-xs font-medium text-muted-foreground px-2.5">
        {dateGroup}
      </div>
    </div>
  );
};

// Item card props for unified styling
interface ThreadItemCardProps {
  thread: ThreadWithProject;
  projectGroup: ProjectGroup;
  isActive: boolean;
  isThreadLoading: boolean;
  isAgentRunning: boolean;
  onClick: (e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>, threadId: string, url: string) => void;
  onDelete: (threadId: string, threadName: string) => void;
  onRename: (projectId: string, currentName: string) => void;
  onCreateNewChat?: (projectId: string) => Promise<void>;
  isCreatingChat?: boolean;
  mode: 'chats' | 'library';
  isPinned?: boolean;
  onTogglePin?: (threadId: string, isPinned: boolean) => void;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (threadId: string) => void;
  onArchive?: (threadId: string) => void;
}

// Unified thread item card - used by both tabs
const ThreadItemCard: React.FC<ThreadItemCardProps> = ({
  thread,
  projectGroup,
  isActive,
  isThreadLoading,
  isAgentRunning,
  onClick,
  onDelete,
  onRename,
  onCreateNewChat,
  isCreatingChat = false,
  mode,
  isPinned = false,
  onTogglePin,
  isMultiSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onArchive,
}) => {
  const [isHoveringCard, setIsHoveringCard] = useState(false);

  const handleCardClick = (e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>) => {
    if (isMultiSelectMode && onToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(thread.threadId);
      return;
    }
    onClick(e, thread.threadId, thread.url);
  };

  const CardWrapper = mode === 'chats' ? Link : 'div';
  const cardProps = mode === 'chats'
    ? { href: thread.url, prefetch: true, onClick: handleCardClick }
    : { onClick: handleCardClick };

  const threadUrl = thread.url;

  return (
    <SpotlightCard
      className={cn(
        "transition-colors cursor-pointer",
        isActive ? "bg-muted" : "bg-transparent",
        isSelected ? "bg-primary/5 ring-1 ring-primary/20" : ""
      )}
    >
      <CardWrapper
        {...(cardProps as any)}
        className="block"
      >
        <div
          className="flex items-center gap-3 p-2.5 text-sm"
          onMouseEnter={() => setIsHoveringCard(true)}
          onMouseLeave={() => setIsHoveringCard(false)}
        >
          {/* Checkbox for multi-select */}
          {isMultiSelectMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(thread.threadId)}
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0"
            />
          )}

          {/* Icon */}
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0">
            {isThreadLoading ? (
              <RecoderLoader size="small" />
            ) : (
              <ThreadIcon
                iconName={projectGroup.iconName}
                className="text-muted-foreground"
                size={14}
              />
            )}
            {isAgentRunning && (
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-background animate-pulse" />
            )}
          </div>
          
          {/* Name + Tag dots */}
          <div className="flex items-center flex-1 min-w-0">
            <span className="truncate">{projectGroup.projectName}</span>
            <ThreadTagDots threadId={thread.threadId} />
          </div>
          
          {/* Date & Menu */}
          <div className="flex-shrink-0 relative">
            <span
              className={cn(
                "text-xs text-muted-foreground transition-opacity",
                isHoveringCard ? "opacity-0" : "opacity-100"
              )}
            >
              {formatDateForList(thread.updatedAt)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "absolute top-1/2 right-0 -translate-y-1/2 p-1 rounded-2xl hover:bg-accent transition-all text-muted-foreground",
                    isHoveringCard ? "opacity-100" : "opacity-0 pointer-events-none"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <MoreHorizontal className="h-4 w-4 rotate-90" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {mode === 'library' && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(threadUrl, '_blank');
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open chat
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {mode === 'chats' && onCreateNewChat && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onCreateNewChat(projectGroup.projectId);
                    }}
                    disabled={isCreatingChat}
                  >
                    {isCreatingChat ? (
                      <RecoderLoader size="small" className="mr-2" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    New chat
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRename(projectGroup.projectId, projectGroup.projectName);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                {onTogglePin && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTogglePin(thread.threadId, isPinned);
                    }}
                  >
                    {isPinned ? (
                      <PinOff className="mr-2 h-4 w-4" />
                    ) : (
                      <Pin className="mr-2 h-4 w-4" />
                    )}
                    {isPinned ? 'Unpin' : 'Pin to top'}
                  </DropdownMenuItem>
                )}
                <TagSelectorPopover threadId={thread.threadId}>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    Tags
                  </DropdownMenuItem>
                </TagSelectorPopover>
                {onArchive && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onArchive(thread.threadId);
                    }}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(thread.threadId, thread.projectName);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardWrapper>
    </SpotlightCard>
  );
};

// Props for the unified sidebar list
export interface SidebarThreadListProps {
  mode: 'chats' | 'library';
}

export function SidebarThreadList({ mode }: SidebarThreadListProps) {
  const t = useTranslations('sidebar');
  const { isMobile, state, setOpenMobile } = useSidebar();
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const startNavigation = useStartNavigation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<{ id: string; name: string } | null>(null);
  const isNavigatingRef = useRef(false);
  const { performDelete } = useDeleteOperation();
  const isPerformingActionRef = useRef(false);
  const queryClient = useQueryClient();

  const [selectedThreads, setSelectedThreads] = useState<Set<string>>(new Set());
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [totalToDelete, setTotalToDelete] = useState(0);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  
  // Rename state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameProjectName, setRenameProjectName] = useState('');
  const updateProjectMutation = useUpdateProject();

  // Tag filter state
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const { data: taggedThreadIds } = useTaggedThreads(filterTagId || '');

  // Folder filter state
  const [filterFolderId, setFilterFolderId] = useState<string | null>(null);
  const { data: folderThreadIds } = useFolderThreads(filterFolderId || '');

  // Pinned threads
  const { data: pinnedThreads = [] } = usePinnedThreads();
  const togglePinMutation = useTogglePin();
  const pinnedThreadIds = useMemo(
    () => new Set(pinnedThreads.map((pt) => pt.thread_id)),
    [pinnedThreads]
  );

  // Bulk operations
  const bulkArchiveMutation = useBulkArchiveThreads();

  const handleTogglePin = (threadId: string, isPinned: boolean) => {
    togglePinMutation.mutate({ threadId, isPinned });
  };

  // Archive single thread
  const handleArchiveThread = (threadId: string) => {
    bulkArchiveMutation.mutate([threadId], {
      onSuccess: () => {
        toast.success('Thread archived');
      },
      onError: () => {
        toast.error('Failed to archive thread');
      },
    });
  };

  // Archive selected threads
  const handleMultiArchive = () => {
    if (selectedThreads.size === 0) return;
    const ids = Array.from(selectedThreads);
    bulkArchiveMutation.mutate(ids, {
      onSuccess: (data) => {
        toast.success(`Archived ${data.archived} thread${data.archived !== 1 ? 's' : ''}`);
        setSelectedThreads(new Set());
        setIsMultiSelectMode(false);
      },
      onError: () => {
        toast.error('Failed to archive threads');
      },
    });
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 20;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch threads - use higher limit for library to show more items
  const {
    data: threadsResponse,
    isLoading: isThreadsLoading,
    isFetching: isThreadsFetching,
    error: threadsError,
  } = useThreads({
    page: currentPage,
    limit: mode === 'library' ? 50 : pageLimit,
  });

  const { mutate: deleteThreadMutation, isPending: isDeletingSingle } = useDeleteThread();
  const {
    mutate: deleteMultipleThreadsMutation,
    isPending: isDeletingMultiple,
  } = useDeleteMultipleThreads();

  const currentThreads = useMemo(() => threadsResponse?.threads || [], [threadsResponse?.threads]);

  // Reset pagination when total thread count changes
  const previousTotalRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (threadsResponse?.pagination) {
      const currentTotal = threadsResponse.pagination.total;
      if (
        previousTotalRef.current !== undefined &&
        currentTotal < previousTotalRef.current &&
        currentPage > 1
      ) {
        setCurrentPage(1);
      }
      previousTotalRef.current = currentTotal;
    }
  }, [threadsResponse?.pagination, currentPage]);

  // Process threads
  const combinedThreads: ThreadWithProject[] = useMemo(() => {
    if (currentThreads.length === 0) {
      return [];
    }

    const processed: ThreadWithProject[] = [];

    for (const thread of currentThreads) {
      const projectId = thread.project_id;
      const project = thread.project;

      // Use thread_id as fallback project_id when project_id is missing
      // This prevents threads from being silently dropped from the sidebar
      const effectiveProjectId = projectId || thread.thread_id;

      const displayName = project?.name || thread.name || 'Untitled Chat';
      const iconName = project?.icon_name;
      const updatedAt = thread.updated_at || project?.updated_at || new Date().toISOString();
      const formattedDate = formatDateForList(updatedAt);

      processed.push({
        threadId: thread.thread_id,
        projectId: effectiveProjectId,
        projectName: displayName,
        threadName: thread.name && thread.name.trim() ? thread.name : formattedDate,
        url: projectId
          ? `/projects/${projectId}/thread/${thread.thread_id}`
          : `/thread/${thread.thread_id}`,
        updatedAt: updatedAt,
        iconName: iconName,
      });
    }

    return processed.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [currentThreads]);

  // Apply tag filter to threads
  const tagFilteredThreads = useMemo(() => {
    if (!filterTagId || !taggedThreadIds) return combinedThreads;
    const taggedIds = new Set(taggedThreadIds.map((t) => t.thread_id));
    return combinedThreads.filter((t) => taggedIds.has(t.threadId));
  }, [combinedThreads, filterTagId, taggedThreadIds]);

  // Apply folder filter to threads
  const folderAndTagFilteredThreads = useMemo(() => {
    if (!filterFolderId || !folderThreadIds) return tagFilteredThreads;
    const folderIds = new Set(folderThreadIds.map((t) => t.thread_id));
    return tagFilteredThreads.filter((t) => folderIds.has(t.threadId));
  }, [tagFilteredThreads, filterFolderId, folderThreadIds]);

  // Split threads into pinned and unpinned
  const pinnedCombinedThreads = useMemo(
    () => folderAndTagFilteredThreads.filter((t) => pinnedThreadIds.has(t.threadId)),
    [folderAndTagFilteredThreads, pinnedThreadIds]
  );
  const unpinnedCombinedThreads = useMemo(
    () => folderAndTagFilteredThreads.filter((t) => !pinnedThreadIds.has(t.threadId)),
    [folderAndTagFilteredThreads, pinnedThreadIds]
  );

  // Group unpinned threads by date, then by project
  const groupedByDateThenProject: GroupedByDateThenProject =
    groupThreadsByDateThenProject(unpinnedCombinedThreads);

  // Initialize expanded projects
  useEffect(() => {
    const allProjectIds = Object.values(groupedByDateThenProject).flatMap((dateGroup) =>
      Object.keys(dateGroup)
    );
    if (allProjectIds.length > 0 && expandedProjects.size === 0) {
      setExpandedProjects(new Set(allProjectIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedByDateThenProject]);

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // Handle creating a new chat
  const handleCreateNewChat = async (projectId: string) => {
    if (isCreatingChat) return;

    setIsCreatingChat(true);
    try {
      const result = await createThreadInProject(projectId);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: threadKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      ]);

      router.push(`/projects/${projectId}/thread/${result.thread_id}`);
      toast.success('New chat created');
    } catch (error) {
      console.error('Failed to create chat:', error);
      toast.error('Failed to create new chat');
    } finally {
      setTimeout(() => setIsCreatingChat(false), 1000);
    }
  };

  // Handle rename
  const handleStartRename = (projectId: string, currentName: string) => {
    setRenameProjectId(projectId);
    setRenameProjectName(currentName);
    setRenameDialogOpen(true);
  };

  const handleSaveRename = async (projectId: string, newName: string) => {
    try {
      await updateProjectMutation.mutateAsync({
        projectId,
        data: { name: newName }
      });
      await queryClient.invalidateQueries({ queryKey: threadKeys.all });
      toast.success('Renamed successfully');
    } catch (error) {
      console.error('Failed to rename:', error);
      toast.error('Failed to rename');
      throw error;
    }
  };

  const handleCloseRenameDialog = () => {
    setRenameDialogOpen(false);
    setRenameProjectId(null);
    setRenameProjectName('');
  };

  // Pagination helpers
  const pagination = threadsResponse?.pagination;
  const totalPages = pagination?.pages || 1;
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const handlePreviousPage = () => {
    if (canGoPrevious) {
      setCurrentPage((prev) => prev - 1);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (canGoNext) {
      setCurrentPage((prev) => prev + 1);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Track agent running status
  const threadIds = combinedThreads.map((thread) => thread.threadId);
  const agentStatusMap = useThreadAgentStatuses(threadIds);

  const handleDeletionProgress = (completed: number, total: number) => {
    const percentage = (completed / total) * 100;
    setDeleteProgress(percentage);
  };

  useEffect(() => {
    setLoadingThreadId(null);
  }, [pathname]);

  useEffect(() => {
    const handleNavigationComplete = () => {
      document.body.style.pointerEvents = 'auto';
      isNavigatingRef.current = false;
    };

    window.addEventListener('popstate', handleNavigationComplete);

    return () => {
      window.removeEventListener('popstate', handleNavigationComplete);
      document.body.style.pointerEvents = 'auto';
    };
  }, []);

  useEffect(() => {
    isNavigatingRef.current = false;
    document.body.style.pointerEvents = 'auto';
  }, [pathname]);

  // Handle thread/item click - different behavior for chats vs library
  const handleItemClick = (
    e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>,
    threadId: string,
    url: string
  ) => {
    // Check if selected in multi-select mode
    if (selectedThreads.has(threadId)) {
      e.preventDefault();
      return;
    }

    // Cmd/Ctrl+click opens new tab
    if (e.metaKey || e.ctrlKey) {
      if (mode === 'library') {
        const thread = combinedThreads.find((t) => t.threadId === threadId);
        if (thread) {
          window.open(url, '_blank');
        }
      }
      return;
    }

    e.preventDefault();

    const thread = combinedThreads.find((t) => t.threadId === threadId);
    if (!thread) return;

    if (mode === 'chats') {
      // Optimistic navigation for chats
      startNavigation({
        threadId: thread.threadId,
        projectId: thread.projectId,
        projectName: thread.projectName,
        iconName: thread.iconName,
      });
      setLoadingThreadId(threadId);
    }

    if (isMobile) {
      setOpenMobile(false);
    }

    // Navigate to appropriate destination
    const destination = mode === 'library' ? '/files' : url;
    startTransition(() => {
      router.push(destination);
    });
  };

  // Toggle thread selection for multi-select
  const toggleThreadSelection = (threadId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setSelectedThreads((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(threadId)) {
        newSelection.delete(threadId);
      } else {
        newSelection.add(threadId);
      }

      if (newSelection.size > 0) {
        setIsMultiSelectMode(true);
      } else {
        setIsMultiSelectMode(false);
      }

      return newSelection;
    });
  };

  const selectAllThreads = () => {
    const allThreadIds = combinedThreads.map((thread) => thread.threadId);
    setSelectedThreads(new Set(allThreadIds));
    setIsMultiSelectMode(true);
  };

  const deselectAllThreads = () => {
    setSelectedThreads(new Set());
    setIsMultiSelectMode(false);
  };

  // Handle delete
  const handleDeleteThread = async (threadId: string, threadName: string) => {
    setThreadToDelete({ id: threadId, name: threadName });
    setIsDeleteDialogOpen(true);
  };

  const handleMultiDelete = () => {
    if (selectedThreads.size === 0) return;

    const threadsToDelete = combinedThreads.filter((t) =>
      selectedThreads.has(t.threadId)
    );
    const threadNames = threadsToDelete.map((t) => t.projectName).join(', ');

    setThreadToDelete({
      id: 'multiple',
      name:
        selectedThreads.size > 3
          ? `${selectedThreads.size} conversations`
          : threadNames,
    });

    setTotalToDelete(selectedThreads.size);
    setDeleteProgress(0);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!threadToDelete || isPerformingActionRef.current) return;

    isPerformingActionRef.current = true;
    setIsDeleteDialogOpen(false);

    if (threadToDelete.id !== 'multiple') {
      const threadId = threadToDelete.id;
      const isActive = pathname?.includes(threadId);

      const currentThread = currentThreads.find((t) => t.thread_id === threadId);
      const sandboxId = currentThread?.project?.sandbox?.id;

      await performDelete(
        threadId,
        isActive,
        async () => {
          deleteThreadMutation(
            { threadId, sandboxId },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: threadKeys.lists() });
                toast.success('Conversation deleted successfully');
              },
              onSettled: () => {
                setThreadToDelete(null);
                isPerformingActionRef.current = false;
              },
            }
          );
        },
        () => {
          setThreadToDelete(null);
          isPerformingActionRef.current = false;
        }
      );
    } else {
      const threadIdsToDelete = Array.from(selectedThreads);
      const isActiveThreadIncluded = threadIdsToDelete.some((id) =>
        pathname?.includes(id)
      );

      toast.info(`Deleting ${threadIdsToDelete.length} conversations...`);

      try {
        if (isActiveThreadIncluded) {
          isNavigatingRef.current = true;
          document.body.style.pointerEvents = 'none';
          router.push('/dashboard');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        deleteMultipleThreadsMutation(
          {
            threadIds: threadIdsToDelete,
            threadSandboxMap: Object.fromEntries(
              threadIdsToDelete
                .map((threadId) => {
                  const currentThread = currentThreads.find(
                    (t) => t.thread_id === threadId
                  );
                  const sandboxId = currentThread?.project?.sandbox?.id || '';
                  return [threadId, sandboxId];
                })
                .filter(([, sandboxId]) => sandboxId)
            ),
            onProgress: handleDeletionProgress,
          },
          {
            onSuccess: (data) => {
              queryClient.invalidateQueries({ queryKey: threadKeys.lists() });
              toast.success(
                `Successfully deleted ${data.successful.length} conversations`
              );
              if (data.failed.length > 0) {
                toast.warning(`Failed to delete ${data.failed.length} conversations`);
              }
              setSelectedThreads(new Set());
              setDeleteProgress(0);
              setTotalToDelete(0);
            },
            onError: (error) => {
              console.error('Error in bulk deletion:', error);
              toast.error('Error deleting conversations');
            },
            onSettled: () => {
              setThreadToDelete(null);
              isPerformingActionRef.current = false;
              setDeleteProgress(0);
              setTotalToDelete(0);
            },
          }
        );
      } catch (err) {
        console.error('Error initiating bulk deletion:', err);
        toast.error('Error initiating deletion process');
        setSelectedThreads(new Set());
        setThreadToDelete(null);
        isPerformingActionRef.current = false;
        setDeleteProgress(0);
        setTotalToDelete(0);
      }
    }
  };

  const isLoading = isThreadsLoading && combinedThreads.length === 0;
  const hasError = !!threadsError && combinedThreads.length === 0;

  // Determine active state based on mode
  const isItemActive = (thread: ThreadWithProject) => {
    if (mode === 'library') {
      // In library mode, no threads should be highlighted - the Files link is separate
      return false;
    }
    return pathname?.includes(thread.threadId) || false;
  };

  return (
    <div>
      {/* Tag filter + Select toggle - shown when not in multi-select mode */}
      {(state !== 'collapsed' || isMobile) && !isMultiSelectMode && mode === 'chats' && combinedThreads.length > 1 && (
        <div className="px-2.5 pt-3 mb-1 flex items-center justify-between">
          <TagFilterDropdown
            selectedTagId={filterTagId}
            onSelectTag={setFilterTagId}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setIsMultiSelectMode(true)}
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            Select
          </Button>
        </div>
      )}

      {/* Multi-select action bar */}
      {(state !== 'collapsed' || isMobile) && isMultiSelectMode && mode === 'chats' && (
        <div className="px-2.5 pt-3 mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={
                selectedThreads.size === combinedThreads.length
                  ? deselectAllThreads
                  : selectAllThreads
              }
            >
              {selectedThreads.size === combinedThreads.length
                ? 'Deselect All'
                : 'Select All'}
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {selectedThreads.size > 0 ? `${selectedThreads.size} selected` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {selectedThreads.size > 0 && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleMultiArchive}
                      disabled={bulkArchiveMutation.isPending}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Archive {selectedThreads.size} conversation{selectedThreads.size > 1 ? 's' : ''}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={handleMultiDelete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Delete {selectedThreads.size} conversation{selectedThreads.size > 1 ? 's' : ''}
                  </TooltipContent>
                </Tooltip>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={deselectAllThreads}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="overflow-y-auto max-h-[calc(100vh-280px)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] pb-16"
      >
        {(state !== 'collapsed' || isMobile) && (
          <>
            {hasError ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
                  <Frown className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Failed to load chats
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: threadKeys.lists() });
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : isLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="flex items-center gap-3 px-2 py-2">
                    <div className="h-10 w-10 bg-muted/10 border-[1.5px] border-border rounded-2xl animate-pulse"></div>
                    <div className="h-4 bg-muted rounded flex-1 animate-pulse"></div>
                    <div className="h-3 w-8 bg-muted rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : combinedThreads.length > 0 ? (
              <>
                {/* Folder filter */}
                {mode === 'chats' && (
                  <ThreadFolderList
                    activeFolderId={filterFolderId}
                    onFolderSelect={setFilterFolderId}
                  />
                )}

                {/* Pinned threads section */}
                {pinnedCombinedThreads.length > 0 && (
                  <div>
                    <div className="py-2 mt-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground px-2.5">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {pinnedCombinedThreads.map((thread) => {
                        const projectGroup: ProjectGroup = {
                          projectId: thread.projectId,
                          projectName: thread.projectName,
                          iconName: thread.iconName,
                          threads: [thread],
                          latestUpdate: thread.updatedAt,
                        };
                        const isActive = isItemActive(thread);
                        const isThreadLoading = loadingThreadId === thread.threadId;
                        const isAgentRunning = agentStatusMap.get(thread.threadId) || false;

                        return (
                          <ThreadItemCard
                            key={`pinned-${thread.threadId}`}
                            thread={thread}
                            projectGroup={projectGroup}
                            isActive={isActive}
                            isThreadLoading={isThreadLoading}
                            isAgentRunning={isAgentRunning}
                            onClick={handleItemClick}
                            onDelete={handleDeleteThread}
                            onRename={handleStartRename}
                            onCreateNewChat={mode === 'chats' ? handleCreateNewChat : undefined}
                            isCreatingChat={isCreatingChat}
                            mode={mode}
                            isPinned={true}
                            onTogglePin={handleTogglePin}
                            isMultiSelectMode={isMultiSelectMode}
                            isSelected={selectedThreads.has(thread.threadId)}
                            onToggleSelect={toggleThreadSelection}
                            onArchive={handleArchiveThread}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {Object.entries(groupedByDateThenProject).map(
                  ([dateGroup, projectsInDate]) => (
                    <div key={dateGroup}>
                      <DateGroupHeader dateGroup={dateGroup} />
                      <div className="space-y-1.5">
                        {Object.values(projectsInDate).map((projectGroup: ProjectGroup) => {
                          const isExpanded = expandedProjects.has(projectGroup.projectId);
                          const projectThreads = projectGroup.threads;
                          const hasActiveThread = projectThreads.some((t) =>
                            isItemActive(t)
                          );
                          const hasSingleChat = projectThreads.length === 1;
                          const singleThread = hasSingleChat ? projectThreads[0] : null;

                          // Single chat - show simple card
                          if (hasSingleChat && singleThread) {
                            const isActive = isItemActive(singleThread);
                            const isThreadLoading = loadingThreadId === singleThread.threadId;
                            const isAgentRunning =
                              agentStatusMap.get(singleThread.threadId) || false;

                            return (
                              <ThreadItemCard
                                key={`project-${projectGroup.projectId}`}
                                thread={singleThread}
                                projectGroup={projectGroup}
                                isActive={isActive}
                                isThreadLoading={isThreadLoading}
                                isAgentRunning={isAgentRunning}
                                onClick={handleItemClick}
                                onDelete={handleDeleteThread}
                                onRename={handleStartRename}
                                onCreateNewChat={mode === 'chats' ? handleCreateNewChat : undefined}
                                isCreatingChat={isCreatingChat}
                                mode={mode}
                                isPinned={pinnedThreadIds.has(singleThread.threadId)}
                                onTogglePin={handleTogglePin}
                                isMultiSelectMode={isMultiSelectMode}
                                isSelected={selectedThreads.has(singleThread.threadId)}
                                onToggleSelect={toggleThreadSelection}
                                onArchive={handleArchiveThread}
                              />
                            );
                          }

                          // Multiple chats - show project with expandable threads
                          return (
                            <div
                              key={`project-${projectGroup.projectId}`}
                              className="rounded-xl"
                            >
                              <Collapsible
                                open={isExpanded}
                                onOpenChange={() =>
                                  toggleProjectExpanded(projectGroup.projectId)
                                }
                              >
                                <CollapsibleTrigger asChild>
                                  <div
                                    className={cn(
                                      'flex items-center gap-2.5 px-2.5 py-2.5 cursor-pointer group/project rounded-xl transition-colors',
                                      hasActiveThread
                                        ? 'bg-muted'
                                        : 'hover:bg-muted/30'
                                    )}
                                  >
                                    {/* Project Icon */}
                                    <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-card border-[1.5px] border-border flex-shrink-0">
                                      <ThreadIcon
                                        iconName={projectGroup.iconName}
                                        className="text-muted-foreground"
                                        size={14}
                                      />
                                    </div>

                                    {/* Project Name & Chat Count */}
                                    <div className="flex-1 min-w-0">
                                      <span className="block text-sm truncate text-foreground/90">
                                        {projectGroup.projectName}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">
                                        {projectThreads.length} chats
                                      </span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {mode === 'chats' && (
                                        <>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground opacity-0 group-hover/project:opacity-100"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleStartRename(projectGroup.projectId, projectGroup.projectName);
                                                }}
                                              >
                                                <Pencil className="h-3.5 w-3.5" />
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                              Rename
                                            </TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground opacity-0 group-hover/project:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                                disabled={isCreatingChat}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCreateNewChat(projectGroup.projectId);
                                                }}
                                              >
                                                {isCreatingChat ? (
                                                  <RecoderLoader size="small" />
                                                ) : (
                                                  <Plus className="h-3.5 w-3.5" />
                                                )}
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                              {isCreatingChat ? 'Creating...' : 'New chat'}
                                            </TooltipContent>
                                          </Tooltip>
                                        </>
                                      )}

                                      <ChevronDown
                                        className={cn(
                                          'h-4 w-4 text-muted-foreground transition-transform duration-200',
                                          isExpanded ? 'rotate-0' : '-rotate-90'
                                        )}
                                      />
                                    </div>
                                  </div>
                                </CollapsibleTrigger>

                                <CollapsibleContent>
                                  <div className="ml-[26px] pl-3 border-l border-border/40 mt-1 pb-2 space-y-1">
                                    {projectThreads.map((thread) => {
                                      const isThreadActive = isItemActive(thread);
                                      const isRunning =
                                        agentStatusMap.get(thread.threadId) || false;

                                      return (
                                        <Link
                                          key={`thread-${thread.threadId}`}
                                          href={
                                            mode === 'library'
                                              ? '/files'
                                              : thread.url
                                          }
                                          onClick={(e) =>
                                            handleItemClick(e, thread.threadId, thread.url)
                                          }
                                          prefetch={true}
                                          className={cn(
                                            'flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg transition-colors group/chat',
                                            isThreadActive
                                              ? 'bg-muted text-foreground font-medium'
                                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                          )}
                                        >
                                          {/* Status dot */}
                                          <div
                                            className={cn(
                                              'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors',
                                              isRunning
                                                ? 'bg-blue-500 animate-pulse'
                                                : isThreadActive
                                                ? 'bg-primary'
                                                : 'bg-muted-foreground/30'
                                            )}
                                          />

                                          {/* Chat name */}
                                          <span
                                            className={cn(
                                              'flex-1 truncate',
                                              isThreadActive && 'font-medium'
                                            )}
                                          >
                                            {thread.threadName}
                                          </span>

                                          {/* Menu */}
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                className="p-1 rounded-md hover:bg-accent transition-colors opacity-0 group-hover/chat:opacity-100"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                }}
                                              >
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                              </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-40">
                                              {mode === 'library' && (
                                                <>
                                                  <DropdownMenuItem
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      window.open(thread.url, '_blank');
                                                    }}
                                                  >
                                                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                                    Open chat
                                                  </DropdownMenuItem>
                                                  <DropdownMenuSeparator />
                                                </>
                                              )}
                                              <DropdownMenuItem
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  handleTogglePin(thread.threadId, pinnedThreadIds.has(thread.threadId));
                                                }}
                                              >
                                                {pinnedThreadIds.has(thread.threadId) ? (
                                                  <PinOff className="mr-2 h-3.5 w-3.5" />
                                                ) : (
                                                  <Pin className="mr-2 h-3.5 w-3.5" />
                                                )}
                                                {pinnedThreadIds.has(thread.threadId) ? 'Unpin' : 'Pin to top'}
                                              </DropdownMenuItem>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  handleDeleteThread(
                                                    thread.threadId,
                                                    thread.projectName
                                                  );
                                                }}
                                              >
                                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                                Delete
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}

                {/* Archived threads section */}
                {mode === 'chats' && <ArchivedThreadsSection />}

                {/* Pagination controls */}
                {pagination && totalPages > 1 && (
                  <div className="px-3 py-3 mt-2">
                    <div className="flex items-center justify-center gap-4">
                      <button
                        onClick={handlePreviousPage}
                        disabled={!canGoPrevious || isThreadsFetching}
                        className={cn(
                          'p-1.5 rounded-md transition-all',
                          canGoPrevious && !isThreadsFetching
                            ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            : 'text-muted-foreground/30 cursor-not-allowed'
                        )}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      <span className="text-xs text-muted-foreground flex items-center gap-1.5 tabular-nums">
                        {isThreadsFetching && <RecoderLoader size="small" />}
                        <span className="font-medium">{currentPage}</span>
                        <span>/</span>
                        <span>{totalPages}</span>
                      </span>

                      <button
                        onClick={handleNextPage}
                        disabled={!canGoNext || isThreadsFetching}
                        className={cn(
                          'p-1.5 rounded-md transition-all',
                          canGoNext && !isThreadsFetching
                            ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            : 'text-muted-foreground/30 cursor-not-allowed'
                        )}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/30 border border-border mb-4">
                  <Frown className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {mode === 'chats' ? t('noConversations') : 'No activity yet'}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {mode === 'chats'
                    ? 'Start a new project to get going'
                    : 'Start a new chat to see activity here'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Deletion progress */}
      {(isDeletingSingle || isDeletingMultiple) && totalToDelete > 0 && (
        <div className="mx-3 mt-3 p-3 bg-muted/30 rounded-xl border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-2">
              <RecoderLoader size="small" />
              Deleting...
            </span>
            <span className="tabular-nums font-medium">
              {Math.floor(deleteProgress)}%
            </span>
          </div>
          <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300 ease-out rounded-full"
              style={{ width: `${deleteProgress}%` }}
            />
          </div>
        </div>
      )}

      {threadToDelete && (
        <DeleteConfirmationDialog
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
          threadName={threadToDelete.name}
          isDeleting={isDeletingSingle || isDeletingMultiple}
        />
      )}

      <RenameProjectDialog
        isOpen={renameDialogOpen}
        projectId={renameProjectId}
        currentName={renameProjectName}
        onClose={handleCloseRenameDialog}
        onSave={handleSaveRename}
      />
    </div>
  );
}

