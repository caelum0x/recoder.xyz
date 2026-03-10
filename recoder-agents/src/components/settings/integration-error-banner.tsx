'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRefreshIntegration } from '@/hooks/platform/use-integrations';
import type { IntegrationStatus } from '@/lib/api/integrations';

const DISMISS_KEY = 'integration-error-banner-dismissed';

interface IntegrationErrorBannerProps {
  integrations: IntegrationStatus[];
}

export function IntegrationErrorBanner({ integrations }: IntegrationErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { mutate: refresh, isPending: isRefreshing } = useRefreshIntegration();

  useEffect(() => {
    const stored = sessionStorage.getItem(DISMISS_KEY);
    if (stored === 'true') {
      setDismissed(true);
    }
  }, []);

  if (dismissed || integrations.length === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, 'true');
  };

  const handleReconnect = (provider: string) => {
    refresh(provider);
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {integrations.length} integration{integrations.length > 1 ? 's' : ''} need
            {integrations.length === 1 ? 's' : ''} attention
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {integrations.map((integration) => (
            <div
              key={integration.provider}
              className="flex items-center justify-between rounded-md bg-amber-500/10 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {integration.name}
                </span>
                {integration.error_message && (
                  <p className="text-xs text-muted-foreground truncate">
                    {integration.error_message}
                  </p>
                )}
                <span className="text-xs text-amber-700 dark:text-amber-300 capitalize">
                  {integration.status}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-3 shrink-0"
                onClick={() => handleReconnect(integration.provider)}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`mr-1 h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                Reconnect
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
