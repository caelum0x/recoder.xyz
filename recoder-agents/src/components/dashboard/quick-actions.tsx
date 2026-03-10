'use client';

import Link from 'next/link';
import { Plus, MessageSquare, GitBranch, BarChart3 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ACTIONS = [
  { label: 'New Agent', href: '/agents', icon: Plus },
  { label: 'New Thread', href: '/', icon: MessageSquare },
  { label: 'View Workflows', href: '/agents', icon: GitBranch },
  { label: 'Analytics', href: '/agents/config', icon: BarChart3 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {ACTIONS.map(({ label, href, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          className="flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/60"
        >
          <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          {label}
        </Link>
      ))}
    </div>
  );
}
