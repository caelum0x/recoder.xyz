'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession, signOut } from '@/lib/session-provider';
import {
  LayoutDashboard, Key, FolderOpen, BarChart3, Settings, LogOut,
  User, ChevronDown, Terminal, Sparkles, Cpu, Layers3
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { MobileNav } from '@/app/components/MobileNav';

const sidebarLinks = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/spaces', label: 'Spaces', icon: Layers3 },
  { href: '/dashboard/api-keys', label: 'Developer Keys', icon: Key },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderOpen },
  { href: '/dashboard/usage', label: 'Usage', icon: BarChart3 },
  { href: '/dashboard/analytics', label: 'Analytics', icon: Cpu },
];

const settingsLinks = [
  { href: '/settings', label: 'Settings', icon: Settings, exact: true },
  { href: '/settings/ai-providers', label: 'AI Provider Keys', icon: Sparkles },
  { href: '/settings/account', label: 'Account', icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.user) {
      const query = searchParams.toString();
      const pathWithQuery = `${pathname || '/dashboard'}${query ? `?${query}` : ''}`;
      const redirect = encodeURIComponent(pathWithQuery);
      router.replace(`/auth/signin?redirect=${redirect}`);
    }
  }, [isPending, pathname, router, searchParams, session?.user]);

  // Strip locale prefix for matching
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(?:\/|$)/, '/');

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathWithoutLocale === href;
    return pathWithoutLocale.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  if (isPending || !session?.user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Mobile Navigation */}
      <MobileNav />

      {/* Sidebar — hidden on mobile */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-white/10 bg-black/95 backdrop-blur-xl z-30 flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <Link href="/" className="flex items-center space-x-2 group">
            <img
              src="/logo.png"
              alt="Recoder"
              className="w-8 h-8 rounded-lg transition-transform group-hover:scale-110"
            />
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>

        {/* Nav Links */}
        <nav aria-label="Dashboard navigation" className="flex-1 overflow-y-auto py-4 px-3">
          <div className="space-y-1">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href, link.exact);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="px-3 text-xs text-gray-600 uppercase tracking-wider mb-2">Settings</p>
            <div className="space-y-1">
              {settingsLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href, link.exact);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Quick Launch */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="px-3 text-xs text-gray-600 uppercase tracking-wider mb-2">Launch</p>
            <div className="space-y-1">
              <a
                href="https://www.npmjs.com/package/recoder-code"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Terminal className="w-4 h-4" />
                <span>CLI</span>
              </a>
            </div>
          </div>
        </nav>

        {/* User Section */}
        <div className="border-t border-white/10 p-3">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">{session?.user?.name || 'User'}</div>
                <div className="text-xs text-gray-500 truncate">{session?.user?.email}</div>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/10 bg-black/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-2">
                    <Link
                      href="/settings/account"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-300">Account</span>
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-300">Settings</span>
                    </Link>
                  </div>
                  <div className="p-2 border-t border-white/10">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-300">Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-0 md:ml-64 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
