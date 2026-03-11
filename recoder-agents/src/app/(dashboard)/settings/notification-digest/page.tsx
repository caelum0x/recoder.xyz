'use client';

import React, { useState } from 'react';
import {
  Mail,
  Clock,
  Calendar,
  Eye,
  Loader2,
  History,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useDigestConfig,
  useSetDigestConfig,
  useGenerateDigest,
  useDigestHistory,
  usePreviewDigest,
} from '@/hooks/notifications/use-notification-digest';
import type { DigestPreview } from '@/lib/api/notification-digest';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Constants
// ============================================================================

const FREQUENCY_OPTIONS = [
  { value: 'off', label: 'Off', description: 'No digest emails' },
  { value: 'hourly', label: 'Hourly', description: 'Every hour' },
  { value: 'daily', label: 'Daily', description: 'Once per day' },
  { value: 'weekly', label: 'Weekly', description: 'Once per week' },
] as const;

const NOTIFICATION_TYPES = [
  { value: 'run_completed', label: 'Run Completed', description: 'Agent runs that finished successfully' },
  { value: 'run_failed', label: 'Run Failed', description: 'Agent runs that encountered errors' },
  { value: 'agent_error', label: 'Agent Error', description: 'Runtime agent errors' },
  { value: 'cost_exceeded', label: 'Cost Exceeded', description: 'Cost threshold alerts' },
  { value: 'health_degraded', label: 'Health Degraded', description: 'Service health warnings' },
  { value: 'quota_warning', label: 'Quota Warning', description: 'Usage quota approaching limit' },
  { value: 'thread_completed', label: 'Thread Completed', description: 'Conversation threads that finished' },
  { value: 'schedule_missed', label: 'Schedule Missed', description: 'Missed scheduled agent runs' },
  { value: 'system', label: 'System', description: 'General system notifications' },
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${i.toString().padStart(2, '0')}:00`,
}));

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

// ============================================================================
// Page Component
// ============================================================================

export default function NotificationDigestSettingsPage() {
  const { data: config, isLoading: configLoading } = useDigestConfig();
  const setConfig = useSetDigestConfig();
  const generateDigest = useGenerateDigest();
  const { data: historyData, isLoading: historyLoading } = useDigestHistory();
  const previewDigest = usePreviewDigest();

  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [expandedDigestId, setExpandedDigestId] = useState<string | null>(null);

  const handleFrequencyChange = (frequency: string) => {
    setConfig.mutate({
      frequency: frequency as 'off' | 'hourly' | 'daily' | 'weekly',
    });
  };

  const handleTypeToggle = (type: string, checked: boolean) => {
    if (!config) return;
    const currentTypes = config.include_types || [];
    const updatedTypes = checked
      ? [...currentTypes, type]
      : currentTypes.filter((t) => t !== type);
    setConfig.mutate({ include_types: updatedTypes });
  };

  const handleDeliveryHourChange = (hour: string) => {
    setConfig.mutate({ delivery_hour: parseInt(hour, 10) });
  };

  const handleDeliveryDayChange = (day: string) => {
    setConfig.mutate({ delivery_day: parseInt(day, 10) });
  };

  const handlePreview = async () => {
    const result = await previewDigest.mutateAsync();
    setPreview(result);
  };

  const handleGenerate = () => {
    generateDigest.mutate();
  };

  const isDigestEnabled = config?.frequency && config.frequency !== 'off';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notification Digest</h2>
        <p className="text-muted-foreground">
          Configure periodic summary emails of your notifications.
        </p>
      </div>

      <Separator />

      {/* Frequency Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Digest Frequency
          </CardTitle>
          <CardDescription>
            Choose how often you want to receive notification digests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <Skeleton className="h-10 w-64" />
          ) : (
            <Select
              value={config?.frequency || 'off'}
              onValueChange={handleFrequencyChange}
              disabled={setConfig.isPending}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {opt.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Notification Types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Included Notification Types
          </CardTitle>
          <CardDescription>
            Select which notification types to include in your digest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {NOTIFICATION_TYPES.map((type) => {
                const isChecked = config?.include_types?.includes(type.value) ?? false;
                return (
                  <div key={type.value} className="flex items-start space-x-3">
                    <Checkbox
                      id={`type-${type.value}`}
                      checked={isChecked}
                      onCheckedChange={(checked) =>
                        handleTypeToggle(type.value, !!checked)
                      }
                      disabled={setConfig.isPending}
                    />
                    <div className="grid gap-0.5 leading-none">
                      <Label
                        htmlFor={`type-${type.value}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {type.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {type.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Delivery Time
          </CardTitle>
          <CardDescription>
            Choose when to receive your digest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="flex gap-4">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Delivery Hour (UTC)</Label>
                <Select
                  value={String(config?.delivery_hour ?? 9)}
                  onValueChange={handleDeliveryHourChange}
                  disabled={setConfig.isPending || !isDigestEnabled}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Hour" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h.value} value={h.value}>
                        {h.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {config?.frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label className="text-sm">Delivery Day</Label>
                  <Select
                    value={String(config?.delivery_day ?? 1)}
                    onValueChange={handleDeliveryDayChange}
                    disabled={setConfig.isPending}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview & Generate
          </CardTitle>
          <CardDescription>
            Preview your next digest or generate one immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewDigest.isPending}
            >
              {previewDigest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview Digest
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateDigest.isPending || !isDigestEnabled}
            >
              {generateDigest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Generate Now
            </Button>
          </div>

          {/* Preview Result */}
          {preview && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Digest Preview</h4>
                <Badge variant="secondary">{preview.digest_type}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  Period: {format(parseISO(preview.period_start), 'PPp')} -{' '}
                  {format(parseISO(preview.period_end), 'PPp')}
                </p>
                <p>Total notifications: {preview.notification_count}</p>
              </div>
              {Object.keys(preview.groups).length > 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">By type:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(preview.groups).map(([type, count]) => (
                      <Badge key={type} variant="outline">
                        {type}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No notifications in this period.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Digest History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Digest History
          </CardTitle>
          <CardDescription>
            Past notification digests that have been generated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !historyData?.digests?.length ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No digests generated yet.
            </p>
          ) : (
            <div className="space-y-2">
              {historyData.digests.map((digest) => {
                const isExpanded = expandedDigestId === digest.id;
                const content = digest.content as Record<string, any>;
                const groups = (content?.groups || {}) as Record<string, number>;

                return (
                  <div
                    key={digest.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <button
                      className="flex w-full items-center justify-between text-left"
                      onClick={() =>
                        setExpandedDigestId(isExpanded ? null : digest.id)
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{digest.digest_type}</Badge>
                        <span className="text-sm">
                          {digest.notification_count} notification
                          {digest.notification_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {digest.created_at
                            ? format(parseISO(digest.created_at), 'PPp')
                            : ''}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="pt-2 border-t space-y-2">
                        <div className="text-xs text-muted-foreground">
                          <p>
                            Period: {format(parseISO(digest.period_start), 'PPp')}{' '}
                            - {format(parseISO(digest.period_end), 'PPp')}
                          </p>
                          {digest.sent_at && (
                            <p>
                              Sent: {format(parseISO(digest.sent_at), 'PPp')}
                            </p>
                          )}
                        </div>
                        {Object.keys(groups).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(groups).map(([type, count]) => (
                              <Badge key={type} variant="outline" className="text-xs">
                                {type}: {count}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {historyData.total > historyData.digests.length && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Showing {historyData.digests.length} of {historyData.total}{' '}
                  digests.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
