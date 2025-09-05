'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { 
  Bell, Mail, Smartphone, MessageSquare, Calendar, 
  Activity, AlertCircle, CheckCircle, Clock, Volume2, 
  VolumeX, Settings, Filter, Users, Code, Shield, 
  TrendingUp, Zap, Database, Globe, GitBranch
} from 'lucide-react';
import { toast } from 'sonner';

interface NotificationPreferences {
  email: {
    enabled: boolean;
    frequency: 'instant' | 'hourly' | 'daily' | 'weekly';
    types: {
      projectUpdates: boolean;
      collaborationInvites: boolean;
      deploymentStatus: boolean;
      securityAlerts: boolean;
      systemUpdates: boolean;
      marketingNews: boolean;
      billing: boolean;
      aiInsights: boolean;
    };
  };
  push: {
    enabled: boolean;
    types: {
      realTimeAlerts: boolean;
      mentionsAndReplies: boolean;
      projectNotifications: boolean;
      errorAlerts: boolean;
    };
  };
  inApp: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    frequency: 'all' | 'important' | 'minimal';
  };
  teamNotifications: {
    enabled: boolean;
    memberActivity: boolean;
    roleChanges: boolean;
    projectSharing: boolean;
  };
  aiNotifications: {
    enabled: boolean;
    consensusUpdates: boolean;
    optimizationSuggestions: boolean;
    modelPerformance: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
}

export default function NotificationPreferencesPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email: {
      enabled: true,
      frequency: 'daily',
      types: {
        projectUpdates: true,
        collaborationInvites: true,
        deploymentStatus: true,
        securityAlerts: true,
        systemUpdates: false,
        marketingNews: false,
        billing: true,
        aiInsights: true,
      },
    },
    push: {
      enabled: true,
      types: {
        realTimeAlerts: true,
        mentionsAndReplies: true,
        projectNotifications: false,
        errorAlerts: true,
      },
    },
    inApp: {
      enabled: true,
      sound: true,
      desktop: true,
      frequency: 'important',
    },
    teamNotifications: {
      enabled: true,
      memberActivity: false,
      roleChanges: true,
      projectSharing: true,
    },
    aiNotifications: {
      enabled: true,
      consensusUpdates: true,
      optimizationSuggestions: true,
      modelPerformance: false,
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
      timezone: 'UTC',
    },
  });

  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/user/notifications/preferences');
      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          setPreferences(data.preferences);
        }
      }
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferences = async (newPreferences: NotificationPreferences) => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/notifications/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferences: newPreferences }),
      });

      if (response.ok) {
        setPreferences(newPreferences);
        toast.success('Notification preferences updated');
      } else {
        toast.error('Failed to update preferences');
      }
    } catch (error) {
      console.error('Failed to update preferences:', error);
      toast.error('Failed to update preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailTypeChange = (type: keyof typeof preferences.email.types, enabled: boolean) => {
    const newPreferences = {
      ...preferences,
      email: {
        ...preferences.email,
        types: {
          ...preferences.email.types,
          [type]: enabled,
        },
      },
    };
    updatePreferences(newPreferences);
  };

  const handlePushTypeChange = (type: keyof typeof preferences.push.types, enabled: boolean) => {
    const newPreferences = {
      ...preferences,
      push: {
        ...preferences.push,
        types: {
          ...preferences.push.types,
          [type]: enabled,
        },
      },
    };
    updatePreferences(newPreferences);
  };

  const notificationStats = {
    totalEnabled: Object.values(preferences.email.types).filter(Boolean).length +
                  Object.values(preferences.push.types).filter(Boolean).length,
    emailTypes: Object.values(preferences.email.types).filter(Boolean).length,
    pushTypes: Object.values(preferences.push.types).filter(Boolean).length,
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Notification Preferences</h1>
          <p className="text-muted-foreground mt-2">
            Customize how and when you receive notifications from Recoder.xyz
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Bell className="h-3 w-3" />
            {notificationStats.totalEnabled} Active
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Email Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Receive updates and alerts via email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-enabled">Enable email notifications</Label>
                <Switch
                  id="email-enabled"
                  checked={preferences.email.enabled}
                  onCheckedChange={(enabled) => 
                    updatePreferences({ ...preferences, email: { ...preferences.email, enabled } })
                  }
                />
              </div>

              {preferences.email.enabled && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Email frequency</Label>
                    <Select
                      value={preferences.email.frequency}
                      onValueChange={(frequency: any) =>
                        updatePreferences({ ...preferences, email: { ...preferences.email, frequency } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="hourly">Hourly digest</SelectItem>
                        <SelectItem value="daily">Daily digest</SelectItem>
                        <SelectItem value="weekly">Weekly summary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />
                  <div className="space-y-3">
                    <Label>Email notification types</Label>
                    {[
                      { key: 'projectUpdates', label: 'Project updates', icon: Code },
                      { key: 'collaborationInvites', label: 'Collaboration invites', icon: Users },
                      { key: 'deploymentStatus', label: 'Deployment status', icon: Globe },
                      { key: 'securityAlerts', label: 'Security alerts', icon: Shield },
                      { key: 'systemUpdates', label: 'System updates', icon: Settings },
                      { key: 'marketingNews', label: 'Marketing news', icon: TrendingUp },
                      { key: 'billing', label: 'Billing notifications', icon: Database },
                      { key: 'aiInsights', label: 'AI insights', icon: Zap },
                    ].map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor={`email-${key}`}>{label}</Label>
                        </div>
                        <Switch
                          id={`email-${key}`}
                          checked={preferences.email.types[key as keyof typeof preferences.email.types]}
                          onCheckedChange={(enabled) => handleEmailTypeChange(key as any, enabled)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
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
                Get instant notifications on your devices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="push-enabled">Enable push notifications</Label>
                <Switch
                  id="push-enabled"
                  checked={preferences.push.enabled}
                  onCheckedChange={(enabled) =>
                    updatePreferences({ ...preferences, push: { ...preferences.push, enabled } })
                  }
                />
              </div>

              {preferences.push.enabled && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label>Push notification types</Label>
                    {[
                      { key: 'realTimeAlerts', label: 'Real-time alerts', icon: AlertCircle },
                      { key: 'mentionsAndReplies', label: 'Mentions and replies', icon: MessageSquare },
                      { key: 'projectNotifications', label: 'Project notifications', icon: Code },
                      { key: 'errorAlerts', label: 'Error alerts', icon: AlertCircle },
                    ].map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor={`push-${key}`}>{label}</Label>
                        </div>
                        <Switch
                          id={`push-${key}`}
                          checked={preferences.push.types[key as keyof typeof preferences.push.types]}
                          onCheckedChange={(enabled) => handlePushTypeChange(key as any, enabled)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* In-App Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                In-App Notifications
              </CardTitle>
              <CardDescription>
                Control notifications within the Recoder.xyz platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="inapp-enabled">Enable in-app notifications</Label>
                <Switch
                  id="inapp-enabled"
                  checked={preferences.inApp.enabled}
                  onCheckedChange={(enabled) =>
                    updatePreferences({ ...preferences, inApp: { ...preferences.inApp, enabled } })
                  }
                />
              </div>

              {preferences.inApp.enabled && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="sound-enabled">Play sounds</Label>
                    </div>
                    <Switch
                      id="sound-enabled"
                      checked={preferences.inApp.sound}
                      onCheckedChange={(sound) =>
                        updatePreferences({ ...preferences, inApp: { ...preferences.inApp, sound } })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="desktop-enabled">Desktop notifications</Label>
                    </div>
                    <Switch
                      id="desktop-enabled"
                      checked={preferences.inApp.desktop}
                      onCheckedChange={(desktop) =>
                        updatePreferences({ ...preferences, inApp: { ...preferences.inApp, desktop } })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notification frequency</Label>
                    <Select
                      value={preferences.inApp.frequency}
                      onValueChange={(frequency: any) =>
                        updatePreferences({ ...preferences, inApp: { ...preferences.inApp, frequency } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All notifications</SelectItem>
                        <SelectItem value="important">Important only</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Team Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Notifications
              </CardTitle>
              <CardDescription>
                Stay updated on team activities and changes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="team-enabled">Enable team notifications</Label>
                <Switch
                  id="team-enabled"
                  checked={preferences.teamNotifications.enabled}
                  onCheckedChange={(enabled) =>
                    updatePreferences({ 
                      ...preferences, 
                      teamNotifications: { ...preferences.teamNotifications, enabled } 
                    })
                  }
                />
              </div>

              {preferences.teamNotifications.enabled && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    {[
                      { key: 'memberActivity', label: 'Member activity updates' },
                      { key: 'roleChanges', label: 'Role and permission changes' },
                      { key: 'projectSharing', label: 'Project sharing notifications' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label htmlFor={`team-${key}`}>{label}</Label>
                        <Switch
                          id={`team-${key}`}
                          checked={preferences.teamNotifications[key as keyof typeof preferences.teamNotifications]}
                          onCheckedChange={(enabled) =>
                            updatePreferences({
                              ...preferences,
                              teamNotifications: {
                                ...preferences.teamNotifications,
                                [key]: enabled,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notification Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Email types</span>
                <Badge variant="outline">{notificationStats.emailTypes}/8</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Push types</span>
                <Badge variant="outline">{notificationStats.pushTypes}/4</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total active</span>
                <Badge variant="default">{notificationStats.totalEnabled}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  const allEnabled = { ...preferences };
                  Object.keys(allEnabled.email.types).forEach(key => {
                    (allEnabled.email.types as any)[key] = true;
                  });
                  Object.keys(allEnabled.push.types).forEach(key => {
                    (allEnabled.push.types as any)[key] = true;
                  });
                  updatePreferences(allEnabled);
                }}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Enable All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  const essentialOnly = { ...preferences };
                  essentialOnly.email.types = {
                    projectUpdates: true,
                    collaborationInvites: true,
                    deploymentStatus: true,
                    securityAlerts: true,
                    systemUpdates: false,
                    marketingNews: false,
                    billing: true,
                    aiInsights: false,
                  };
                  essentialOnly.push.types = {
                    realTimeAlerts: true,
                    mentionsAndReplies: true,
                    projectNotifications: false,
                    errorAlerts: true,
                  };
                  updatePreferences(essentialOnly);
                }}
              >
                <Filter className="h-4 w-4 mr-2" />
                Essential Only
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  const allDisabled = { ...preferences };
                  Object.keys(allDisabled.email.types).forEach(key => {
                    (allDisabled.email.types as any)[key] = false;
                  });
                  Object.keys(allDisabled.push.types).forEach(key => {
                    (allDisabled.push.types as any)[key] = false;
                  });
                  updatePreferences(allDisabled);
                }}
              >
                <VolumeX className="h-4 w-4 mr-2" />
                Disable All
              </Button>
            </CardContent>
          </Card>

          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Quiet Hours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="quiet-enabled" className="text-sm">Enable quiet hours</Label>
                <Switch
                  id="quiet-enabled"
                  checked={preferences.quietHours.enabled}
                  onCheckedChange={(enabled) =>
                    updatePreferences({
                      ...preferences,
                      quietHours: { ...preferences.quietHours, enabled },
                    })
                  }
                />
              </div>
              {preferences.quietHours.enabled && (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Notifications will be silenced during these hours.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="quiet-start">Start</Label>
                      <input
                        id="quiet-start"
                        type="time"
                        value={preferences.quietHours.start}
                        onChange={(e) =>
                          updatePreferences({
                            ...preferences,
                            quietHours: { ...preferences.quietHours, start: e.target.value },
                          })
                        }
                        className="w-full p-1 border rounded text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="quiet-end">End</Label>
                      <input
                        id="quiet-end"
                        type="time"
                        value={preferences.quietHours.end}
                        onChange={(e) =>
                          updatePreferences({
                            ...preferences,
                            quietHours: { ...preferences.quietHours, end: e.target.value },
                          })
                        }
                        className="w-full p-1 border rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
