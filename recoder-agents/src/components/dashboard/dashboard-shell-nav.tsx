'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    match: (pathname: string) =>
      !pathname.startsWith('/agents') &&
      !pathname.startsWith('/workflows') &&
      !pathname.startsWith('/squads') &&
      !pathname.startsWith('/team') &&
      !pathname.startsWith('/capabilities'),
  },
  { href: '/agents', label: 'Agents', match: (pathname: string) => pathname.startsWith('/agents') },
  { href: '/workflows', label: 'Workflows', match: (pathname: string) => pathname.startsWith('/workflows') },
  { href: '/squads', label: 'Squads', match: (pathname: string) => pathname.startsWith('/squads') },
  { href: '/team', label: 'Team', match: (pathname: string) => pathname.startsWith('/team') },
  { href: '/capabilities', label: 'Capabilities', match: (pathname: string) => pathname.startsWith('/capabilities') },
];

export function DashboardShellNav() {
  const pathname = usePathname() || '/dashboard';

  return (
    <nav
      aria-label="Dashboard navigation"
      className="flex h-8 items-center gap-1 border-b border-border/50 bg-background px-3 text-xs"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`dashboard-shell-nav-${item.label.toLowerCase()}`}
            className={cn(
              'rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
              isActive && 'bg-muted text-foreground font-medium'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
