'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  HeartPulse,
  BarChart3,
  Users,
  Activity,
  ToggleLeft,
  FileText,
} from 'lucide-react';

const ADMIN_TABS = [
  { href: '/admin/health', label: 'Health', icon: HeartPulse },
  { href: '/admin/metrics', label: 'Metrics', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/activity', label: 'Activity', icon: Activity },
  { href: '/admin/features', label: 'Features', icon: ToggleLeft },
  { href: '/admin/audit', label: 'Audit Logs', icon: FileText },
] as const;

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          System health, metrics, and platform management
        </p>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {ADMIN_TABS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
