'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const devNav = [
  { label: 'API Explorer', href: '/developers' },
  { label: 'Playground', href: '/developers/playground' },
  { label: 'API Keys', href: '/developers/keys' },
  { label: 'Webhooks', href: '/developers/webhooks' },
  { label: 'Usage', href: '/developers/usage' },
  { label: 'Rate Limits', href: '/developers/rate-limits' },
  { label: 'API Heatmap', href: '/developers/api-heatmap' },
];

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Sub-navigation */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex gap-6" aria-label="Developer navigation">
            {devNav.map((item) => {
              const isActive =
                item.href === '/developers'
                  ? pathname === '/developers'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative py-3 text-sm font-medium transition-colors hover:text-foreground',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
