'use client';

import React, { useState } from 'react';
import {
  Plug,
  Globe,
  Github,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import {
  useIntegrations,
  useDisconnectIntegration,
  useRefreshIntegration,
} from '@/hooks/platform/use-integrations';
import { DisconnectDialog } from '@/components/settings/disconnect-dialog';
import { IntegrationErrorBanner } from '@/components/settings/integration-error-banner';
import type { IntegrationStatus } from '@/lib/api/integrations';

function getProviderIcon(provider: string) {
  switch (provider) {
    case 'github':
      return Github;
    default:
      return Globe;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'connected':
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
          <CheckCircle className="mr-1 h-3 w-3" />
          Connected
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Error
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="default" className="bg-yellow-600 hover:bg-yellow-700 text-white">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Expired
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          Disconnected
        </Badge>
      );
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

function IntegrationCardSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationStatus }) {
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectIntegration();
  const { mutate: refresh, isPending: isRefreshing } = useRefreshIntegration();

  const Icon = getProviderIcon(integration.provider);

  const handleConnect = () => {
    window.open('https://recoder.xyz/settings/integrations', '_blank', 'noopener');
  };

  const handleDisconnect = () => {
    disconnect(integration.provider, {
      onSuccess: () => {
        setDisconnectOpen(false);
      },
    });
  };

  const handleRefresh = () => {
    refresh(integration.provider);
  };

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{integration.name}</CardTitle>
              <CardDescription className="text-xs capitalize">
                {integration.provider}
              </CardDescription>
            </div>
          </div>
          {getStatusBadge(integration.status)}
        </CardHeader>
        <CardContent>
          {integration.status === 'connected' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Connected:</span>{' '}
                  {formatDate(integration.connected_at)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Last sync:</span>{' '}
                  {formatDate(integration.last_sync)}
                </div>
              </div>
              {integration.scopes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {integration.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDisconnectOpen(true)}
                  disabled={isDisconnecting}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          )}

          {integration.status === 'disconnected' && (
            <div className="pt-1">
              <Button variant="default" size="sm" onClick={handleConnect}>
                Manage on recoder.xyz
              </Button>
            </div>
          )}

          {(integration.status === 'error' || integration.status === 'expired') && (
            <div className="space-y-3">
              {integration.error_message && (
                <p className="text-xs text-destructive">{integration.error_message}</p>
              )}
              <Button variant="default" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`mr-1 h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Reconnect
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <DisconnectDialog
        provider={integration.provider}
        providerName={integration.name}
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={handleDisconnect}
        isLoading={isDisconnecting}
      />
    </>
  );
}

export default function IntegrationsSettingsPage() {
  const { data, isLoading, error } = useIntegrations();

  const errorIntegrations = data?.integrations.filter(
    (i) => i.status === 'error' || i.status === 'expired',
  ) ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-4 sm:space-y-8">
        <PageHeader icon={Plug}>
          <span className="text-primary text-lg sm:text-xl">Integrations</span>
        </PageHeader>

        {errorIntegrations.length > 0 && (
          <IntegrationErrorBanner integrations={errorIntegrations} />
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <IntegrationCardSkeleton key={i} />
            ))}
          </div>
        )}

        {error && !isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <XCircle className="h-8 w-8 text-destructive mb-3" />
              <p className="text-sm text-muted-foreground">
                Failed to load integrations. Please try again later.
              </p>
            </CardContent>
          </Card>
        )}

        {data && !isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.integrations.map((integration) => (
              <IntegrationCard key={integration.provider} integration={integration} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
