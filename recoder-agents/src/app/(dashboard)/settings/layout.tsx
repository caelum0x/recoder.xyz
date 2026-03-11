'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  User,
  Bell,
  Palette,
  Shield,
  Key,
  Database,
  Download,
  Users,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsNav = [
  { label: 'Account', href: '/settings/account', icon: User },
  { label: 'Notifications', href: '/settings/notifications', icon: Bell },
  { label: 'Appearance', href: '/settings/appearance', icon: Palette },
  { label: 'Security', href: '/settings/security', icon: Shield },
  { label: 'API Keys', href: '/settings/api-keys', icon: Key },
  { label: 'Credentials', href: '/settings/credentials', icon: Database },
  { label: 'Team', href: '/settings/team', icon: Users },
  { label: 'Webhooks', href: '/settings/webhooks', icon: Webhook },
  { label: 'Data & Privacy', href: '/settings/data-privacy', icon: Download },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* Desktop sidebar nav */}
        <nav className="hidden md:flex flex-col w-56 shrink-0 space-y-1">
          <h2 className="text-lg font-semibold mb-4 px-3">Settings</h2>
          {settingsNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile horizontal tabs */}
        <nav className="md:hidden flex gap-1 overflow-x-auto pb-2 -mx-3 px-3 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {settingsNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
