"use client";

import { useState, useEffect } from "react";

interface SecurityEvent {
  id: string;
  action: string;
  description: string;
  platform: string;
  ip: string;
  userAgent: string;
  location?: string;
  success: boolean;
  timestamp: string;
  severity: "low" | "medium" | "high";
  metadata?: any;
}

interface SecurityStats {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  highSeverityEvents: number;
  recentEvents: number; // Last 24h
}

export function SecurityAuditLog() {
  const [auditLogs, setAuditLogs] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<{
    severity?: string;
    action?: string;
    success?: boolean;
    timeRange?: string;
  }>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    loadAuditLogs();
  }, [filter, searchTerm]);

  const loadAuditLogs = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filter.severity) queryParams.append('severity', filter.severity);
      if (filter.action) queryParams.append('action', filter.action);
      if (filter.success !== undefined) queryParams.append('success', filter.success.toString());
      if (filter.timeRange) queryParams.append('timeRange', filter.timeRange);
      if (searchTerm) queryParams.append('search', searchTerm);
      queryParams.append('page', currentPage.toString());
      queryParams.append('limit', itemsPerPage.toString());

      const response = await fetch(`/api/user/security/audit-logs?${queryParams}`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data.logs || []);
        
        // Calculate stats
        if (data.logs) {
          const stats: SecurityStats = {
            totalEvents: data.total || data.logs.length,
            successfulEvents: data.logs.filter((log: SecurityEvent) => log.success).length,
            failedEvents: data.logs.filter((log: SecurityEvent) => !log.success).length,
            highSeverityEvents: data.logs.filter((log: SecurityEvent) => log.severity === 'high').length,
            recentEvents: data.logs.filter((log: SecurityEvent) => {
              const eventTime = new Date(log.timestamp);
              const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
              return eventTime > dayAgo;
            }).length
          };
          setStats(stats);
        }
      } else {
        console.error("Failed to load audit logs");
      }
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionColor = (action: string) => {
    const successActions = ['LOGIN', 'LOGOUT', 'PASSWORD_CHANGED', 'PROFILE_UPDATED'];
    const warningActions = ['FAILED_LOGIN', 'SUSPICIOUS_ACTIVITY', 'PASSWORD_RESET_REQUESTED'];
    const dangerActions = ['ACCOUNT_LOCKED', 'SECURITY_BREACH', 'UNAUTHORIZED_ACCESS'];
    
    if (successActions.some(a => action.includes(a))) return 'text-green-600';
    if (warningActions.some(a => action.includes(a))) return 'text-yellow-600';
    if (dangerActions.some(a => action.includes(a))) return 'text-red-600';
    return 'text-gray-600';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const exportAuditLogs = async () => {
    try {
      const response = await fetch('/api/user/security/audit-logs/export', {
        credentials: "include",
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `security-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Pagination
  const totalPages = Math.ceil((stats?.totalEvents || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, auditLogs.length);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg"></div>
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
          <h2 className="text-2xl font-bold text-gray-900">Security Audit Log</h2>
          <p className="text-gray-600 mt-2">
            Complete history of security-related events and activities on your account
          </p>
        </div>
        <button
          onClick={exportAuditLogs}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          📥 Export
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Total Events</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalEvents}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Successful</p>
            <p className="text-2xl font-bold text-green-600">{stats.successfulEvents}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Failed</p>
            <p className="text-2xl font-bold text-red-600">{stats.failedEvents}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">High Severity</p>
            <p className="text-2xl font-bold text-orange-600">{stats.highSeverityEvents}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Last 24h</p>
            <p className="text-2xl font-bold text-blue-600">{stats.recentEvents}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search events..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
            <select
              value={filter.severity || ''}
              onChange={(e) => setFilter(prev => ({ ...prev, severity: e.target.value || undefined }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filter.success === undefined ? '' : filter.success.toString()}
              onChange={(e) => setFilter(prev => ({ 
                ...prev, 
                success: e.target.value === '' ? undefined : e.target.value === 'true' 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Status</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
            <select
              value={filter.timeRange || ''}
              onChange={(e) => setFilter(prev => ({ ...prev, timeRange: e.target.value || undefined }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={filter.action || ''}
              onChange={(e) => setFilter(prev => ({ ...prev, action: e.target.value || undefined }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Actions</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
              <option value="PASSWORD">Password Changes</option>
              <option value="PROFILE">Profile Updates</option>
              <option value="SECURITY">Security Events</option>
              <option value="API">API Access</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {auditLogs.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-4xl mb-4 block">📋</span>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Security Events</h3>
            <p className="text-gray-600">Security events will appear here when they occur</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(log.severity)}`}>
                          {log.severity.toUpperCase()}
                        </span>
                        <span className={`text-sm ${log.success ? 'text-green-600' : 'text-red-600'}`}>
                          {log.success ? '✓' : '✗'}
                        </span>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-medium ${getActionColor(log.action)}`}>
                            {log.action.replace(/_/g, ' ')}
                          </h3>
                          <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                            {log.platform}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{log.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>📍 {log.location || 'Unknown location'}</span>
                          <span>🌐 {log.ip}</span>
                          <span>🖥️ {log.userAgent.split(' ')[0]}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-sm text-gray-900 font-medium">
                        {formatTimestamp(log.timestamp)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {startIndex + 1} to {endIndex} of {stats?.totalEvents || 0} results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1 border rounded text-sm ${
                          currentPage === page
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
