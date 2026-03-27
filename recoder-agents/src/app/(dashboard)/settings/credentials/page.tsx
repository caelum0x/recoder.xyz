'use client';

import React from 'react';
import { Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

export default function AppProfilesPage() {
  return (
    <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-4 sm:space-y-8">
        <PageHeader icon={Zap}>
          <span className="text-primary text-lg sm:text-xl">App Credentials</span>
        </PageHeader>
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Coming Soon</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            App credential management is being set up. You can configure API keys and integrations directly in your agent settings.
          </p>
        </div>
      </div>
    </div>
  );
}
