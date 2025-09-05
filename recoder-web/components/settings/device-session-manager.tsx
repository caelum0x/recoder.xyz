"use client";

import { useState, useEffect } from "react";

interface UserSession {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  isCurrent: boolean;
  isActive: boolean;
  lastActivity: string;
  createdAt: string;
  userAgent: string;
}

interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  inactiveSessions: number;
  deviceTypes: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };
}

export function DeviceSessionManager() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/sessions", {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
        
        // Calculate stats
        const stats: SessionStats = {
          totalSessions: data.sessions?.length || 0,
          activeSessions: data.sessions?.filter((s: UserSession) => s.isActive).length || 0,
          inactiveSessions: data.sessions?.filter((s: UserSession) => !s.isActive).length || 0,
          deviceTypes: {
            desktop: data.sessions?.filter((s: UserSession) => s.deviceType === 'desktop').length || 0,
            mobile: data.sessions?.filter((s: UserSession) => s.deviceType === 'mobile').length || 0,
            tablet: data.sessions?.filter((s: UserSession) => s.deviceType === 'tablet').length || 0,
            unknown: data.sessions?.filter((s: UserSession) => s.deviceType === 'unknown').length || 0,
          }
        };
        setStats(stats);
      } else {
        setMessage("Failed to load sessions");
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      setMessage("Failed to load sessions");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (sessions.find(s => s.id === sessionId)?.isCurrent) {
      setMessage("Cannot revoke current session");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsRevoking(sessionId);
    try {
      const response = await fetch("/api/user/security/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "revoke",
          sessionId: sessionId,
        }),
      });

      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setMessage("Session revoked successfully");
      } else {
        setMessage("Failed to revoke session");
      }
    } catch (error) {
      console.error("Failed to revoke session:", error);
      setMessage("Failed to revoke session");
    } finally {
      setIsRevoking(null);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const revokeAllOtherSessions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "revoke-all",
        }),
      });

      if (response.ok) {
        // Keep only current session
        setSessions(prev => prev.filter(s => s.isCurrent));
        setMessage("All other sessions revoked successfully");
        setShowRevokeAllConfirm(false);
      } else {
        setMessage("Failed to revoke sessions");
      }
    } catch (error) {
      console.error("Failed to revoke sessions:", error);
      setMessage("Failed to revoke sessions");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'desktop':
        return "🖥️";
      case 'mobile':
        return "📱";
      case 'tablet':
        return "📱";
      default:
        return "🌐";
    }
  };

  const getBrowserIcon = (browser: string) => {
    if (browser.includes('Chrome')) return "🔵";
    if (browser.includes('Firefox')) return "🟠";
    if (browser.includes('Safari')) return "🔵";
    return "🌐";
  };

  const formatLastActivity = (lastActivity: string) => {
    const now = new Date();
    const activity = new Date(lastActivity);
    const diff = now.getTime() - activity.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    if (days < 7) return `${days} days ago`;
    return activity.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Device & Session Management</h2>
        <p className="text-gray-600 mt-2">
          Manage your active sessions and devices. You can revoke access for any device you don't recognize.
        </p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
          message.includes("success") || message.includes("revoked")
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}>
          <span className="text-sm">
            {message.includes("success") || message.includes("revoked") ? "✅" : "⚠️"}
          </span>
          {message}
        </div>
      )}

      {/* Session Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalSessions}</p>
              </div>
              <span className="text-2xl">🛡️</span>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Sessions</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeSessions}</p>
              </div>
              <span className="text-2xl">📶</span>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Desktop Devices</p>
                <p className="text-2xl font-bold text-blue-600">{stats.deviceTypes.desktop}</p>
              </div>
              <span className="text-2xl">🖥️</span>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Mobile Devices</p>
                <p className="text-2xl font-bold text-purple-600">{stats.deviceTypes.mobile}</p>
              </div>
              <span className="text-2xl">📱</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={loadSessions}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <span className={`inline-block text-sm ${isLoading ? 'animate-spin' : ''}`}>🔄</span>
          Refresh Sessions
        </button>
        
        {sessions.filter(s => !s.isCurrent).length > 0 && (
          <button
            onClick={() => setShowRevokeAllConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <span className="text-sm">🗑️</span>
            Revoke All Other Sessions
          </button>
        )}
      </div>

      {/* Revoke All Confirmation */}
      {showRevokeAllConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <h3 className="font-medium text-red-900 mb-2">Revoke All Other Sessions?</h3>
              <p className="text-sm text-red-700 mb-4">
                This will sign you out of all other devices. You'll need to sign in again on those devices.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={revokeAllOtherSessions}
                  disabled={isLoading}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {isLoading ? "Revoking..." : "Yes, Revoke All"}
                </button>
                <button
                  onClick={() => setShowRevokeAllConfirm(false)}
                  className="px-3 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Active Sessions</h3>
        
        {sessions.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <span className="text-4xl">🛡️</span>
            <p className="text-gray-600">No active sessions found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const deviceIcon = getDeviceIcon(session.deviceType);
              const browserIcon = getBrowserIcon(session.browser);
              
              return (
                <div
                  key={session.id}
                  className={`bg-white border rounded-lg p-4 ${
                    session.isCurrent ? 'border-green-200 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`p-2 rounded-lg flex items-center justify-center text-2xl ${
                        session.isActive ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        {deviceIcon}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-gray-900">{session.deviceName}</h4>
                          {session.isCurrent && (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                              Current Session
                            </span>
                          )}
                          {!session.isActive && (
                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                              Inactive
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">🌐</span>
                            <span>{session.browser} on {session.os}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">📍</span>
                            <span>{session.location}</span>
                            <span className="text-gray-400">•</span>
                            <span>{session.ipAddress}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">🕐</span>
                            <span>Last active: {formatLastActivity(session.lastActivity)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {!session.isCurrent && (
                      <button
                        onClick={() => revokeSession(session.id)}
                        disabled={isRevoking === session.id}
                        className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
                      >
                        {isRevoking === session.id ? (
                          <>
                            <span className="w-3 h-3 inline-block animate-spin">⟳</span>
                            Revoking...
                          </>
                        ) : (
                          <>
                            <span className="w-3 h-3 inline-block">🗑️</span>
                            Revoke
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">Security Tips</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Regularly review your active sessions and revoke any you don't recognize</li>
          <li>• Always sign out when using public or shared computers</li>
          <li>• If you see suspicious activity, revoke all sessions and change your password</li>
          <li>• Enable two-factor authentication for additional security</li>
        </ul>
      </div>
    </div>
  );
}
