/**
 * Account Settings Page
 * Manage email, username, timezone, and account deletion
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/session-provider';
import {
  ArrowLeft,
  Terminal,
  Mail,
  User,
  Globe,
  Languages,
  Trash2,
  Download,
  Save,
  Loader2,
  CheckCircle
} from 'lucide-react';

export default function AccountSettingsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [accountData, setAccountData] = useState({
    email: '',
    username: '',
    name: '',
    organization: '',
    timezone: 'America/New_York',
    language: 'en'
  });

  // Load account data on mount
  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth/signin');
      return;
    }

    if (!isPending && session) {
      loadAccountData();
    }
  }, [isPending, session, router]);

  async function loadAccountData() {
    try {
      setInitialLoading(true);
      const response = await fetch('/api/user/account', { credentials: 'include' });

      if (response.status === 401) {
        router.push('/auth/signin');
        return;
      }

      const data = await response.json();

      if (data.success) {
        const userData = data.data.user;
        setAccountData({
          email: userData.email || '',
          username: userData.email?.split('@')[0] || '',
          name: userData.name || '',
          organization: userData.organization || '',
          timezone: userData.timezone || 'America/New_York',
          language: userData.language || 'en'
        });
      } else {
        setError('Failed to load account data');
      }
    } catch (err) {
      console.error('Failed to load account:', err);
      setError('Failed to load account data');
    } finally {
      setInitialLoading(false);
    }
  }

  const timezones = [
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney'
  ];

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese' }
  ];

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/user/account', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to update account');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch('/api/user/export', { credentials: 'include' });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recoder-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError('Failed to export data');
    }
  };

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    try {
      const response = await fetch('/api/user/account', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        window.location.href = '/';
      }
    } catch (err) {
      setError('Failed to delete account');
    }
  };

  if (initialLoading || isPending) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading account settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Settings
            </Link>
            <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
            <p className="text-gray-400">Manage your account information and preferences</p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400">Account settings updated successfully!</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {/* Account Information */}
          <div className="space-y-6">
            {/* Email */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Email Address</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={accountData.email}
                      onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Changing your email will require verification
                  </p>
                </div>
              </div>
            </div>

            {/* Username & Name */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Personal Information</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="username"
                      type="text"
                      value={accountData.username}
                      onChange={(e) => setAccountData({ ...accountData, username: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-300">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={accountData.name}
                    onChange={(e) => setAccountData({ ...accountData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Preferences</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="timezone" className="block text-sm font-medium text-gray-300">
                    Timezone
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      id="timezone"
                      value={accountData.timezone}
                      onChange={(e) => setAccountData({ ...accountData, timezone: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
                    >
                      {timezones.map((tz) => (
                        <option key={tz} value={tz} className="bg-gray-900">
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="language" className="block text-sm font-medium text-gray-300">
                    Language
                  </label>
                  <div className="relative">
                    <Languages className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      id="language"
                      value={accountData.language}
                      onChange={(e) => setAccountData({ ...accountData, language: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
                    >
                      {languages.map((lang) => (
                        <option key={lang.code} value={lang.code} className="bg-gray-900">
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Actions */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Account Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={handleExportData}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                >
                  <Download className="w-5 h-5" />
                  <span>Export My Data</span>
                </button>

                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={handleDeleteAccount}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 ${
                      showDeleteConfirm
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400'
                    }`}
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>{showDeleteConfirm ? 'Click Again to Confirm Delete' : 'Delete Account'}</span>
                  </button>
                  {showDeleteConfirm && (
                    <p className="mt-2 text-xs text-red-400 text-center">
                      This action is permanent and cannot be undone
                    </p>
                  )}
                </div>
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
