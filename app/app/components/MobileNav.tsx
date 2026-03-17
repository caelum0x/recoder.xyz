'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LayoutDashboard, Bot, BarChart3, Settings, Key, FolderOpen, Sparkles, User, Terminal, Globe, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

const bottomTabs = [
  { href: '/dashboard/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings/account', label: 'Settings', icon: Settings },
];

const drawerLinks = [
  { section: 'Dashboard', items: [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/dashboard/api-keys', label: 'API Keys', icon: Key },
    { href: '/dashboard/projects', label: 'Projects', icon: FolderOpen },
    { href: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
    { href: '/dashboard/analytics', label: 'Analytics', icon: Cpu },
  ]},
  { section: 'Settings', items: [
    { href: '/settings', label: 'Settings', icon: Settings, exact: true },
    { href: '/settings/ai-providers', label: 'AI Providers', icon: Sparkles },
    { href: '/settings/account', label: 'Account', icon: User },
  ]},
  { section: 'Launch', items: [
    { href: 'https://www.npmjs.com/package/recoder-code', label: 'CLI', icon: Terminal, external: true },
    { href: 'https://web.recoder.xyz', label: 'Web IDE', icon: Globe, external: true },
  ]},
];

export function MobileNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Strip locale prefix for matching
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(?:\/|$)/, '/');

  const isActive = useCallback((href: string, exact?: boolean) => {
    if (exact) return pathWithoutLocale === href;
    return pathWithoutLocale.startsWith(href);
  }, [pathWithoutLocale]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <>
      {/* Hamburger Button — top-right, only on mobile */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed top-4 right-4 z-50 md:hidden p-2 rounded-lg bg-black/80 backdrop-blur-sm border border-white/10 text-white"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Slide-out Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer Panel */}
          <nav
            className="absolute top-0 right-0 bottom-0 w-72 bg-black border-l border-white/10 flex flex-col animate-in slide-in-from-right duration-200"
            aria-label="Mobile navigation"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
              <Link href="/" className="flex items-center">
                <img src="/logo.png" alt="Recoder" className="w-7 h-7 rounded-lg" />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Links */}
            <div className="flex-1 overflow-y-auto py-4 px-3">
              {drawerLinks.map((section) => (
                <div key={section.section} className="mb-6">
                  <p className="px-3 text-xs text-gray-600 uppercase tracking-wider mb-2">
                    {section.section}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((link) => {
                      const Icon = link.icon;
                      const active = !('external' in link) && isActive(link.href, 'exact' in link ? link.exact : false);

                      if ('external' in link && link.external) {
                        return (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <Icon className="w-4 h-4" />
                            <span>{link.label}</span>
                          </a>
                        );
                      }

                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={cn(
                            'flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            active
                              ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{link.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-black/95 backdrop-blur-sm border-t border-white/10"
           style={{ paddingBottom: 'var(--safe-area-bottom, 0px)' }}>
        <div className="flex items-center justify-around h-14">
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full space-y-0.5 transition-colors',
                  active ? 'text-orange-500' : 'text-gray-500 hover:text-gray-300'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
