'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, Plus, Zap, MessageCircle, PanelLeftOpen, PanelLeftClose, Search, Users, FolderOpen, Network, Code, Share2, Clock, Store, LayoutTemplate, CreditCard, FileBarChart, Play, Star, Trophy, BookOpen, GitBranch, CalendarClock, FlaskConical, Activity, ShieldAlert } from 'lucide-react';

import { NavAgents } from '@/components/sidebar/nav-agents';
import { NavWorkers } from '@/components/sidebar/nav-workers';
import { NavGlobalConfig } from '@/components/sidebar/nav-global-config';
import { NavTriggerRuns } from '@/components/sidebar/nav-trigger-runs';
import { SSEErrorBoundary } from '@/components/sse-error-boundary';
import { NavWorkspaces } from '@/components/sidebar/nav-workspaces';
import { NavUserWithTeams } from '@/components/sidebar/nav-user-with-teams';
import { RecoderLogo } from '@/components/sidebar/recoder-logo';
// AppSwitcher removed from sidebar header to avoid duplicate icons — accessible via user menu
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { NewAgentDialog } from '@/components/agents/new-agent-dialog';
import { ThreadSearchModal } from '@/components/sidebar/thread-search-modal';
import { GlobalSearchDialog } from '@/components/search/global-search-dialog';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/utils';
import { cn } from '@/lib/utils';
import { useAdminRole } from '@/hooks/admin';
import posthog from 'posthog-js';
import { useDocumentModalStore } from '@/stores/use-document-modal-store';
import { isLocalMode } from '@/lib/config';
import { useAccountState, accountStateSelectors } from '@/hooks/billing';

import { getPlanIcon } from '@/components/billing/plan-utils';
import { Kbd, KbdGroup } from '../ui/kbd';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/AuthProvider';
import { SubscriptionStatusBadge } from '@/components/billing/subscription-status-badge';
import { ActiveRunsSection } from '@/components/sidebar/active-runs';

/** Minimal fallback shown when a sidebar section crashes (SSE/network error) */
function SidebarSectionError({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div className="py-6 text-center space-y-2">
      <p className="text-xs text-muted-foreground">
        {label} temporarily unavailable
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-primary hover:underline cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function UserProfileSection({ user }: { user: any }) {
  const { data: accountState } = useAccountState({ enabled: true });
  const { state } = useSidebar();
  const isLocal = isLocalMode();
  const planName = accountStateSelectors.planName(accountState);

  // Return the enhanced user object with plan info for NavUserWithTeams
  const enhancedUser = {
    ...user,
    planName,
    planIcon: getPlanIcon(planName, isLocal)
  };

  return (
    <div className="space-y-2">
      <NavUserWithTeams user={enhancedUser} />
      {state !== 'collapsed' && <SubscriptionStatusBadge className="ml-1" />}
    </div>
  );
}

function FloatingMobileMenuButton() {
  const { setOpenMobile, openMobile, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const pathname = usePathname();

  // Don't show floating button on pages that have their own inline menu button:
  // - Dashboard page
  // - Thread pages (projects/*/thread/*)
  // - Agent thread pages (agents/*/[threadId])
  const isDashboard = pathname === '/dashboard';
  const isThreadPage = pathname?.includes('/thread/') || pathname?.match(/^\/agents\/[^/]+\/[^/]+$/);
  const hasInlineMenu = isDashboard || isThreadPage;

  if (!isMobile || openMobile || hasInlineMenu) return null;

  return (
    <div className="fixed top-3 left-3 z-50 safe-area-top">
      <Button
        onClick={() => {
          setOpen(true);
          setOpenMobile(true);
        }}
        size="icon"
        className="h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm text-foreground border border-border shadow-md hover:bg-background transition-all duration-200 active:scale-95 touch-manipulation"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function SidebarLeft({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations('sidebar');
  const { state, setOpen, setOpenMobile } = useSidebar();
  const { user: authUser } = useAuth();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [activeView, setActiveView] = useState<'chats' | 'workers' | 'workspaces' | 'starred'>('chats');
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const [showEnterpriseCard, setShowEnterpriseCard] = useState(true);
  const [user, setUser] = useState<{
    name: string;
    email: string;
    avatar: string;
    isAdmin?: boolean;
  }>({
    name: 'Loading...',
    email: 'loading@example.com',
    avatar: '',
    isAdmin: false,
  });

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showNewAgentDialog, setShowNewAgentDialog] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const { isOpen: isDocumentModalOpen } = useDocumentModalStore();

  // Extract pathname info
  const { isOnLibrary, isOnThread } = useMemo(() => {
    if (!pathname) return { isOnLibrary: false, isOnThread: false };
    
    // Match /files page
    if (pathname === '/files') {
      return { isOnLibrary: true, isOnThread: false };
    }
    
    // Match /projects/{projectId}/thread/{threadId}
    const threadMatch = pathname.match(/^\/projects\/([^\/]+)\/thread\/([^\/]+)/);
    if (threadMatch) {
      return { isOnLibrary: false, isOnThread: true };
    }
    
    return { isOnLibrary: false, isOnThread: false };
  }, [pathname]);

  // Update active view based on pathname (Files is independent, not a view)
  useEffect(() => {
    if (pathname?.includes('/triggers') || pathname?.includes('/knowledge')) {
      setActiveView('starred');
    } else if (isOnThread) {
      setActiveView('chats');
    }
    // Note: isOnLibrary (/files page) does NOT change activeView - it's independent
  }, [pathname, isOnThread]);

  // Handle view switching (Files is independent - just a link, not part of this)
  const handleViewChange = (view: 'chats' | 'workers' | 'workspaces' | 'starred') => {
    setActiveView(view);
    // Scroll the sidebar content to top so the new view is visible
    sidebarScrollRef.current?.scrollTo({ top: 0 });
  };

  // Logout handler
  const handleLogout = async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/login');
  };

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, searchParams, isMobile, setOpenMobile]);


  // Use React Query hook for admin role instead of direct fetch
  const { data: adminRoleData } = useAdminRole();
  const isAdmin = adminRoleData?.isAdmin ?? false;

  useEffect(() => {
    if (!authUser) return;
    setUser({
      name: authUser.name || authUser.email?.split('@')[0] || 'User',
      email: authUser.email || '',
      avatar: authUser.user_metadata?.image_url || '',
      isAdmin: isAdmin,
    });
  }, [authUser, isAdmin]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDocumentModalOpen) return;

      // Skip if user is in an editable element (editor, input, textarea)
      const el = document.activeElement;
      const isEditing = el && (
        el.tagName.toLowerCase() === 'input' ||
        el.tagName.toLowerCase() === 'textarea' ||
        el.getAttribute('contenteditable') === 'true' ||
        el.closest('.cm-editor') ||
        el.closest('.ProseMirror')
      );

      // CMD+B to toggle sidebar (skip if editing)
      if ((event.metaKey || event.ctrlKey) && event.key === 'b' && !isEditing) {
        event.preventDefault();
        setOpen(!state.startsWith('expanded'));
        window.dispatchEvent(
          new CustomEvent('sidebar-left-toggled', {
            detail: { expanded: !state.startsWith('expanded') },
          }),
        );
      }

      // CMD+K to open global search
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }

      // CMD+J to open new chat
      if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
        event.preventDefault();
        posthog.capture('new_task_clicked', { source: 'keyboard_shortcut' });
        router.push('/dashboard');
        if (isMobile) {
          setOpenMobile(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, setOpen, isDocumentModalOpen, router, isMobile, setOpenMobile]);

  // Listen for custom events from KeyboardShortcutWiring
  useEffect(() => {
    const handleOpenSearch = () => setGlobalSearchOpen(true);
    const handleNewAgent = () => setShowNewAgentDialog(true);

    window.addEventListener('shortcut:open-search', handleOpenSearch);
    window.addEventListener('shortcut:new-agent', handleNewAgent);
    return () => {
      window.removeEventListener('shortcut:open-search', handleOpenSearch);
      window.removeEventListener('shortcut:new-agent', handleNewAgent);
    };
  }, []);



  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/50 bg-background [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      {...props}
    >
      <SidebarHeader className="pt-4 overflow-visible">
        <div className="relative flex h-[32px] items-center">
          {/* Logo - fixed position, matches dashboard header on mobile */}
          <div className={cn(
            "absolute flex items-center justify-center group/logo",
            "left-6"
          )}>

            <Link href="/dashboard" onClick={() => isMobile && setOpenMobile(false)} className="flex items-center justify-center">
              <RecoderLogo
                size={20}
                className={cn(
                  "flex-shrink-0 transition-[transform,opacity] duration-300 ease-out hover:rotate-180 hover:duration-700 transform-gpu",
                  state === 'collapsed' && "group-hover/logo:opacity-0 group-hover/logo:scale-90"
                )}
              />
            </Link>
            {/* AppSwitcher removed — was causing duplicate grid icon in header */}
            {/* Expand button - only shows on hover when collapsed */}
            {state === 'collapsed' && (
              <button
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer opacity-0 scale-75 group-hover/logo:opacity-100 group-hover/logo:scale-100 transition-[opacity,transform] duration-300 ease-out transform-gpu"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(true);
                }}
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            )}
          </div>
          
          {/* Right side buttons - fade in/out, positioned at the right */}
          <div 
            className={cn(
              "absolute right-6 flex items-center gap-1 transition-[opacity,right] duration-300 ease-out transform-gpu",
              state === 'collapsed' 
                ? "opacity-0 pointer-events-none right-0" 
                : "opacity-100 pointer-events-auto"
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-tour="global-search"
              onClick={() => setGlobalSearchOpen(true)}
            >
              <Search className="!h-5 !w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (isMobile) {
                  setOpenMobile(false);
                } else {
                  setOpen(false);
                }
              }}
            >
              <PanelLeftClose className="!h-5 !w-5" />
            </Button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] relative overflow-y-auto">
        {/* Collapsed layout: + button and state buttons only */}
        <div
          className={cn(
            "absolute inset-0 px-6 pt-4 space-y-3 flex flex-col items-center transition-opacity duration-150 ease-out transform-gpu",
            state === 'collapsed' 
              ? "opacity-100 pointer-events-auto delay-100" 
              : "opacity-0 pointer-events-none delay-0"
          )}
        >
          {/* + button */}
          <div className="w-full flex flex-col items-center space-y-3">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 p-0 shadow-none"
              asChild
            >
              <Link
                href="/dashboard"
                onClick={() => {
                  posthog.capture('new_task_clicked');
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <Plus className="h-4 w-4" />
              </Link>
            </Button>
            
            {/* Files button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-10 w-10 p-0",
                isOnLibrary && "bg-card border-[1.5px] border-border"
              )}
              asChild
            >
              <Link
                href="/files"
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <FolderOpen className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="w-full flex flex-col items-center space-y-3">
            {[
              { view: 'chats' as const, icon: MessageCircle },
              // { view: 'library' as const, icon: Library },
              { view: 'workers' as const, icon: Users },
              { view: 'starred' as const, icon: Zap },
            ].map(({ view, icon: Icon }) => (
              <Button
                key={view}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 p-0 cursor-pointer hover:bg-card hover:border-[1.5px] hover:border-border",
                  activeView === view ? 'bg-card border-[1.5px] border-border' : ''
                )}
                onClick={() => {
                  handleViewChange(view);
                  setOpen(true); // Expand sidebar when clicking state button
                }}
              >
                <Icon className="!h-4 !w-4" />
              </Button>
            ))}
          </div>
        </div>

        {/* Expanded layout */}
        <div
          className={cn(
            "flex flex-col h-full transition-opacity duration-150 ease-out transform-gpu",
            state === 'collapsed' 
              ? "opacity-0 pointer-events-none delay-0" 
              : "opacity-100 pointer-events-auto delay-100"
          )}
        >
          <div className="px-6 pt-4 space-y-4 flex-shrink-0">
            {/* New Chat button */}
            <div className="w-full">
              <Button
                variant="outline"
                size="sm"
                className="w-full shadow-none justify-between h-10 px-3 group/new-chat"
                data-tour="new-agent-button"
                asChild
              >
                <Link
                  href="/dashboard"
                  onClick={() => {
                    posthog.capture('new_task_clicked');
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    {t('newChat')}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover/new-chat:opacity-100 transition-opacity">
                  <KbdGroup>
                    <Kbd>⌘</Kbd>
                    <Kbd>J</Kbd>
                  </KbdGroup>
                  </div>
                </Link>
              </Button>
            </div>

            {/* Files link */}
            <div className="w-full">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full shadow-none justify-start h-10 px-3 hover:text-foreground",
                  isOnLibrary 
                    ? "bg-card border-[1.5px] border-border text-foreground" 
                    : "text-muted-foreground"
                )}
                asChild
              >
                <Link
                  href="/files"
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Files
                  </div>
                </Link>
              </Button>
            </div>

            {/* State buttons horizontally */}
            <div className="flex justify-between items-center gap-2">
              {[
                { view: 'chats' as const, icon: MessageCircle, label: t('chats') },
                // { view: 'library' as const, icon: Library, label: t('library') },
                { view: 'workers' as const, icon: Users, label: 'Workers' },
                { view: 'workspaces' as const, icon: Network, label: 'Spaces' },
                { view: 'starred' as const, icon: Zap, label: t('triggers') }
              ].map(({ view, icon: Icon, label }) => (
                <button
                  key={view}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 p-1.5 rounded-2xl cursor-pointer transition-colors w-[64px] h-[64px]",
                    "hover:bg-muted/60 hover:border-[1.5px] hover:border-border",
                    activeView === view ? 'bg-card border-[1.5px] border-border' : 'border-[1.5px] border-transparent'
                  )}
                  onClick={() => handleViewChange(view)}
                >
                  <Icon className="!h-4 !w-4" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable area containing content panels, active runs, and nav links */}
          <div ref={sidebarScrollRef} className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {/* Content area — each section wrapped in SSEErrorBoundary so
                CORS/QUIC/network failures don't blank the entire sidebar */}
            <div className="px-6">
              {activeView === 'chats' && (
                <SSEErrorBoundary name="sidebar-chats" retryAfterMs={10000}
                  fallback={<SidebarSectionError label="Chats" />}>
                  <div data-tour="sidebar-agents"><NavAgents /></div>
                </SSEErrorBoundary>
              )}
              {activeView === 'workers' && (
                <SSEErrorBoundary name="sidebar-workers" retryAfterMs={10000}
                  fallback={<SidebarSectionError label="Workers" />}>
                  <NavWorkers />
                </SSEErrorBoundary>
              )}
              {activeView === 'workspaces' && (
                <SSEErrorBoundary name="sidebar-workspaces" retryAfterMs={10000}
                  fallback={<SidebarSectionError label="Spaces" />}>
                  <NavWorkspaces />
                </SSEErrorBoundary>
              )}
              {activeView === 'starred' && (
                <SSEErrorBoundary name="sidebar-triggers" retryAfterMs={10000}
                  fallback={<SidebarSectionError label="Triggers" />}>
                  <NavGlobalConfig />
                  <NavTriggerRuns />
                </SSEErrorBoundary>
              )}
            </div>

            {/* Active runs monitor */}
            <div className="px-6">
              <SSEErrorBoundary name="sidebar-active-runs" retryAfterMs={10000}>
                <ActiveRunsSection />
              </SSEErrorBoundary>
            </div>

            {/* Shared + Developers links */}
            <div className="px-6 pb-2 space-y-0.5">
            <Link
              href="/shared"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname === '/shared' && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Share2 className="h-4 w-4" />
              Shared
            </Link>
            <Link
              href="/favorites"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname === '/favorites' && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Star className="h-4 w-4" />
              Favorites
            </Link>
            <Link
              href="/marketplace"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/marketplace') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Store className="h-4 w-4" />
              Marketplace
            </Link>
            <Link
              href="/agents/templates"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/agents/templates') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <LayoutTemplate className="h-4 w-4" />
              Templates
            </Link>
            <Link
              href="/prompts"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname === '/prompts' && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <BookOpen className="h-4 w-4" />
              Prompts
            </Link>
            <Link
              href="/activity"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname === '/activity' && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Clock className="h-4 w-4" />
              Activity
            </Link>
            <Link
              href="/runs"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/runs') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Play className="h-4 w-4" />
              Runs
            </Link>
            <Link
              href="/monitoring"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/monitoring') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Activity className="h-4 w-4" />
              Monitoring
            </Link>
            <Link
              href="/monitoring/incidents"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname === '/monitoring/incidents' && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <ShieldAlert className="h-4 w-4" />
              Incidents
            </Link>
            <Link
              href="/schedules"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/schedules') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <CalendarClock className="h-4 w-4" />
              Schedules
            </Link>
            <Link
              href="/pipelines"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/pipelines') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <GitBranch className="h-4 w-4" />
              Pipelines
            </Link>
            <Link
              href="/agents/leaderboard"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname === '/agents/leaderboard' && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Trophy className="h-4 w-4" />
              Leaderboard
            </Link>
            <Link
              href="/agents/ab-tests"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/agents/ab-tests') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <FlaskConical className="h-4 w-4" />
              A/B Tests
            </Link>
            <Link
              href="/reports"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/reports') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <FileBarChart className="h-4 w-4" />
              Reports
            </Link>
            <Link
              href="/billing/plans"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname?.startsWith('/billing') && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <CreditCard className="h-4 w-4" />
              Billing
            </Link>
            <Link
              href="/developers"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                pathname === '/developers' && "text-foreground bg-muted/50"
              )}
              onClick={() => isMobile && setOpenMobile(false)}
            >
              <Code className="h-4 w-4" />
              Developers
            </Link>
          </div>
          </div>{/* end scrollable area */}
        </div>
      </SidebarContent>

      {/* Enterprise Demo Card - Only show when expanded */}
      {/* {
        state !== 'collapsed' && showEnterpriseCard && (
          <div className="absolute bottom-[86px] left-6 right-6 z-10">
            <div className="rounded-2xl p-5 backdrop-blur-[12px] border-[1.5px] bg-gradient-to-br from-white/25 to-gray-300/25 dark:from-gray-600/25 dark:to-gray-800/25 border-gray-300/50 dark:border-gray-600/50">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium text-foreground">Enterprise Demo</span>

                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowEnterpriseCard(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Request custom AI Workers implementation
              </p>
              <RecoderProcessModal>
                <Button size="sm" className="w-full text-xs h-8">
                  Learn More
                </Button>
              </RecoderProcessModal>
            </div>
          </div>
        )
      } */}

      <div className="px-6 pb-4">
        <UserProfileSection user={user} />
      </div>
      <SidebarRail />
      <NewAgentDialog
        open={showNewAgentDialog}
        onOpenChange={setShowNewAgentDialog}
      />
      <ThreadSearchModal
        open={showSearchModal}
        onOpenChange={setShowSearchModal}
      />
      <GlobalSearchDialog
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
      />
    </Sidebar>
  );
}

// Export the floating button so it can be used in the layout
export { FloatingMobileMenuButton };
