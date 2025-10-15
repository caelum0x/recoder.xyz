/**
 * Security Settings Page
 * Manage password, 2FA, sessions, and connected accounts
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft,
  Terminal,
  Lock,
  Shield,
  Smartphone,
  Monitor,
  Github,
  Chrome,
  Save,
  Loader2,
  CheckCircle,
  Eye,
  EyeOff,
  X,
  MapPin,
  Clock
} from 'lucide-react';

interface Session {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export default function SecuritySettingsPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [sessions, setSessions] = useState<Session[]>([
    {
      id: '1',
      device: 'Chrome on macOS',
      location: 'San Francisco, CA',
      lastActive: '5 minutes ago',
      current: true
    },
    {
      id: '2',
      device: 'Safari on iPhone',
      location: 'San Francisco, CA',
      lastActive: '2 hours ago',
      current: false
    },
    {
      id: '3',
      device: 'Firefox on Windows',
      location: 'New York, NY',
      lastActive: '1 day ago',
      current: false
    }
  ]);

  const [connectedAccounts, setConnectedAccounts] = useState({
    github: true,
    google: false
  });

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/user/security/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordData)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Password changed successfully');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    setShow2FASetup(true);
    // In real implementation, generate QR code here
  };

  const handleDisable2FA = async () => {
    setTwoFactorEnabled(false);
    setSuccess('Two-factor authentication disabled');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleRevokeSession = (sessionId: string) => {
    setSessions(sessions.filter(s => s.id !== sessionId));
    setSuccess('Session revoked successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleToggleAccount = async (provider: 'github' | 'google') => {
    setConnectedAccounts({
      ...connectedAccounts,
      [provider]: !connectedAccounts[provider]
    });
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
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Security Settings</h1>
            <p className="text-gray-400">Manage your password, 2FA, and account security</p>
          </div>

          {/* Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400">{success}</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Change Password */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Change Password</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-300">
                    Current Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="w-full pl-12 pr-12 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="w-full pl-12 pr-12 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                  />
                </div>

                <button
                  onClick={handleChangePassword}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Changing Password...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Change Password</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">Two-Factor Authentication</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  twoFactorEnabled ? 'bg-green-500/20 text-green-500' : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>

              {!twoFactorEnabled ? (
                <button
                  onClick={handleEnable2FA}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                >
                  <Shield className="w-5 h-5" />
                  <span>Enable 2FA</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Shield className="w-5 h-5 text-green-500" />
                      <div className="text-sm text-green-400">
                        Your account is protected with 2FA
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleDisable2FA}
                    className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg font-medium transition-all"
                  >
                    Disable 2FA
                  </button>
                </div>
              )}
            </div>

            {/* Active Sessions */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Active Sessions</h2>
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 rounded-lg border border-white/10 bg-white/5 flex items-start justify-between"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                        {session.device.includes('iPhone') ? (
                          <Smartphone className="w-5 h-5 text-white" />
                        ) : (
                          <Monitor className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium flex items-center space-x-2">
                          <span>{session.device}</span>
                          {session.current && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400 flex items-center space-x-4 mt-1">
                          <span className="flex items-center space-x-1">
                            <MapPin className="w-3 h-3" />
                            <span>{session.location}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{session.lastActive}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    {!session.current && (
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Connected Accounts */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Connected Accounts</h2>
              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-white/10 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
                      <Github className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-medium">GitHub</div>
                      <div className="text-sm text-gray-400">
                        {connectedAccounts.github ? 'Connected' : 'Not connected'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleAccount('github')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      connectedAccounts.github
                        ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white'
                    }`}
                  >
                    {connectedAccounts.github ? 'Disconnect' : 'Connect'}
                  </button>
                </div>

                <div className="p-4 rounded-lg border border-white/10 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                      <Chrome className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="font-medium">Google</div>
                      <div className="text-sm text-gray-400">
                        {connectedAccounts.google ? 'Connected' : 'Not connected'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleAccount('google')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      connectedAccounts.google
                        ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white'
                    }`}
                  >
                    {connectedAccounts.google ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              </div>
            </div>

            {/* Security Log */}
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-200">
                <strong>Security Tip:</strong> Regularly review your active sessions and connected accounts. 
                If you notice any suspicious activity, change your password immediately and contact support.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
