'use client';

import React, { useState } from 'react';
import {
  Download,
  Unplug,
  AlertTriangle,
  Github,
  Globe,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';
import {
  useIntegrations,
  useDisconnectIntegration,
} from '@/hooks/platform/use-integrations';
import { RECODER_ECOSYSTEM_URLS } from '@recoder/ecosystem-config';

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
        <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white text-xs">
          <CheckCircle className="mr-1 h-3 w-3" />
          Connected
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive" className="text-xs">
          <XCircle className="mr-1 h-3 w-3" />
          Error
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="default" className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Expired
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs">
          <Clock className="mr-1 h-3 w-3" />
          Disconnected
        </Badge>
      );
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function DataPrivacySettingsPage() {
  const [isExporting, setIsExporting] = useState(false);

  const { data: integrationsData, isLoading: integrationsLoading, error: integrationsError } = useIntegrations();
  const disconnectMutation = useDisconnectIntegration();

  const connectedIntegrations = integrationsData?.integrations?.filter(
    (i) => i.status === 'connected' || i.status === 'error' || i.status === 'expired'
  ) ?? [];

  const mainSiteAccountUrl = `${RECODER_ECOSYSTEM_URLS.home}/settings/account`;
  const mainSiteExportUrl = `${RECODER_ECOSYSTEM_URLS.home}/api/user/export`;

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // Hit the real GDPR data export endpoint on recoder.xyz
      const response = await fetch(mainSiteExportUrl, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      // Trigger browser download from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Extract filename from Content-Disposition or use default
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="?(.+?)"?$/);
      a.download = filenameMatch?.[1] || `recoder-data-export-${new Date().toISOString().split('T')[0]}.json`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.info('Data export downloaded successfully.');
    } catch (error) {
      console.error('Export error:', error);
      toast.warning(
        'Unable to export data automatically. You may need to request your export from your account settings on recoder.xyz.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleDisconnectApp = async (provider: string) => {
    try {
      await disconnectMutation.mutateAsync(provider);
      toast.info(`${provider} disconnected.`);
    } catch {
      toast.warning(`Failed to disconnect ${provider}. Please try again.`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Data & Privacy</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your data, connected applications, and privacy settings.
        </p>
      </div>

      {/* Export Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Data
          </CardTitle>
          <CardDescription>
            Download a copy of all your data including agents, threads, and settings as a JSON archive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleExportData} disabled={isExporting}>
            {isExporting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              'Download My Data'
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your export is generated from your account on recoder.xyz and includes profile data,
            settings, API key metadata, sessions, and connected accounts.
          </p>
        </CardContent>
      </Card>

      {/* Connected Apps — real data from integrations API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Unplug className="h-5 w-5" />
            Connected Apps
          </CardTitle>
          <CardDescription>
            Third-party applications with access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {integrationsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : integrationsError ? (
            <div className="rounded-lg border border-muted bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Unable to load connected apps. Check your{' '}
                <a
                  href={`${RECODER_ECOSYSTEM_URLS.home}/settings/integrations`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
                >
                  integrations settings
                  <ExternalLink className="h-3 w-3" />
                </a>
                .
              </p>
            </div>
          ) : connectedIntegrations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No connected applications.
            </p>
          ) : (
            connectedIntegrations.map((integration, index) => {
              const Icon = getProviderIcon(integration.provider);
              const connectedDate = formatDate(integration.connected_at);
              return (
                <React.Fragment key={integration.provider}>
                  {index > 0 && <Separator />}
                  <div className="flex items-center justify-between gap-4 py-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{integration.name}</p>
                          {getStatusBadge(integration.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {integration.scopes?.length > 0 && (
                            <>{integration.scopes.join(', ')} &middot; </>
                          )}
                          {connectedDate && <>Connected {connectedDate}</>}
                        </p>
                        {integration.error_message && (
                          <p className="text-xs text-destructive mt-0.5">
                            {integration.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnectApp(integration.provider)}
                      disabled={disconnectMutation.isPending}
                    >
                      Disconnect
                    </Button>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Delete Account — redirect to main site */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. All agents, threads,
            knowledge base entries, and settings will be permanently removed. This action
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Account deletion is managed centrally</AlertDialogTitle>
                <AlertDialogDescription>
                  Since your Recoder account is shared across all Recoder apps (Agents, Agency,
                  Web, PM), account deletion must be done from your main account settings on
                  recoder.xyz. This ensures all associated data is properly removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() => {
                    window.open(mainSiteAccountUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Go to Account Settings
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
