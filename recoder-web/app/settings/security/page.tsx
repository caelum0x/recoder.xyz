"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeviceSessionManager } from "@/components/settings/device-session-manager";
import { SecurityAuditLog } from "@/components/settings/security-audit-log";
import {
  Shield, ChevronLeft, Key, Smartphone, Monitor, Eye, EyeOff,
  Copy, Trash2, Plus, AlertTriangle, Check, X, Clock, MapPin,
  RefreshCw, Zap, Lock, Unlock, Globe, Chrome,
  QrCode, Download, Upload
} from "lucide-react";

interface SecuritySettings {
  twoFactorEnabled: boolean;
  backupCodes: string[];
  lastPasswordChange: string;
  loginNotifications: boolean;
  securityEmails: boolean;
}

interface Session {
  id: string;
  deviceName: string;
  browser: string;
  os: string;
  location: string;
  ipAddress: string;
  current: boolean;
  lastActive: string;
  createdAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  lastUsed: string | null;
  permissions: string[];
  createdAt: string;
}

export default function SecuritySettings() {
  const { user, loading } = useAuth();
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: ""
  });

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  useEffect(() => {
    if (user) {
      loadSecurityData();
    }
  }, [user]);

  const loadSecurityData = async () => {
    try {
      const [settingsRes, sessionsRes, apiKeysRes] = await Promise.all([
        fetch("/api/user/security/settings", { credentials: "include" }),
        fetch("/api/user/security/sessions", { credentials: "include" }),
        fetch("/api/user/security/api-keys", { credentials: "include" })
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings(data);
      }

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data);
      }

      if (apiKeysRes.ok) {
        const data = await apiKeysRes.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error("Failed to load security data:", error);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordForm.new !== passwordForm.confirm) {
      setMessage("New passwords don't match");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new
        })
      });

      if (response.ok) {
        setMessage("Password changed successfully!");
        setPasswordForm({ current: "", new: "", confirm: "" });
      } else {
        const error = await response.json();
        setMessage(error.message || "Failed to change password");
      }
    } catch (error) {
      setMessage("Failed to change password");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const setup2FA = async () => {
    try {
      const response = await fetch("/api/user/security/2fa/setup", {
        method: "POST",
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        setQrCodeUrl(data.qrCode);
        setShow2FASetup(true);
      }
    } catch (error) {
      setMessage("Failed to setup 2FA");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const verify2FA = async () => {
    try {
      const response = await fetch("/api/user/security/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: verificationCode })
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(prev => prev ? { ...prev, twoFactorEnabled: true, backupCodes: data.backupCodes } : null);
        setShow2FASetup(false);
        setVerificationCode("");
        setMessage("2FA enabled successfully!");
      } else {
        setMessage("Invalid verification code");
      }
    } catch (error) {
      setMessage("Failed to verify 2FA");
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const disable2FA = async () => {
    try {
      const response = await fetch("/api/user/security/2fa/disable", {
        method: "POST",
        credentials: "include"
      });

      if (response.ok) {
        setSettings(prev => prev ? { ...prev, twoFactorEnabled: false, backupCodes: [] } : null);
        setMessage("2FA disabled successfully!");
      } else {
        setMessage("Failed to disable 2FA");
      }
    } catch (error) {
      setMessage("Failed to disable 2FA");
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const createApiKey = async () => {
    if (!newApiKeyName.trim()) {
      setMessage("Please enter a name for the API key");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newApiKeyName })
      });

      if (response.ok) {
        const newKey = await response.json();
        setApiKeys(prev => [...prev, newKey]);
        setNewApiKeyName("");
        setShowNewApiKey(false);
        setMessage("API key created successfully!");
      } else {
        setMessage("Failed to create API key");
      }
    } catch (error) {
      setMessage("Failed to create API key");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const deleteApiKey = async (keyId: string) => {
    try {
      const response = await fetch(`/api/user/security/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (response.ok) {
        setApiKeys(prev => prev.filter(key => key.id !== keyId));
        setMessage("API key deleted successfully!");
      } else {
        setMessage("Failed to delete API key");
      }
    } catch (error) {
      setMessage("Failed to delete API key");
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const terminateSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/user/security/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (response.ok) {
        setSessions(prev => prev.filter(session => session.id !== sessionId));
        setMessage("Session terminated successfully!");
      } else {
        setMessage("Failed to terminate session");
      }
    } catch (error) {
      setMessage("Failed to terminate session");
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage("Copied to clipboard!");
    setTimeout(() => setMessage(""), 2000);
  };

  const getBrowserIcon = (browser: string) => {
    const browserLower = browser.toLowerCase();
    if (browserLower.includes('chrome')) return <Chrome className="w-4 h-4" />;
    if (browserLower.includes('firefox')) return <Globe className="w-4 h-4" />;
    if (browserLower.includes('safari')) return <Globe className="w-4 h-4" />;
    return <Globe className="w-4 h-4" />;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user || !settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading security settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Settings
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Security Settings</h1>
              <p className="text-gray-600 mt-2">Manage your account security and authentication</p>
            </div>
            {message && (
              <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                message.includes("successfully") || message.includes("Copied")
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}>
                {message.includes("successfully") || message.includes("Copied") ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <nav className="flex space-x-8">
            {[
              { id: "overview", label: "Overview", icon: Shield },
              { id: "authentication", label: "Authentication", icon: Key },
              { id: "sessions", label: "Active Sessions", icon: Monitor },
              { id: "api-keys", label: "API Keys", icon: Zap },
              { id: "audit-log", label: "Security Log", icon: Clock }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === id
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Security Status */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security Status
                </h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${settings.twoFactorEnabled ? 'bg-green-100' : 'bg-red-100'}`}>
                      {settings.twoFactorEnabled ? (
                        <Lock className="w-5 h-5 text-green-600" />
                      ) : (
                        <Unlock className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                      <p className={`text-sm ${settings.twoFactorEnabled ? 'text-green-600' : 'text-red-600'}`}>
                        {settings.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-blue-100">
                      <Monitor className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Active Sessions</p>
                      <p className="text-sm text-blue-600">{sessions.length} devices</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-purple-100">
                      <Zap className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">API Keys</p>
                      <p className="text-sm text-purple-600">{apiKeys.length} active</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Security Activity */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Recent Security Activity
                </h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Recent security events will appear here</p>
                    <button 
                      onClick={() => setActiveTab("audit-log")}
                      className="mt-3 text-sm text-blue-600 hover:text-blue-700"
                    >
                      View complete audit log →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Authentication Tab */}
        {activeTab === "authentication" && (
          <div className="space-y-6">
            {/* Password Change */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  Change Password
                </h2>
              </div>
              <div className="p-6">
                <div className="max-w-md space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={passwordForm.current}
                        onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.new}
                      onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={handlePasswordChange}
                    disabled={isLoading || !passwordForm.current || !passwordForm.new || !passwordForm.confirm}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    {isLoading ? "Updating..." : "Update Password"}
                  </button>
                  <p className="text-xs text-gray-600">
                    Last changed: {new Date(settings.lastPasswordChange).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Two-Factor Authentication
                </h2>
              </div>
              <div className="p-6">
                {!settings.twoFactorEnabled ? (
                  <div>
                    <p className="text-gray-600 mb-4">
                      Add an extra layer of security to your account by enabling two-factor authentication.
                    </p>
                    <button
                      onClick={setup2FA}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                    >
                      <Smartphone className="w-4 h-4" />
                      Enable 2FA
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-full bg-green-100">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Two-factor authentication is enabled</p>
                        <p className="text-sm text-gray-600">Your account is protected with 2FA</p>
                      </div>
                    </div>
                    
                    {settings.backupCodes.length > 0 && (
                      <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <h3 className="font-medium text-yellow-900 mb-2">Backup Codes</h3>
                        <p className="text-sm text-yellow-800 mb-3">
                          Save these backup codes in a safe place. You can use them to access your account if you lose your authenticator device.
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {settings.backupCodes.map((code, index) => (
                            <code key={index} className="text-sm bg-white p-2 rounded border font-mono">
                              {code}
                            </code>
                          ))}
                        </div>
                        <button
                          onClick={() => copyToClipboard(settings.backupCodes.join('\n'))}
                          className="text-sm text-yellow-700 hover:text-yellow-900 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          Copy all codes
                        </button>
                      </div>
                    )}

                    <button
                      onClick={disable2FA}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Disable 2FA
                    </button>
                  </div>
                )}

                {/* 2FA Setup Modal */}
                {show2FASetup && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                      <h3 className="text-lg font-semibold mb-4">Setup Two-Factor Authentication</h3>
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="bg-gray-100 p-4 rounded-lg mb-4">
                            <QrCode className="w-32 h-32 mx-auto text-gray-400" />
                            <p className="text-sm text-gray-600 mt-2">QR Code would be displayed here</p>
                          </div>
                          <p className="text-sm text-gray-600">
                            Scan this QR code with your authenticator app
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Verification Code
                          </label>
                          <input
                            type="text"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            placeholder="Enter 6-digit code"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={verify2FA}
                            disabled={!verificationCode}
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                          >
                            Verify & Enable
                          </button>
                          <button
                            onClick={() => setShow2FASetup(false)}
                            className="px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === "sessions" && (
          <DeviceSessionManager />
        )}

        {/* API Keys Tab */}
        {activeTab === "api-keys" && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    API Keys ({apiKeys.length})
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage API keys for accessing Recoder services programmatically
                  </p>
                </div>
                <button
                  onClick={() => setShowNewApiKey(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create API Key
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{apiKey.name}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                          {apiKey.key.substring(0, 20)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(apiKey.key)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <div>Created: {new Date(apiKey.createdAt).toLocaleDateString()}</div>
                        <div>
                          Last used: {apiKey.lastUsed 
                            ? new Date(apiKey.lastUsed).toLocaleDateString() 
                            : "Never"
                          }
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteApiKey(apiKey.id)}
                      className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {apiKeys.length === 0 && (
                <div className="p-12 text-center">
                  <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
                  <p className="text-gray-600">Create your first API key to access Recoder services programmatically</p>
                </div>
              )}
            </div>

            {/* Create API Key Modal */}
            {showNewApiKey && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-lg font-semibold mb-4">Create New API Key</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Key Name
                      </label>
                      <input
                        type="text"
                        value={newApiKeyName}
                        onChange={(e) => setNewApiKeyName(e.target.value)}
                        placeholder="e.g., Production App, Mobile Client"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={createApiKey}
                        disabled={isLoading || !newApiKeyName.trim()}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        {isLoading ? "Creating..." : "Create"}
                      </button>
                      <button
                        onClick={() => {
                          setShowNewApiKey(false);
                          setNewApiKeyName("");
                        }}
                        className="px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit-log" && (
          <SecurityAuditLog />
        )}
      </div>
    </div>
  );
}

export const runtime = "edge";
