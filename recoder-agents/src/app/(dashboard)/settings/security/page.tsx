'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
  Shield,
  Monitor,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

const CredentialAuditLog = dynamic(
  () => import('@/components/settings/credential-audit-log'),
  { ssr: false }
);
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';
import { RECODER_ECOSYSTEM_URLS } from '@recoder/ecosystem-config';

export default function SecuritySettingsPage() {
  const { user, isLoading } = useAuth();

  const mainSiteSettingsUrl = `${RECODER_ECOSYSTEM_URLS.home}/settings/security`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Security</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage sessions and two-factor authentication.
        </p>
      </div>

      {/* Current Session */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Current Session
          </CardTitle>
          <CardDescription>
            Your active session on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-3 py-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
                <div className="h-3 w-56 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ) : user ? (
            <div className="flex items-center justify-between gap-4 py-1">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {user.email}
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      Current
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Active now
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No active session detected.
            </p>
          )}

          <div className="rounded-lg border border-muted bg-muted/30 p-3 mt-2">
            <p className="text-xs text-muted-foreground">
              To view and manage all active sessions across devices, visit your{' '}
              <a
                href={mainSiteSettingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
              >
                account security settings
                <ExternalLink className="h-3 w-3" />
              </a>{' '}
              on recoder.xyz.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">Status</p>
              <Badge
                variant="outline"
                className={cn(
                  'border-yellow-500/50 text-yellow-600 dark:text-yellow-400'
                )}
              >
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Not Available
                </span>
              </Badge>
            </div>
          </div>
          <div className="rounded-lg border border-muted bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Two-factor authentication is a planned feature. Once available, you will be able to
              configure TOTP-based 2FA from your{' '}
              <a
                href={mainSiteSettingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1"
              >
                account security settings
                <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Credential Vault Audit */}
      <div className="pt-4 border-t border-border">
        <CredentialAuditLog />
      </div>
    </div>
  );
}
