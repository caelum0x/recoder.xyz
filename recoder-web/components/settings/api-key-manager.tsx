"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Key, Plus, Copy, Eye, EyeOff, Trash2, Edit, 
  Check, X, AlertTriangle, Clock, Activity,
  Shield, Globe, Settings, Code, Database,
  Zap, Users, BarChart3, Calendar, Filter,
  Search, MoreHorizontal, ExternalLink
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string; // Only show first few characters for security
  permissions: string[];
  scopes: string[];
  status: "active" | "inactive" | "expired" | "revoked";
  lastUsed?: string;
  usageCount: number;
  rateLimit: {
    requests: number;
    period: "minute" | "hour" | "day";
    remaining: number;
  };
  expiresAt?: string;
  createdAt: string;
  createdBy: string;
  environment: "development" | "production" | "staging";
  ipRestrictions?: string[];
}

interface ApiKeyUsage {
  date: string;
  requests: number;
  errors: number;
  latency: number;
}

interface CreateApiKeyForm {
  name: string;
  permissions: string[];
  scopes: string[];
  expiresIn: number; // days, 0 = never
  environment: "development" | "production" | "staging";
  rateLimit: {
    requests: number;
    period: "minute" | "hour" | "day";
  };
  ipRestrictions: string[];
}

export function ApiKeyManager() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [showKeyValue, setShowKeyValue] = useState<string | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [envFilter, setEnvFilter] = useState<string>("all");

  const [createForm, setCreateForm] = useState<CreateApiKeyForm>({
    name: "",
    permissions: [],
    scopes: [],
    expiresIn: 90,
    environment: "development",
    rateLimit: {
      requests: 1000,
      period: "hour",
    },
    ipRestrictions: [],
  });

  const availablePermissions = [
    { id: "projects:read", name: "Read Projects", description: "View projects and their details", category: "Projects" },
    { id: "projects:write", name: "Write Projects", description: "Create and modify projects", category: "Projects" },
    { id: "projects:delete", name: "Delete Projects", description: "Delete projects", category: "Projects" },
    { id: "deployments:read", name: "Read Deployments", description: "View deployment status and logs", category: "Deployments" },
    { id: "deployments:write", name: "Deploy", description: "Create and trigger deployments", category: "Deployments" },
    { id: "analytics:read", name: "Read Analytics", description: "Access analytics and usage data", category: "Analytics" },
    { id: "teams:read", name: "Read Teams", description: "View team information", category: "Teams" },
    { id: "teams:write", name: "Manage Teams", description: "Manage team members and settings", category: "Teams" },
    { id: "webhooks:read", name: "Read Webhooks", description: "View webhook configurations", category: "Integrations" },
    { id: "webhooks:write", name: "Manage Webhooks", description: "Create and modify webhooks", category: "Integrations" },
    { id: "billing:read", name: "Read Billing", description: "View billing information", category: "Billing" },
    { id: "users:read", name: "Read Profile", description: "Access user profile information", category: "User" },
    { id: "users:write", name: "Update Profile", description: "Modify user profile", category: "User" },
  ];

  const availableScopes = [
    { id: "public", name: "Public", description: "Access to public resources only" },
    { id: "private", name: "Private", description: "Access to private resources" },
    { id: "admin", name: "Admin", description: "Administrative access (use with caution)" },
  ];

  useEffect(() => {
    if (user) {
      loadApiKeys();
    }
  }, [user]);

  const loadApiKeys = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/api-keys", {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.apiKeys || []);
      } else {
        setMessage("Failed to load API keys");
      }
    } catch (error) {
      console.error("Failed to load API keys:", error);
      setMessage("Failed to load API keys");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const createApiKey = async () => {
    if (!createForm.name || createForm.permissions.length === 0) {
      setMessage("Please provide a name and at least one permission");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(createForm),
      });

      if (response.ok) {
        const data = await response.json();
        setNewlyCreatedKey(data.key);
        await loadApiKeys();
        setShowCreateDialog(false);
        setCreateForm({
          name: "",
          permissions: [],
          scopes: [],
          expiresIn: 90,
          environment: "development",
          rateLimit: { requests: 1000, period: "hour" },
          ipRestrictions: [],
        });
        setMessage("API key created successfully!");
      } else {
        const errorData = await response.json();
        setMessage(errorData.error || "Failed to create API key");
      }
    } catch (error) {
      setMessage("Failed to create API key");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const updateApiKey = async (keyId: string, updates: Partial<ApiKey>) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/api-keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        await loadApiKeys();
        setMessage("API key updated successfully!");
      } else {
        setMessage("Failed to update API key");
      }
    } catch (error) {
      setMessage("Failed to update API key");
    } finally {
      setIsLoading(false);
      setSelectedKey(null);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const deleteApiKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Are you sure you want to delete the API key "${keyName}"? This action cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await loadApiKeys();
        setMessage("API key deleted successfully!");
      } else {
        setMessage("Failed to delete API key");
      }
    } catch (error) {
      setMessage("Failed to delete API key");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/api-keys/${keyId}/revoke`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        await loadApiKeys();
        setMessage("API key revoked successfully!");
      } else {
        setMessage("Failed to revoke API key");
      }
    } catch (error) {
      setMessage("Failed to revoke API key");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setMessage("API key copied to clipboard!");
    setTimeout(() => setMessage(""), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-600 bg-green-100";
      case "inactive": return "text-gray-600 bg-gray-100";
      case "expired": return "text-red-600 bg-red-100";
      case "revoked": return "text-red-600 bg-red-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const getEnvironmentColor = (env: string) => {
    switch (env) {
      case "production": return "text-red-600 bg-red-100";
      case "staging": return "text-yellow-600 bg-yellow-100";
      case "development": return "text-blue-600 bg-blue-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const filteredApiKeys = apiKeys.filter(key => {
    const matchesSearch = key.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         key.keyPrefix.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || key.status === statusFilter;
    const matchesEnv = envFilter === "all" || key.environment === envFilter;
    return matchesSearch && matchesStatus && matchesEnv;
  });

  const handlePermissionChange = (permissionId: string, checked: boolean) => {
    setCreateForm(prev => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, permissionId]
        : prev.permissions.filter(p => p !== permissionId)
    }));
  };

  const handleScopeChange = (scopeId: string, checked: boolean) => {
    setCreateForm(prev => ({
      ...prev,
      scopes: checked
        ? [...prev.scopes, scopeId]
        : prev.scopes.filter(s => s !== scopeId)
    }));
  };

  if (isLoading && apiKeys.length === 0) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
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
          <h2 className="text-2xl font-bold text-gray-900">API Keys</h2>
          <p className="text-gray-600 mt-1">Manage your API keys for programmatic access</p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              message.includes("successfully") || message.includes("copied")
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}>
              {message.includes("successfully") || message.includes("copied") ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {message}
            </div>
          )}
          
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create API Key
          </button>
        </div>
      </div>

      {/* Newly Created Key Alert */}
      {newlyCreatedKey && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium text-yellow-900">Your new API key</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Make sure to copy your API key now. You won't be able to see it again!
              </p>
              <div className="mt-3 p-3 bg-white border border-yellow-300 rounded-lg font-mono text-sm break-all">
                {newlyCreatedKey}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => copyKey(newlyCreatedKey)}
                  className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Copy Key
                </button>
                <button
                  onClick={() => setNewlyCreatedKey(null)}
                  className="px-3 py-1 text-yellow-700 text-sm rounded hover:bg-yellow-100"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search API keys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
        <select
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Environments</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
      </div>

      {/* API Keys List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="divide-y divide-gray-200">
          {filteredApiKeys.map((apiKey) => (
            <div key={apiKey.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium text-gray-900">{apiKey.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(apiKey.status)}`}>
                      {apiKey.status}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEnvironmentColor(apiKey.environment)}`}>
                      {apiKey.environment}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <code className="px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded font-mono">
                      {apiKey.keyPrefix}...
                    </code>
                    <button
                      onClick={() => setShowKeyValue(showKeyValue === apiKey.id ? null : apiKey.id)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title={showKeyValue === apiKey.id ? "Hide key" : "Show key"}
                    >
                      {showKeyValue === apiKey.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => copyKey(apiKey.key)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title="Copy key"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {showKeyValue === apiKey.id && (
                    <div className="mb-3 p-2 bg-gray-50 border border-gray-200 rounded font-mono text-sm break-all">
                      {apiKey.key}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Activity className="w-4 h-4" />
                      {apiKey.usageCount} requests
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {apiKey.rateLimit.remaining}/{apiKey.rateLimit.requests} per {apiKey.rateLimit.period}
                    </div>
                    <div className="flex items-center gap-1">
                      <Shield className="w-4 h-4" />
                      {apiKey.permissions.length} permissions
                    </div>
                    {apiKey.lastUsed && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Last used {new Date(apiKey.lastUsed).toLocaleDateString()}
                      </div>
                    )}
                    {apiKey.expiresAt && (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        Expires {new Date(apiKey.expiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Permissions Preview */}
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1">
                      {apiKey.permissions.slice(0, 3).map((permission) => {
                        const perm = availablePermissions.find(p => p.id === permission);
                        return perm ? (
                          <span key={permission} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            {perm.name}
                          </span>
                        ) : null;
                      })}
                      {apiKey.permissions.length > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          +{apiKey.permissions.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedKey(apiKey)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="Edit API key"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  
                  {apiKey.status === "active" && (
                    <button
                      onClick={() => revokeApiKey(apiKey.id)}
                      disabled={isLoading}
                      className="p-2 text-yellow-400 hover:text-yellow-600 disabled:opacity-50"
                      title="Revoke API key"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => deleteApiKey(apiKey.id, apiKey.name)}
                    disabled={isLoading}
                    className="p-2 text-red-400 hover:text-red-600 disabled:opacity-50"
                    title="Delete API key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {filteredApiKeys.length === 0 && (
            <div className="p-12 text-center">
              <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
              <p className="text-gray-600 mb-4">
                {searchQuery || statusFilter !== "all" || envFilter !== "all"
                  ? "No API keys match your search criteria"
                  : "Create your first API key to get started"
                }
              </p>
              {!searchQuery && statusFilter === "all" && envFilter === "all" && (
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Create API Key
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Create New API Key</h3>
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Basic Information</h4>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Production API Key"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
                    <select
                      value={createForm.environment}
                      onChange={(e) => setCreateForm({ ...createForm, environment: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expires In</label>
                    <select
                      value={createForm.expiresIn}
                      onChange={(e) => setCreateForm({ ...createForm, expiresIn: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value={30}>30 days</option>
                      <option value={90}>90 days</option>
                      <option value={365}>1 year</option>
                      <option value={0}>Never</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Permissions</h4>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {["Projects", "Deployments", "Analytics", "Teams", "Integrations", "Billing", "User"].map(category => {
                    const categoryPerms = availablePermissions.filter(p => p.category === category);
                    return (
                      <div key={category}>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">{category}</h5>
                        <div className="space-y-2 pl-4">
                          {categoryPerms.map((permission) => (
                            <label key={permission.id} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={createForm.permissions.includes(permission.id)}
                                onChange={(e) => handlePermissionChange(permission.id, e.target.checked)}
                                className="mt-1 rounded text-indigo-600"
                              />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{permission.name}</p>
                                <p className="text-xs text-gray-600">{permission.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rate Limiting */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Rate Limiting</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Requests</label>
                    <input
                      type="number"
                      value={createForm.rateLimit.requests}
                      onChange={(e) => setCreateForm({
                        ...createForm,
                        rateLimit: { ...createForm.rateLimit, requests: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Per</label>
                    <select
                      value={createForm.rateLimit.period}
                      onChange={(e) => setCreateForm({
                        ...createForm,
                        rateLimit: { ...createForm.rateLimit, period: e.target.value as any }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="minute">Minute</option>
                      <option value="hour">Hour</option>
                      <option value="day">Day</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Scopes */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Scopes</h4>
                <div className="space-y-2">
                  {availableScopes.map((scope) => (
                    <label key={scope.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={createForm.scopes.includes(scope.id)}
                        onChange={(e) => handleScopeChange(scope.id, e.target.checked)}
                        className="mt-1 rounded text-indigo-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{scope.name}</p>
                        <p className="text-xs text-gray-600">{scope.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createApiKey}
                disabled={isLoading || !createForm.name || createForm.permissions.length === 0}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create API Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {selectedKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Edit API Key</h3>
                <button
                  onClick={() => setSelectedKey(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-900">{selectedKey.name}</p>
                <p className="text-sm text-gray-600 font-mono">{selectedKey.keyPrefix}...</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  defaultValue={selectedKey.status}
                  onChange={(e) => updateApiKey(selectedKey.id, { status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedKey(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}