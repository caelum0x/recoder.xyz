'use client';

import React, { useState } from 'react';
import {
  Hash,
  MessageSquare,
  Mail,
  Plus,
  Trash2,
  Send,
  Pencil,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useNotificationChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useTestChannel,
} from '@/hooks/platform/use-notification-channels';
import { CHANNEL_EVENTS, type NotificationChannel } from '@/lib/api/notification-channels';
import { toast } from '@/lib/toast';
import { RecoderLoader } from '@/components/ui/recoder-loader';

const CHANNEL_TYPE_ICONS: Record<string, React.ElementType> = {
  slack: Hash,
  discord: MessageSquare,
  email: Mail,
};

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  slack: 'bg-[#4A154B]/10 text-[#4A154B] dark:text-[#E01E5A]',
  discord: 'bg-[#5865F2]/10 text-[#5865F2]',
  email: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

const SETUP_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
  slack: {
    title: 'Slack Webhook Setup',
    steps: [
      'Go to api.slack.com/apps and create a new app (or use an existing one)',
      'Enable "Incoming Webhooks" in the Features section',
      'Click "Add New Webhook to Workspace"',
      'Select the channel to post notifications to',
      'Copy the webhook URL and paste it below',
    ],
  },
  discord: {
    title: 'Discord Webhook Setup',
    steps: [
      'Open Discord and go to the channel you want notifications in',
      'Click the gear icon to open Channel Settings',
      'Go to Integrations > Webhooks',
      'Click "New Webhook" and customize the name',
      'Click "Copy Webhook URL" and paste it below',
    ],
  },
  email: {
    title: 'Email Webhook Setup',
    steps: [
      'Enter a webhook URL that accepts POST requests with JSON payload',
      'The payload will include title, message, and event metadata',
    ],
  },
};

function AddChannelDialog() {
  const [open, setOpen] = useState(false);
  const [channelType, setChannelType] = useState<'slack' | 'discord' | 'email'>('slack');
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const createChannel = useCreateChannel();

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a channel name');
      return;
    }
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL');
      return;
    }
    try {
      await createChannel.mutateAsync({
        channel_type: channelType,
        name: name.trim(),
        webhook_url: webhookUrl.trim(),
        events: selectedEvents,
      });
      toast.success('Channel created successfully');
      setOpen(false);
      setName('');
      setWebhookUrl('');
      setSelectedEvents([]);
      setChannelType('slack');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create channel');
    }
  };

  const instructions = SETUP_INSTRUCTIONS[channelType];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" size="sm">
          <Plus className="h-4 w-4" />
          Add Channel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Notification Channel</DialogTitle>
          <DialogDescription>
            Connect a Slack or Discord channel to receive notifications.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Channel Type */}
          <div className="space-y-2">
            <Label>Channel Type</Label>
            <Select value={channelType} onValueChange={(v) => setChannelType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4" /> Slack
                  </div>
                </SelectItem>
                <SelectItem value="discord">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" /> Discord
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Setup Instructions */}
          {instructions && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">{instructions.title}</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                {instructions.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. #${channelType === 'slack' ? 'recoder-alerts' : 'agent-notifications'}`}
            />
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <Input
              id="webhook-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={
                channelType === 'slack'
                  ? 'https://hooks.slack.com/services/...'
                  : 'https://discord.com/api/webhooks/...'
              }
              type="url"
            />
          </div>

          {/* Event Selection */}
          <div className="space-y-2">
            <Label>Events to receive</Label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_EVENTS.map(({ value, label }) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2 hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedEvents.includes(value)}
                    onCheckedChange={() => toggleEvent(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {selectedEvents.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No events selected = receive all events
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createChannel.isPending}>
            {createChannel.isPending ? 'Creating...' : 'Create Channel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelRow({ channel }: { channel: NotificationChannel }) {
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const testChannel = useTestChannel();

  const Icon = CHANNEL_TYPE_ICONS[channel.channel_type] || Mail;
  const colorClass = CHANNEL_TYPE_COLORS[channel.channel_type] || '';

  const handleToggle = async (checked: boolean) => {
    try {
      await updateChannel.mutateAsync({
        channelId: channel.id,
        data: { is_active: checked },
      });
      toast.success(checked ? 'Channel enabled' : 'Channel disabled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update channel');
    }
  };

  const handleTest = async () => {
    try {
      await testChannel.mutateAsync(channel.id);
      toast.success('Test notification sent!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send test notification');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteChannel.mutateAsync(channel.id);
      toast.success('Channel deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete channel');
    }
  };

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${colorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{channel.name}</span>
            <Badge variant="outline" className="text-[10px] capitalize">
              {channel.channel_type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {channel.events && channel.events.length > 0
              ? `${channel.events.length} event${channel.events.length > 1 ? 's' : ''}`
              : 'All events'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleTest}
          disabled={testChannel.isPending}
          title="Send test notification"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
        <Switch
          checked={channel.is_active}
          onCheckedChange={handleToggle}
          disabled={updateChannel.isPending}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={deleteChannel.isPending}
          title="Delete channel"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function NotificationChannelsPanel() {
  const { data: channels, isLoading } = useNotificationChannels();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ExternalLink className="h-5 w-5" />
              External Channels
            </CardTitle>
            <CardDescription>
              Send notifications to Slack, Discord, or other webhooks
            </CardDescription>
          </div>
          <AddChannelDialog />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <RecoderLoader size="small" />
          </div>
        ) : !channels || channels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No channels configured</p>
            <p className="text-xs mt-1">Add a Slack or Discord channel to get started</p>
          </div>
        ) : (
          <div className="divide-y">
            {channels.map((channel) => (
              <ChannelRow key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
