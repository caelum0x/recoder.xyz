/**
 * Notification Settings Page
 * Configure email and in-app notification preferences
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

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
      const response = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications, digestSettings })
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
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/settings" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Settings</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

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
