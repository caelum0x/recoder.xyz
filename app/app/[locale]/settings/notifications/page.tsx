/**
 * Notification Settings Page
 * Configure email and in-app notification preferences
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { registerPushNotifications, unregisterPushNotifications } from '@/lib/push-client';
import { 
  ArrowLeft,
  Terminal,
  Bell,
  Mail,
  MessageSquare,
  DollarSign,
  Shield,
  Zap,
  Save,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  icon: any;
  channels: {
    email: boolean;
    inApp: boolean;
  };
}

export default function NotificationSettingsPage() {
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [canUseAdminPushTest, setCanUseAdminPushTest] = useState(false);
  const [adminPushLoading, setAdminPushLoading] = useState(false);
  const [adminPushMessage, setAdminPushMessage] = useState('');
  const [adminPushSubscriptionCount, setAdminPushSubscriptionCount] = useState<number | null>(null);
  const [adminPushTitle, setAdminPushTitle] = useState('Recoder test notification');
  const [adminPushBody, setAdminPushBody] = useState('This is a push test from settings.');
  const [adminPushUrl, setAdminPushUrl] = useState('/dashboard');
  const [adminPushMaxTargets, setAdminPushMaxTargets] = useState(25);

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    {
      id: 'usage',
      title: 'Usage Alerts',
      description: 'Get notified when you reach 80%, 90%, and 100% of your quota',
      icon: Zap,
      channels: {
        email: true,
        inApp: true
      }
    },
    {
      id: 'billing',
      title: 'Billing & Payments',
      description: 'Invoices, payment confirmations, and subscription changes',
      icon: DollarSign,
      channels: {
        email: true,
        inApp: false
      }
    },
    {
      id: 'security',
      title: 'Security Alerts',
      description: 'Login notifications, password changes, and security updates',
      icon: Shield,
      channels: {
        email: true,
        inApp: true
      }
    },
    {
      id: 'product',
      title: 'Product Updates',
      description: 'New features, improvements, and platform announcements',
      icon: Bell,
      channels: {
        email: false,
        inApp: true
      }
    },
    {
      id: 'marketing',
      title: 'Marketing Emails',
      description: 'Tips, tutorials, case studies, and promotional content',
      icon: Mail,
      channels: {
        email: false,
        inApp: false
      }
    }
  ]);

  const [digestSettings, setDigestSettings] = useState({
    enabled: true,
    frequency: 'daily' as 'daily' | 'weekly' | 'monthly'
  });

  // Load notification settings on mount
  useEffect(() => {
    loadNotificationSettings();
    void loadPushState();
    void loadAdminPushStatus();
  }, []);

  async function loadPushState() {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setPushSupported(supported);
    if (!supported) {
      setPushEnabled(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration('/service-worker.js');
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      setPushEnabled(Boolean(subscription) && Notification.permission === 'granted');
    } catch {
      setPushEnabled(false);
    }
  }

  async function handlePushToggle() {
    if (!pushSupported || pushLoading) return;

    setPushLoading(true);
    setPushMessage('');
    try {
      const result = pushEnabled
        ? await unregisterPushNotifications()
        : await registerPushNotifications();
      setPushMessage(result.message);
      if (result.ok) {
        setPushEnabled(!pushEnabled);
      }
    } catch {
      setPushMessage('Failed to update push notification preference');
    } finally {
      setPushLoading(false);
    }
  }

  async function loadAdminPushStatus() {
    try {
      const response = await fetch('/api/push/test');
      if (response.status === 401 || response.status === 403) {
        setCanUseAdminPushTest(false);
        return;
      }

      const data = await response.json();
      if (response.ok && data.success) {
        setCanUseAdminPushTest(true);
        setAdminPushSubscriptionCount(
          typeof data.subscriptionCount === 'number' ? data.subscriptionCount : null
        );
      } else {
        setCanUseAdminPushTest(false);
      }
    } catch {
      setCanUseAdminPushTest(false);
    }
  }

  async function runAdminPushTest(dryRun: boolean) {
    setAdminPushLoading(true);
    setAdminPushMessage('');

    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          transport: 'direct',
          title: adminPushTitle,
          body: adminPushBody,
          url: adminPushUrl,
          maxTargets: adminPushMaxTargets,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setAdminPushMessage(data.error || 'Failed to execute admin push test');
        return;
      }

      if (dryRun) {
        const count = Array.isArray(data.subscriptions) ? data.subscriptions.length : 0;
        setAdminPushMessage(`Dry run successful. Matched ${count} subscriptions.`);
      } else {
        setAdminPushMessage(
          `Direct send complete. Delivered: ${data.delivered ?? 0}, Failed: ${data.failed ?? 0}, Pruned: ${data.prunedStaleSubscriptions ?? 0}.`
        );
      }
      await loadAdminPushStatus();
    } catch {
      setAdminPushMessage('Network error while running admin push test');
    } finally {
      setAdminPushLoading(false);
    }
  }

  async function loadNotificationSettings() {
    try {
      setPageLoading(true);
      const response = await fetch('/api/settings/notifications');
      const data = await response.json();

      if (data.success && data.settings) {
        const s = data.settings;

        // Map database settings to UI structure
        setNotifications([
          {
            id: 'usage',
            title: 'Usage Alerts',
            description: 'Get notified when you reach 80%, 90%, and 100% of your quota',
            icon: Zap,
            channels: {
              email: s.email_notifications && s.project_updates,
              inApp: s.desktop_notifications
            }
          },
          {
            id: 'billing',
            title: 'Billing & Payments',
            description: 'Invoices, payment confirmations, and subscription changes',
            icon: DollarSign,
            channels: {
              email: s.email_notifications && s.billing_updates,
              inApp: false
            }
          },
          {
            id: 'security',
            title: 'Security Alerts',
            description: 'Login notifications, password changes, and security updates',
            icon: Shield,
            channels: {
              email: s.email_notifications && s.security_alerts,
              inApp: s.desktop_notifications
            }
          },
          {
            id: 'product',
            title: 'Product Updates',
            description: 'New features, improvements, and platform announcements',
            icon: Bell,
            channels: {
              email: s.email_notifications,
              inApp: s.desktop_notifications
            }
          },
          {
            id: 'marketing',
            title: 'Marketing Emails',
            description: 'Tips, tutorials, case studies, and promotional content',
            icon: Mail,
            channels: {
              email: false,
              inApp: false
            }
          }
        ]);

        setDigestSettings({
          enabled: s.email_digest || false,
          frequency: (s.notification_frequency || 'daily') as 'daily' | 'weekly' | 'monthly'
        });
      }
    } catch (err) {
      console.error('Failed to load notification settings:', err);
    } finally {
      setPageLoading(false);
    }
  }

  const toggleChannel = (notificationId: string, channel: 'email' | 'inApp') => {
    setNotifications(notifications.map(n => {
      if (n.id === notificationId) {
        return {
          ...n,
          channels: {
            ...n.channels,
            [channel]: !n.channels[channel]
          }
        };
      }
      return n;
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Map UI structure to database schema
      const hasAnyEmail = notifications.some(n => n.channels.email);
      const hasAnyInApp = notifications.some(n => n.channels.inApp);

      const billingNotif = notifications.find(n => n.id === 'billing');
      const securityNotif = notifications.find(n => n.id === 'security');
      const usageNotif = notifications.find(n => n.id === 'usage');

      const response = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_notifications: hasAnyEmail,
          desktop_notifications: hasAnyInApp,
          sound_enabled: true,
          notification_frequency: digestSettings.frequency,
          email_digest: digestSettings.enabled,
          project_updates: usageNotif?.channels.email || false,
          security_alerts: securityNotif?.channels.email || false,
          billing_updates: billingNotif?.channels.email || false,
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to update notification settings');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-3xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Notification Settings</h1>
            <p className="text-gray-400">Choose how and when you want to be notified</p>
          </div>

          {/* Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400">Notification settings updated successfully!</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Notification Categories */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-lg font-bold mb-2">Notification Preferences</h2>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-gray-400">Category</div>
                  <div className="text-gray-400 text-center">Email</div>
                  <div className="text-gray-400 text-center">In-App</div>
                </div>
              </div>

              <div className="space-y-4">
                {notifications.map((notification) => {
                  const Icon = notification.icon;
                  return (
                    <div key={notification.id} className="p-4 rounded-lg border border-white/10 bg-white/5">
                      <div className="grid grid-cols-3 gap-4 items-center">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{notification.title}</div>
                            <div className="text-sm text-gray-400">{notification.description}</div>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <button
                            onClick={() => toggleChannel(notification.id, 'email')}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              notification.channels.email ? 'bg-orange-500' : 'bg-gray-700'
                            }`}
                          >
                            <div
                              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                notification.channels.email ? 'translate-x-7' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex justify-center">
                          <button
                            onClick={() => toggleChannel(notification.id, 'inApp')}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              notification.channels.inApp ? 'bg-orange-500' : 'bg-gray-700'
                            }`}
                          >
                            <div
                              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                notification.channels.inApp ? 'translate-x-7' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Email Digest */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Email Digest</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Enable Email Digest</div>
                    <div className="text-sm text-gray-400">
                      Receive a summary of your notifications instead of individual emails
                    </div>
                  </div>
                  <button
                    onClick={() => setDigestSettings({ ...digestSettings, enabled: !digestSettings.enabled })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      digestSettings.enabled ? 'bg-orange-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        digestSettings.enabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {digestSettings.enabled && (
                  <div className="pt-4 border-t border-white/10">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Frequency
                    </label>
                    <select
                      value={digestSettings.frequency}
                      onChange={(e) => setDigestSettings({ 
                        ...digestSettings, 
                        frequency: e.target.value as 'daily' | 'weekly' | 'monthly' 
                      })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
                    >
                      <option value="daily" className="bg-gray-900">Daily</option>
                      <option value="weekly" className="bg-gray-900">Weekly</option>
                      <option value="monthly" className="bg-gray-900">Monthly</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Web Push */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Web Push</h2>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Browser Push Notifications</div>
                  <div className="text-sm text-gray-400">
                    Enable or disable push alerts on this browser/device
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePushToggle}
                  disabled={!pushSupported || pushLoading}
                  className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
                    pushEnabled ? 'bg-orange-500' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      pushEnabled ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {!pushSupported && (
                <p className="mt-3 text-xs text-yellow-400">
                  Push notifications are not supported in this browser.
                </p>
              )}
              {pushMessage && (
                <p className="mt-3 text-xs text-gray-400">{pushMessage}</p>
              )}
            </div>

            {canUseAdminPushTest && (
              <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
                <h2 className="text-lg font-bold mb-2">Admin Push Testing</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Run dry-run and direct test sends against active web push subscriptions.
                  {typeof adminPushSubscriptionCount === 'number'
                    ? ` Active subscriptions: ${adminPushSubscriptionCount}.`
                    : ''}
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Title</label>
                    <input
                      value={adminPushTitle}
                      onChange={(e) => setAdminPushTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Body</label>
                    <input
                      value={adminPushBody}
                      onChange={(e) => setAdminPushBody(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">URL</label>
                    <input
                      value={adminPushUrl}
                      onChange={(e) => setAdminPushUrl(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Max Targets</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={adminPushMaxTargets}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isNaN(next)) return;
                        setAdminPushMaxTargets(Math.min(100, Math.max(1, next)));
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => runAdminPushTest(true)}
                      disabled={adminPushLoading}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Dry Run
                    </button>
                    <button
                      type="button"
                      onClick={() => runAdminPushTest(false)}
                      disabled={adminPushLoading}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Send Direct Test
                    </button>
                  </div>

                  {adminPushMessage && (
                    <p className="text-xs text-gray-300">{adminPushMessage}</p>
                  )}
                </div>
              </div>
            )}

            {/* Do Not Disturb */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Do Not Disturb</h2>
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Set quiet hours to pause non-critical notifications
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Start Time
                    </label>
                    <input
                      type="time"
                      defaultValue="22:00"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">
                      End Time
                    </label>
                    <input
                      type="time"
                      defaultValue="08:00"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Critical security alerts will still be delivered immediately
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end space-x-3">
              <Link
                href="/settings"
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
