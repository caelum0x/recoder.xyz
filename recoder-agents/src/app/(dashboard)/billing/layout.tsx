'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  CreditCard,
  LayoutList,
  BarChart3,
  Receipt,
  PieChart,
  Gauge,
} from 'lucide-react';

const billingTabs = [
  {
    label: 'Plans',
    href: '/billing/plans',
    icon: LayoutList,
  },
  {
    label: 'Subscription',
    href: '/billing/manage',
    icon: CreditCard,
  },
  {
    label: 'Usage',
    href: '/billing/usage',
    icon: BarChart3,
  },
  {
    label: 'Quotas',
    href: '/billing/quotas',
    icon: Gauge,
  },
  {
    label: 'Invoices',
    href: '/billing/invoices',
    icon: Receipt,
  },
  {
    label: 'Cost Dashboard',
    href: '/billing/cost-dashboard',
    icon: PieChart,
  },
];

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-0">
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Billing</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Manage your subscription, view usage, and download invoices.
          </p>

          {/* Tab Navigation */}
          <nav className="flex gap-1 overflow-x-auto -mb-px" aria-label="Billing tabs">
            {billingTabs.map((tab) => {
              const isActive =
                pathname === tab.href ||
                (tab.href === '/billing/plans' && pathname === '/billing');
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-primary text-foreground bg-muted/40'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
