'use client';

import React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useSession } from '@/lib/session-provider';
import { LaunchWebIDEButton } from '@/app/components/LaunchWebIDEButton';
import { getServiceUrlClient } from '@/lib/config/platforms';

const NAV_LINKS = [
  { href: '/docs', label: 'Docs', external: false },
  { href: '/security', label: 'Security', external: false },
  { href: getServiceUrlClient('agents'), label: 'Agents', external: true },
  { href: '/dashboard', label: 'Dashboard', external: false },
];

interface SiteHeaderProps {
  /** Use fixed positioning (default true for marketing pages) */
  fixed?: boolean;
}

export function SiteHeader({ fixed = true }: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  // Fallback: check for session cookie even if session API fails
  const [hasCookie, setHasCookie] = useState(false);
  useState(() => {
    if (typeof document !== 'undefined') {
      setHasCookie(document.cookie.includes('recoder.session_token') || document.cookie.includes('better-auth.session_token'));
    }
  });

  // Strip locale prefix for matching (e.g. /en/agents -> /agents)
  const cleanPath = pathname?.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';

  const isActive = (href: string) => href.startsWith('/') && (cleanPath === href || cleanPath.startsWith(href + '/'));

  return (
    <>
      <header
        className={`${fixed ? 'fixed' : 'sticky'} top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl`}
      >
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group shrink-0">
            <img
              src="/logo.png"
              alt="Recoder"
              className="w-8 h-8 rounded-lg transition-transform group-hover:scale-110"
            />
            <span className="text-xl font-bold text-white">recoder</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center space-x-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={`text-sm transition-colors ${
                  isActive(link.href)
                    ? 'text-white font-medium'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {(session?.user || hasCookie) ? (
              <>
                <LaunchWebIDEButton className="px-4 py-2 text-sm bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg transition-colors flex items-center space-x-2" />
                <Link
                  href="/auth/signout"
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-red-400 transition-colors"
                >
                  Sign Out
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-white/20 hover:border-white/40 rounded-lg transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors text-white"
                >
                  Sign Up
                </Link>
              </>
            )}

          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-5 h-5 text-gray-400" />
            ) : (
              <Menu className="w-5 h-5 text-gray-400" />
            )}
          </button>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-xl">
            <div className="container mx-auto px-6 py-4 space-y-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => setMobileOpen(false)}
                  className={`block py-2 text-sm transition-colors ${
                    isActive(link.href)
                      ? 'text-white font-medium'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              <div className="border-t border-white/10 pt-3 space-y-3">
                {(session?.user || hasCookie) ? (
                  <>
                    <LaunchWebIDEButton className="w-full px-4 py-2.5 text-sm bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg transition-colors flex items-center justify-center space-x-2" />
                    <Link
                      href="/auth/signout"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm text-gray-400 hover:text-red-400 transition-colors"
                    >
                      Sign Out
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/auth/signin"
                      onClick={() => setMobileOpen(false)}
                      className="block py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/auth/signup"
                      onClick={() => setMobileOpen(false)}
                      className="block w-full text-center px-4 py-2.5 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors text-white"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Spacer for fixed headers */}
      {fixed && <div className="h-16" />}
    </>
  );
}
