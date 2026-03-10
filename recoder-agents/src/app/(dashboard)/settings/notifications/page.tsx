'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, Smartphone, AppWindow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/lib/toast';

const STORAGE_KEY = 'recoder-notification-preferences';

interface NotificationPreferences {
  email: {
    agentRunCompleted: boolean;
    agentRunFailed: boolean;
    weeklyUsageDigest: boolean;
    teamActivitySummary: boolean;
  };
  push: {
    realtimeAgentUpdates: boolean;
    systemAlerts: boolean;
    newSharedItems: boolean;
  };
  inApp: {
    allEvents: boolean;
  };
}

const defaultPreferences: NotificationPreferences = {
  email: {
    agentRunCompleted: true,
    agentRunFailed: true,
    weeklyUsageDigest: true,
    teamActivitySummary: false,
  },
  push: {
    realtimeAgentUpdates: true,
    systemAlerts: true,
    newSharedItems: false,
  },
  inApp: {
    allEvents: true,
  },
};

function loadPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return defaultPreferences;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore parse errors
  }
  return defaultPreferences;
}

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultPreferences);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setPrefs(loadPreferences());
  }, []);

  const updatePref = useCallback(
    <K extends keyof NotificationPreferences>(
      category: K,
      key: keyof NotificationPreferences[K],
      value: boolean
    ) => {
      setPrefs((prev) => ({
        ...prev,
        [category]: {
          ...prev[category],
          [key]: value,
        },
      }));
      setHasChanges(true);
    },
    []
  );

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      setHasChanges(false);
      toast.info('Notification preferences saved');
    } catch {
      toast.warning('Failed to save notification preferences');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how and when you want to be notified.
        </p>
      </div>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Notifications sent to your registered email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="email-run-completed"
            label="Agent run completed"
            description="Get notified when an agent finishes a run"
            checked={prefs.email.agentRunCompleted}
            onCheckedChange={(v) => updatePref('email', 'agentRunCompleted', v)}
          />
          <Separator />
          <ToggleRow
            id="email-run-failed"
            label="Agent run failed"
            description="Get alerted when an agent run encounters an error"
            checked={prefs.email.agentRunFailed}
            onCheckedChange={(v) => updatePref('email', 'agentRunFailed', v)}
          />
          <Separator />
          <ToggleRow
            id="email-weekly-digest"
            label="Weekly usage digest"
            description="A weekly summary of your agent usage and activity"
            checked={prefs.email.weeklyUsageDigest}
            onCheckedChange={(v) => updatePref('email', 'weeklyUsageDigest', v)}
          />
          <Separator />
          <ToggleRow
            id="email-team-activity"
            label="Team activity summary"
            description="Updates about your team members' activity"
            checked={prefs.email.teamActivitySummary}
            onCheckedChange={(v) => updatePref('email', 'teamActivitySummary', v)}
          />
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Real-time push notifications in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            id="push-realtime"
            label="Real-time agent updates"
            description="Live updates as your agents make progress"
            checked={prefs.push.realtimeAgentUpdates}
            onCheckedChange={(v) => updatePref('push', 'realtimeAgentUpdates', v)}
          />
          <Separator />
          <ToggleRow
            id="push-system"
            label="System alerts"
            description="Important system and security alerts"
            checked={prefs.push.systemAlerts}
            onCheckedChange={(v) => updatePref('push', 'systemAlerts', v)}
          />
          <Separator />
          <ToggleRow
            id="push-shared"
            label="New shared items"
            description="When someone shares an agent or thread with you"
            checked={prefs.push.newSharedItems}
            onCheckedChange={(v) => updatePref('push', 'newSharedItems', v)}
          />
        </CardContent>
      </Card>

      {/* In-App Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AppWindow className="h-5 w-5" />
            In-App Notifications
          </CardTitle>
          <CardDescription>
            Notifications shown within the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleRow
            id="inapp-all"
            label="All events"
            description="In-app notifications are always enabled for important events"
            checked={prefs.inApp.allEvents}
            onCheckedChange={() => {}}
            disabled
          />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={!hasChanges}>
        {hasChanges ? 'Save Preferences' : 'Preferences Saved'}
      </Button>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
