"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Shield, Lock, Smartphone, Key, Globe, Eye, EyeOff,
  AlertTriangle, Check, X, Clock, Monitor, MapPin, 
  Settings, Trash2, RotateCcw, Copy, ExternalLink,
  Fingerprint, Zap, Activity, Bell
} from "lucide-react";

interface SecurityEvent {
  id: string;
  type: "login" | "password_change" | "2fa_enable" | "2fa_disable" | "api_key_create" | "api_key_delete" | "device_add" | "suspicious_activity";
  description: string;
  timestamp: string;
  ipAddress: string;
  location?: string;
  device?: string;
  userAgent?: string;
  severity: "low" | "medium" | "high";
}

interface ActiveSession {
  id: string;
  deviceName: string;
  browser: string;
  os: string;
  location: string;
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
  created: string;
}

interface SecuritySettings {
  twoFactorEnabled: boolean;
  passwordLastChanged: string;
  sessionTimeout: number; // in hours
  allowMultipleSessions: boolean;
  requirePasswordOnSensitive: boolean;
  loginNotifications: boolean;
  securityEmails: boolean;
  accountRecovery: {
    email: boolean;
    sms: boolean;
    backupCodes: string[];
  };
}

export function SecurityPanel() {
  const { user } = useAuth();
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  useEffect(() => {
    if (user) {
      loadSecurityData();
    }
  }, [user]);

  const loadSecurityData = async () => {
    setIsLoading(true);
    try {
      // Load security events, sessions, and settings in parallel
      const [eventsRes, sessionsRes, settingsRes] = await Promise.all([
        fetch("/api/user/security/events", { credentials: "include" }),
        fetch("/api/user/security/sessions", { credentials: "include" }),
        fetch("/api/user/security/settings", { credentials: "include" })
      ]);

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setSecurityEvents(eventsData.events || []);
      }

      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setActiveSessions(sessionsData.sessions || []);
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSecuritySettings(settingsData.settings || createDefaultSettings());
      } else {
        setSecuritySettings(createDefaultSettings());
      }
    } catch (error) {
      console.error("Failed to load security data:", error);
      setMessage("Failed to load security information");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultSettings = (): SecuritySettings => ({
    twoFactorEnabled: false,
    passwordLastChanged: new Date().toISOString(),
    sessionTimeout: 24, // 24 hours
    allowMultipleSessions: true,
    requirePasswordOnSensitive: true,
    loginNotifications: true,
    securityEmails: true,
    accountRecovery: {
      email: true,
      sms: false,
      backupCodes: [],
    },
  });

  const updateSecuritySettings = async (settings: Partial<SecuritySettings>) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        const updatedSettings = { ...securitySettings!, ...settings };
        setSecuritySettings(updatedSettings);
        setMessage("Security settings updated!");
      } else {
        setMessage("Failed to update settings");
      }
    } catch (error) {
      setMessage("Failed to update settings");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const revokeSession = async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/security/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
        setMessage("Session revoked successfully!");
      } else {
        setMessage("Failed to revoke session");
      }
    } catch (error) {
      setMessage("Failed to revoke session");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const revokeAllSessions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/sessions/revoke-all", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setActiveSessions(prev => prev.filter(s => s.isCurrent));
        setMessage("All other sessions revoked!");
      } else {
        setMessage("Failed to revoke sessions");
      }
    } catch (error) {
      setMessage("Failed to revoke sessions");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const generateBackupCodes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/backup-codes", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const updatedSettings = {
          ...securitySettings!,
          accountRecovery: {
            ...securitySettings!.accountRecovery,
            backupCodes: data.codes,
          },
        };
        setSecuritySettings(updatedSettings);
        setShowBackupCodes(true);
        setMessage("New backup codes generated!");
      } else {
        setMessage("Failed to generate backup codes");
      }
    } catch (error) {
      setMessage("Failed to generate backup codes");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const downloadBackupCodes = () => {
    if (!securitySettings?.accountRecovery.backupCodes.length) return;
    
    const codes = securitySettings.accountRecovery.backupCodes.join("\n");
    const blob = new Blob([`Recoder.xyz Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${codes}`], {
      type: "text/plain",
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recoder-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyBackupCodes = () => {
    if (!securitySettings?.accountRecovery.backupCodes.length) return;
    
    const codes = securitySettings.accountRecovery.backupCodes.join("\n");
    navigator.clipboard.writeText(codes);
    setMessage("Backup codes copied to clipboard!");
    setTimeout(() => setMessage(""), 2000);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "login": return <Globe className="w-4 h-4" />;
      case "password_change": return <Lock className="w-4 h-4" />;
      case "2fa_enable":
      case "2fa_disable": return <Smartphone className="w-4 h-4" />;
      case "api_key_create":
      case "api_key_delete": return <Key className="w-4 h-4" />;
      case "device_add": return <Monitor className="w-4 h-4" />;
      case "suspicious_activity": return <AlertTriangle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "text-red-600 bg-red-100";
      case "medium": return "text-yellow-600 bg-yellow-100";
      case "low": return "text-green-600 bg-green-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  if (isLoading && !securitySettings) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Security Settings</h2>
          <p className="text-gray-600 mt-1">Manage your account security and privacy settings</p>
        </div>
        {message && (
          <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            message.includes("successfully") || message.includes("updated") || message.includes("generated") || message.includes("copied")
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}>
            {message.includes("successfully") || message.includes("updated") || message.includes("generated") || message.includes("copied") ? (
              <Check className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {message}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: "overview", label: "Overview", icon: Shield },
            { id: "authentication", label: "Authentication", icon: Lock },
            { id: "sessions", label: "Active Sessions", icon: Monitor },
            { id: "activity", label: "Security Log", icon: Activity },
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
      {activeTab === "overview" && securitySettings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Security Score */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Security Score</h3>
              <div className="flex items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-green-600">85</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Two-Factor Authentication</span>
                <div className="flex items-center gap-1">
                  {securitySettings.twoFactorEnabled ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-600" />
                  )}
                  <span className={`text-sm ${securitySettings.twoFactorEnabled ? "text-green-600" : "text-red-600"}`}>
                    {securitySettings.twoFactorEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Strong Password</span>
                <div className="flex items-center gap-1">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-600">Good</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Recovery Methods</span>
                <div className="flex items-center gap-1">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-600">Configured</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Session Security</span>
                <div className="flex items-center gap-1">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-600">Good</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Security Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => setActiveTab("authentication")}
                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-medium">Setup Two-Factor Auth</span>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </button>
              
              <button
                onClick={generateBackupCodes}
                disabled={isLoading}
                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-medium">Generate Backup Codes</span>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </button>
              
              <button
                onClick={() => setActiveTab("sessions")}
                className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <Monitor className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-medium">Review Active Sessions</span>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  {activeSessions.length}
                </span>
              </button>
              
              <button
                onClick={revokeAllSessions}
                disabled={isLoading}
                className="w-full flex items-center justify-between p-3 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5" />
                  <span className="text-sm font-medium">Sign Out Everywhere</span>
                </div>
                <ExternalLink className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Security Activity</h3>
            <div className="space-y-3">
              {securityEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${getSeverityColor(event.severity)}`}>
                      {getEventIcon(event.type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{event.description}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{new Date(event.timestamp).toLocaleString()}</span>
                        <span>•</span>
                        <span>{event.ipAddress}</span>
                        {event.location && (
                          <>
                            <span>•</span>
                            <span>{event.location}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(event.severity)}`}>
                    {event.severity}
                  </span>
                </div>
              ))}
              
              {securityEvents.length === 0 && (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No security events recorded</p>
                </div>
              )}
              
              {securityEvents.length > 5 && (
                <button
                  onClick={() => setActiveTab("activity")}
                  className="w-full text-center py-2 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  View all security activity
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Authentication Tab */}
      {activeTab === "authentication" && securitySettings && (
        <div className="space-y-6">
          {/* Two-Factor Authentication */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h3>
                <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                securitySettings.twoFactorEnabled ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
              }`}>
                {securitySettings.twoFactorEnabled ? "Enabled" : "Disabled"}
              </div>
            </div>
            
            {!securitySettings.twoFactorEnabled ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Two-Factor Authentication is disabled</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Your account is less secure without 2FA. Enable it to protect against unauthorized access.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateSecuritySettings({ twoFactorEnabled: true })}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Enable Two-Factor Authentication
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <Check className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Two-Factor Authentication is active</p>
                    <p className="text-sm text-green-700 mt-1">
                      Your account is protected with an additional security layer.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                    Reconfigure
                  </button>
                  <button
                    onClick={() => updateSecuritySettings({ twoFactorEnabled: false })}
                    className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                  >
                    Disable
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Backup Codes */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Backup Codes</h3>
                <p className="text-sm text-gray-600">Use these codes to access your account if you lose your device</p>
              </div>
              <button
                onClick={generateBackupCodes}
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Generate New Codes
              </button>
            </div>
            
            {securitySettings.accountRecovery.backupCodes.length > 0 && (
              <div className="space-y-4">
                {showBackupCodes ? (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-900">Your backup codes:</span>
                      <div className="flex gap-2">
                        <button
                          onClick={copyBackupCodes}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Copy codes"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={downloadBackupCodes}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Download codes"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowBackupCodes(false)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Hide codes"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                      {securitySettings.accountRecovery.backupCodes.map((code, index) => (
                        <div key={index} className="p-2 bg-white border rounded text-center">
                          {code}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800 font-medium">Important:</p>
                      <ul className="text-sm text-yellow-700 mt-1 ml-4 list-disc">
                        <li>Each code can only be used once</li>
                        <li>Store these codes in a secure location</li>
                        <li>Generate new codes if you lose these</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-gray-500" />
                      <span className="text-sm text-gray-700">
                        You have {securitySettings.accountRecovery.backupCodes.length} unused backup codes
                      </span>
                    </div>
                    <button
                      onClick={() => setShowBackupCodes(true)}
                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      <Eye className="w-4 h-4" />
                      View Codes
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Security Preferences */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Preferences</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Require password for sensitive actions</p>
                  <p className="text-xs text-gray-500">Ask for password when changing security settings</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={securitySettings.requirePasswordOnSensitive}
                    onChange={(e) => updateSecuritySettings({ requirePasswordOnSensitive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Login notifications</p>
                  <p className="text-xs text-gray-500">Get notified when you sign in from a new device</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={securitySettings.loginNotifications}
                    onChange={(e) => updateSecuritySettings({ loginNotifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Security email alerts</p>
                  <p className="text-xs text-gray-500">Receive email alerts for suspicious activity</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={securitySettings.securityEmails}
                    onChange={(e) => updateSecuritySettings({ securityEmails: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session timeout (hours)
                </label>
                <select
                  value={securitySettings.sessionTimeout}
                  onChange={(e) => updateSecuritySettings({ sessionTimeout: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={168}>1 week</option>
                  <option value={720}>30 days</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === "sessions" && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Active Sessions</h3>
                <p className="text-sm text-gray-600">Manage devices and sessions that have access to your account</p>
              </div>
              <button
                onClick={revokeAllSessions}
                disabled={isLoading}
                className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Revoke All Sessions
              </button>
            </div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {activeSessions.map((session) => (
              <div key={session.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Monitor className="w-5 h-5 text-gray-500 mt-1" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{session.deviceName}</h4>
                        {session.isCurrent && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{session.browser} on {session.os}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {session.location}
                        </div>
                        <div className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {session.ipAddress}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last active: {new Date(session.lastActive).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {!session.isCurrent && (
                    <button
                      onClick={() => revokeSession(session.id)}
                      disabled={isLoading}
                      className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {activeSessions.length === 0 && (
              <div className="p-12 text-center">
                <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Sessions</h3>
                <p className="text-gray-600">You don't have any active sessions</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === "activity" && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Security Activity Log</h3>
            <p className="text-sm text-gray-600">Complete history of security-related events</p>
          </div>
          
          <div className="divide-y divide-gray-200">
            {securityEvents.map((event) => (
              <div key={event.id} className="p-6">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${getSeverityColor(event.severity)}`}>
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{event.description}</p>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          <span>{new Date(event.timestamp).toLocaleString()}</span>
                          <span>•</span>
                          <span>{event.ipAddress}</span>
                          {event.location && (
                            <>
                              <span>•</span>
                              <span>{event.location}</span>
                            </>
                          )}
                        </div>
                        {event.userAgent && (
                          <p className="text-xs text-gray-400 mt-1">{event.userAgent}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(event.severity)}`}>
                        {event.severity}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {securityEvents.length === 0 && (
              <div className="p-12 text-center">
                <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Security Events</h3>
                <p className="text-gray-600">Your security activity log is empty</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}