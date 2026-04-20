'use client';

import { Button } from "@/components/ui/button"
import { Upload, PanelRightOpen, PanelRightClose, Copy, Check, Menu, Brain, Download } from "lucide-react"
import { toast } from "@/lib/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useState } from "react"
import { useIsMobile } from "@/hooks/utils"
import { SharePopover } from "@/components/sidebar/share-modal"
import { ModeIndicator } from "@/components/thread/mode-indicator"
import { useSidebar } from "@/components/ui/sidebar"
import { useThreadMemorySettings, useUpdateThreadMemorySettings } from "@/hooks/memory/use-memory"
import { ThreadMessageSearch } from "@/components/thread/thread-message-search"
import { ThreadExportDialog } from "@/components/thread/thread-export-dialog"

interface ThreadSiteHeaderProps {
  threadId?: string;
  projectId?: string;
  projectName: string;
  isPendingThread?: boolean;
  onViewFiles: () => void;
  onToggleSidePanel: () => void;
  isSidePanelOpen?: boolean;
  onProjectRenamed?: (newName: string) => void;
  isMobileView?: boolean;
  variant?: 'default' | 'shared';
  agentId?: string;
  messages?: Array<{ role: string; content: string }>;
}

export function SiteHeader({
  threadId,
  projectId,
  projectName,
  isPendingThread = false,
  onViewFiles,
  onToggleSidePanel,
  isSidePanelOpen = false,
  onProjectRenamed,
  isMobileView,
  variant = 'default',
  agentId,
  messages = [],
}: ThreadSiteHeaderProps) {
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile() || isMobileView;
  const { setOpen: setSidebarOpen, setOpenMobile } = useSidebar();
  const { data: threadMemory } = useThreadMemorySettings(threadId ?? null, {
    enabled: !isPendingThread,
  });
  const updateThreadMemory = useUpdateThreadMemorySettings();

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const handleOpenMenu = () => {
    setSidebarOpen(true);
    setOpenMobile(true);
  };

  return (
    <header className="bg-background sticky top-0 z-20 w-full h-12 sm:h-14 flex-shrink-0">
      <div className="h-full flex items-center justify-between px-3 sm:px-4">
        {/* Left side - Menu (mobile) + Mode indicator or project name */}
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {/* Mobile menu button */}
          {isMobile && (
            <button
              onClick={handleOpenMenu}
              className="flex items-center justify-center h-9 w-9 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 active:bg-accent transition-colors touch-manipulation"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          {variant === 'shared' ? (
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 min-w-0">
              <span className="truncate max-w-[140px] sm:max-w-none">{projectName}</span>
              <span className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md shrink-0 font-medium">
                Shared
              </span>
            </div>
          ) : (
            <ModeIndicator />
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 overflow-hidden">
          <TooltipProvider delayDuration={300}>
            {threadId && variant !== 'shared' && (
              <ThreadMessageSearch threadId={threadId} />
            )}

            {variant === 'shared' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={copyShareLink}
                    size="sm"
                    className="h-9 px-2.5 cursor-pointer gap-1.5"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="hidden sm:inline text-sm">{copied ? 'Copied!' : 'Copy Link'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <p>Copy share link</p>
                </TooltipContent>
              </Tooltip>
            ) : threadId && projectId ? (
              <SharePopover threadId={threadId} projectId={projectId}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2.5 cursor-pointer gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Share</span>
                </Button>
              </SharePopover>
            ) : null}

            {/* Save as Template, Insights, Analytics hidden — not functional yet */}

            {threadId && variant !== 'shared' && (
              <ThreadExportDialog threadId={threadId} threadName={projectName}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </ThreadExportDialog>
            )}

            {threadId && variant !== 'shared' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!threadId) return;
                      updateThreadMemory.mutate({
                        threadId,
                        enabled: !(threadMemory?.memory_enabled ?? true),
                      });
                    }}
                    disabled={updateThreadMemory.isPending}
                    className={`h-9 w-9 cursor-pointer ${
                      threadMemory?.memory_enabled === false
                        ? 'text-muted-foreground'
                        : 'text-primary'
                    }`}
                  >
                    <Brain className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  <p>Memory {threadMemory?.memory_enabled === false ? 'disabled' : 'enabled'} for this chat</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleSidePanel}
                  className="h-9 w-9 cursor-pointer"
                >
                  {isSidePanelOpen ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <p>{isSidePanelOpen ? 'Close' : 'Open'} Sandbox</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  )
}
