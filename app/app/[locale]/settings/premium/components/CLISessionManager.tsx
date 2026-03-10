'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Terminal, Trash2, Shield, MapPin, Clock, MonitorSmartphone, AlertTriangle 
} from 'lucide-react';

interface CLISession {
  id: string;
  deviceInfo: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt: string;
  status: string;
}

interface CLISessionManagerProps {
  sessions: CLISession[];
  onRefresh: () => void;
}

export default function CLISessionManager({ sessions, onRefresh }: CLISessionManagerProps) {
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4000);
  };

  const handleRevokeSession = async (sessionId: string, deviceName: string) => {
    if (!confirm(`Are you sure you want to revoke the session for "${deviceName}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setRevokingId(sessionId);
      
      const response = await fetch(`/api/cli/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to revoke session');
      }

      onRefresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to revoke CLI session');
    } finally {
      setLoading(false);
      setRevokingId(null);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm('Are you sure you want to revoke ALL CLI sessions? You will need to re-authenticate all your devices.')) {
      return;
    }

    try {
      setLoading(true);
      
      const response = await fetch('/api/cli/sessions/all', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to revoke all sessions');
      }

      onRefresh();
    } catch (error: any) {
      showError(error.message || 'Failed to revoke all CLI sessions');
    } finally {
      setLoading(false);
    }
  };

  const formatDeviceInfo = (deviceInfo: any) => {
    if (typeof deviceInfo === 'string') {
      try {
        deviceInfo = JSON.parse(deviceInfo);
      } catch {
        return deviceInfo;
      }
    }
    
    if (deviceInfo.hostname) {
      return deviceInfo.hostname;
    }
    
    return deviceInfo.platform || 'Unknown Device';
  };

  const getDeviceIcon = (deviceInfo: any) => {
    const platform = typeof deviceInfo === 'string' ? deviceInfo : (deviceInfo?.platform || '');
    
    if (platform.toLowerCase().includes('darwin') || platform.toLowerCase().includes('mac')) {
      return '🍎';
    }
    if (platform.toLowerCase().includes('win')) {
      return '🪟';
    }
    if (platform.toLowerCase().includes('linux')) {
      return '🐧';
    }
    return '💻';
  };

  const isSessionActive = (session: CLISession) => {
    if (session.status !== 'active') return false;
    const expiresAt = new Date(session.expiresAt);
    return expiresAt > new Date();
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <Card className="p-6 relative">
      {errorMsg && (
        <div className="absolute top-2 right-2 z-10 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {errorMsg}
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-purple-600" />
          <div>
            <h2 className="text-xl font-semibold">CLI Sessions</h2>
            <p className="text-sm text-gray-600">
              {sessions.filter(isSessionActive).length} active session{sessions.filter(isSessionActive).length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {sessions.length > 0 && (
          <Button
            onClick={handleRevokeAllSessions}
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
            disabled={loading}
          >
            <Shield className="w-4 h-4 mr-2" />
            Revoke All
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="mb-2">No CLI sessions</p>
          <p className="text-sm">Run <code className="bg-gray-100 px-2 py-1 rounded">recoder auth login</code> to create a session</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const active = isSessionActive(session);
            const deviceName = formatDeviceInfo(session.deviceInfo);
            const deviceIcon = getDeviceIcon(session.deviceInfo);
            
            return (
              <div
                key={session.id}
                className={`p-4 rounded-lg border transition-all ${
                  active 
                    ? 'bg-white border-gray-200 hover:shadow-md' 
                    : 'bg-gray-50 border-gray-200 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{deviceIcon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{deviceName}</p>
                        <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                          {session.ipAddress && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {session.ipAddress}
                            </span>
                          )}
                          {session.lastUsedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {getTimeAgo(session.lastUsedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-2">
                      {active ? (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                          ✓ Active
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-full font-medium">
                          Expired
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        Created {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                      {active && (
                        <span className="text-xs text-gray-500">
                          • Expires {new Date(session.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {active && (
                    <Button
                      onClick={() => handleRevokeSession(session.id, deviceName)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                      disabled={loading && revokingId === session.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 mb-1">Security Tip</p>
              <p className="text-amber-700">
                Revoke sessions for devices you no longer use or recognize. CLI sessions expire after 30 days of inactivity.
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
