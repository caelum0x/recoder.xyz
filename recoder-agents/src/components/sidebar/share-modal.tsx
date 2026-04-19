"use client"

import { useState, useEffect } from "react"
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Copy, Check, Globe, ExternalLink, Lock, FileText, FileDown, X, UserPlus, Users } from "lucide-react"
import { toast } from "@/lib/toast"
import { useThreadQuery, useUpdateThreadMutation } from "@/hooks/threads/use-threads"
import { useExportPdf, useExportDocx } from "@/hooks/export/use-export"
import { useThreadCollaborators, useShareThread, useRemoveCollaborator } from "@/hooks/threads/use-thread-collaborators"
import { Skeleton } from "../ui/skeleton"
import { cn } from "@/lib/utils"

interface SharePopoverProps {
  threadId?: string
  projectId?: string
  children?: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const LoadingSkeleton = () => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2.5">
      <Skeleton className="h-7 w-7 rounded-lg" />
      <div className="space-y-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-32" />
      </div>
    </div>
    <Skeleton className="h-5 w-9 rounded-full" />
  </div>
)

// Social icons
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
)

const LinkedInIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

// Team tab content component
function TeamTabContent({ threadId }: { threadId?: string }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer')
  const { data: collaborators, isLoading } = useThreadCollaborators(threadId || "")
  const shareThread = useShareThread()
  const removeCollaborator = useRemoveCollaborator()

  const handleInvite = () => {
    if (!threadId || !email.trim()) return
    shareThread.mutate(
      { threadId, email: email.trim(), role },
      { onSuccess: () => setEmail("") },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInvite()
    }
  }

  const roleBadgeClass = (r: string) => {
    switch (r) {
      case 'editor': return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
      case 'admin': return 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div className="p-3 space-y-2.5">
      {/* Invite row */}
      <div className="flex items-center gap-1.5">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 h-8 rounded-lg border border-border/60 bg-muted/30 px-2.5 text-[12px] placeholder:text-muted-foreground/50 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 min-w-0"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
          className="h-8 rounded-lg border border-border/60 bg-muted/30 px-1.5 text-[11px] outline-none focus:border-ring cursor-pointer"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          onClick={handleInvite}
          disabled={!email.trim() || shareThread.isPending}
          className={cn(
            "h-8 px-2.5 rounded-lg text-[11px] font-medium transition-all active:scale-[0.98] shrink-0",
            "bg-foreground text-background hover:bg-foreground/90",
            "disabled:opacity-40 disabled:pointer-events-none"
          )}
        >
          {shareThread.isPending ? '...' : 'Invite'}
        </button>
      </div>

      {/* Collaborator list */}
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-2 py-1">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-12 rounded-full ml-auto" />
              </div>
            ))}
          </div>
        ) : !collaborators || collaborators.length === 0 ? (
          <div className="py-4 text-center">
            <Users className="h-5 w-5 mx-auto text-muted-foreground/40 mb-1.5" />
            <p className="text-[11px] text-muted-foreground/60">No collaborators yet</p>
            <p className="text-[10px] text-muted-foreground/40">Invite people by email to collaborate</p>
          </div>
        ) : (
          <div className="max-h-[140px] overflow-y-auto space-y-0.5 -mx-1 px-1">
            {collaborators.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 py-1.5 px-1.5 rounded-lg hover:bg-muted/40 group"
              >
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-medium uppercase">
                    {(c.email || c.user_id)?.[0] || '?'}
                  </span>
                </div>
                <span className="text-[12px] truncate min-w-0 flex-1">
                  {c.email || c.user_id}
                </span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                  roleBadgeClass(c.role)
                )}>
                  {c.role}
                </span>
                <button
                  onClick={() => removeCollaborator.mutate({ threadId: c.thread_id, collaboratorId: c.id })}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted"
                  title="Remove"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Shared content component
function SharePopoverContent({
  threadId,
  isOpen
}: {
  threadId?: string
  isOpen: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("share")

  const updateThreadMutation = useUpdateThreadMutation()
  const { data: threadData, isLoading, refetch } = useThreadQuery(threadId || "", {
    enabled: isOpen && !!threadId,
  })
  const exportPdf = useExportPdf()
  const exportDocx = useExportDocx()

  const getThreadContent = (): string => {
    // Grab rendered thread content from the DOM
    const threadEl = document.querySelector('[data-thread-content]') || document.querySelector('.thread-content')
    if (threadEl) return threadEl.innerHTML
    // Fallback: get all message blocks
    const messages = document.querySelectorAll('[data-message-role]')
    if (messages.length > 0) {
      return Array.from(messages).map(m => `<div>${m.innerHTML}</div>`).join('\n')
    }
    return '<p>No content to export</p>'
  }

  const handleExportPdf = () => {
    const content = getThreadContent()
    const name = threadData?.name || threadData?.project_name || 'conversation'
    exportPdf.mutate({ content, fileName: name })
  }

  const handleExportDocx = () => {
    const content = getThreadContent()
    const name = threadData?.name || threadData?.project_name || 'conversation'
    exportDocx.mutate({ content, fileName: name })
  }

  const isPublic = Boolean(threadData?.is_public)
  
  const shareLink = threadId 
    ? `${process.env.NEXT_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/share/${threadId}`
    : ""

  // Reset state when popover closes
  useEffect(() => {
    if (!isOpen) {
      setCopied(false)
      setActiveTab("share")
    }
  }, [isOpen])

  const handleToggle = async (checked: boolean) => {
    if (!threadId) return
    try {
      await updateThreadMutation.mutateAsync({
        threadId,
        data: { is_public: checked },
      })
      await refetch()
      toast.success(checked ? "Link enabled" : "Link disabled")
    } catch (error) {
      console.error("Error:", error)
      toast.error("Failed to update")
    }
  }

  const handleCopy = async () => {
    if (!shareLink || copied) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      toast.success("Copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy")
    }
  }

  const handleOpen = () => window.open(shareLink, "_blank", "noopener,noreferrer")
  
  const handleShareX = () => {
    const text = encodeURIComponent("Check out this conversation")
    const url = encodeURIComponent(shareLink)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank")
  }

  const handleShareLinkedIn = () => {
    const url = encodeURIComponent(shareLink)
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank")
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <LoadingSkeleton />
      </div>
    )
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
      <TabsList className="w-full rounded-none border-b border-border/50 bg-transparent h-9 p-0">
        <TabsTrigger value="share" className="flex-1 rounded-none border-none data-[state=active]:shadow-none text-[12px] gap-1">
          <Globe className="h-3 w-3" />
          Share
        </TabsTrigger>
        <TabsTrigger value="team" className="flex-1 rounded-none border-none data-[state=active]:shadow-none text-[12px] gap-1">
          <UserPlus className="h-3 w-3" />
          Team
        </TabsTrigger>
      </TabsList>

      <TabsContent value="share" className="mt-0">
        <div className="p-3 space-y-2.5">
          {/* Toggle Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "flex items-center justify-center h-7 w-7 rounded-lg shrink-0 transition-all duration-200",
                isPublic
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}>
                {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              </div>
              <div className="text-left min-w-0">
                <p className="text-[13px] font-medium leading-tight">
                  {isPublic ? "Public link enabled" : "Enable public link"}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {isPublic ? "Anyone with the link can view" : "Only you can access this thread"}
                </p>
              </div>
            </div>
            <Switch
              checked={isPublic}
              onCheckedChange={handleToggle}
              disabled={updateThreadMutation.isPending}
              className={cn(
                "shrink-0",
                updateThreadMutation.isPending && "opacity-50"
              )}
            />
          </div>

          {/* Link Actions - Visible when public */}
          {isPublic && (
            <div className="space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-150 pt-0.5">
              {/* Copy URL */}
              <button
                onClick={handleCopy}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 h-8 rounded-lg transition-all",
                  "bg-muted/50 hover:bg-muted active:scale-[0.99]",
                  copied && "bg-emerald-500/10"
                )}
              >
                <span className="flex-1 text-[11px] text-muted-foreground font-mono truncate text-left">
                  {shareLink.replace(/^https?:\/\//, '')}
                </span>
                <div className={cn(
                  "transition-colors shrink-0",
                  copied ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                )}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </div>
              </button>

              {/* Actions Row */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleOpen}
                  className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-medium bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </button>
                <button
                  onClick={handleShareX}
                  className="flex items-center justify-center h-7 w-7 rounded-lg border border-border/60 hover:bg-muted transition-colors"
                  title="Share on X"
                >
                  <XIcon />
                </button>
                <button
                  onClick={handleShareLinkedIn}
                  className="flex items-center justify-center h-7 w-7 rounded-lg border border-border/60 hover:bg-muted transition-colors"
                  title="Share on LinkedIn"
                >
                  <LinkedInIcon />
                </button>
              </div>
            </div>
          )}

          {/* Export Section */}
          <div className="border-t border-border/50 pt-2.5 space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground px-0.5">Export</p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportPdf}
                disabled={exportPdf.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-medium border border-border/60 hover:bg-muted active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <FileText className="h-3 w-3" />
                {exportPdf.isPending ? 'Exporting...' : 'PDF'}
              </button>
              <button
                onClick={handleExportDocx}
                disabled={exportDocx.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-medium border border-border/60 hover:bg-muted active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <FileDown className="h-3 w-3" />
                {exportDocx.isPending ? 'Exporting...' : 'DOCX'}
              </button>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="team" className="mt-0">
        <TeamTabContent threadId={threadId} />
      </TabsContent>
    </Tabs>
  )
}

export function SharePopover({ 
  threadId, 
  projectId, 
  children,
  side = "bottom",
  align = "end",
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
}: SharePopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  
  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (controlledOnOpenChange || (() => {})) : setInternalOpen

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      {children ? (
        <PopoverTrigger asChild>
          {children}
        </PopoverTrigger>
      ) : (
        <PopoverAnchor className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      )}
      <PopoverContent 
        side={children ? side : "bottom"} 
        align={children ? align : "center"} 
        className="w-[280px] p-0 overflow-hidden"
        sideOffset={8}
      >
        <SharePopoverContent threadId={threadId} isOpen={isOpen} />
      </PopoverContent>
    </Popover>
  )
}
