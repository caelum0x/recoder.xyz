"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Settings, ChevronLeft, Github, Cloud, Webhook, Key, Zap, 
  ExternalLink, Check, X, AlertTriangle, Plus, Trash2, Edit,
  Globe, Shield, Activity, Cpu, Database, Monitor, Bell, Mail,
  Slack, Calendar, FileText, Briefcase, Code,
  RotateCcw, Copy, Eye, EyeOff, Power
} from "lucide-react";

interface Integration {
  id: string;
  type: "github" | "aws" | "gcp" | "azure" | "vercel" | "netlify" | "railway" | "render";
  name: string;
  description: string;
  connected: boolean;
  status: "active" | "inactive" | "error" | "pending";
  connectedAt?: string;
  lastSync?: string;
  config?: any;
  permissions?: string[];
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: "active" | "inactive";
  secret?: string;
  lastTriggered?: string;
  successCount: number;
  errorCount: number;
  createdAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsed?: string;
  usageCount: number;
  status: "active" | "inactive";
  expiresAt?: string;
  createdAt: string;
}

export default function IntegrationsSettings() {
  const { user, loading } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("integrations");
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState<string | null>(null);

  // New webhook form state
  const [newWebhook, setNewWebhook] = useState({
    name: "",
    url: "",
    events: [] as string[],
    secret: "",
  });

  // New API key form state
  const [newApiKey, setNewApiKey] = useState({
    name: "",
    permissions: [] as string[],
    expiresIn: "90", // days
  });

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  useEffect(() => {
    if (user) {
      loadIntegrations();
      loadWebhooks();
      loadApiKeys();
    }
  }, [user]);

  const loadIntegrations = async () => {
    try {
      const response = await fetch("/api/user/integrations", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setIntegrations(data);
      }
    } catch (error) {
      console.error("Failed to load integrations:", error);
    }
  };

  const loadWebhooks = async () => {
    try {
      const response = await fetch("/api/user/integrations/webhooks", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data);
      }
    } catch (error) {
      console.error("Failed to load webhooks:", error);
    }
  };

  const loadApiKeys = async () => {
    try {
      const response = await fetch("/api/user/integrations/api-keys", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error("Failed to load API keys:", error);
    }
  };

  const connectIntegration = async (type: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authUrl) {
          // Redirect to OAuth flow
          window.location.href = data.authUrl;
        } else {
          loadIntegrations();
          setMessage("Integration connected successfully!");
        }
      } else {
        setMessage("Failed to connect integration");
      }
    } catch (error) {
      setMessage("Failed to connect integration");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const disconnectIntegration = async (integrationId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/integrations/${integrationId}/disconnect`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        loadIntegrations();
        setMessage("Integration disconnected successfully!");
      } else {
        setMessage("Failed to disconnect integration");
      }
    } catch (error) {
      setMessage("Failed to disconnect integration");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const createWebhook = async () => {
    if (!newWebhook.name || !newWebhook.url || newWebhook.events.length === 0) {
      setMessage("Please fill in all required fields");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/integrations/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newWebhook),
      });

      if (response.ok) {
        loadWebhooks();
        setShowNewWebhook(false);
        setNewWebhook({ name: "", url: "", events: [], secret: "" });
        setMessage("Webhook created successfully!");
      } else {
        setMessage("Failed to create webhook");
      }
    } catch (error) {
      setMessage("Failed to create webhook");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/integrations/webhooks/${webhookId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        loadWebhooks();
        setMessage("Webhook deleted successfully!");
      } else {
        setMessage("Failed to delete webhook");
      }
    } catch (error) {
      setMessage("Failed to delete webhook");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const createApiKey = async () => {
    if (!newApiKey.name || newApiKey.permissions.length === 0) {
      setMessage("Please fill in all required fields");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/integrations/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newApiKey),
      });

      if (response.ok) {
        const data = await response.json();
        loadApiKeys();
        setShowNewApiKey(false);
        setNewApiKey({ name: "", permissions: [], expiresIn: "90" });
        setShowApiKey(data.key);
        setMessage("API key created successfully! Make sure to copy it now.");
      } else {
        setMessage("Failed to create API key");
      }
    } catch (error) {
      setMessage("Failed to create API key");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 5000);
    }
  };

  const deleteApiKey = async (keyId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/integrations/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        loadApiKeys();
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage("Copied to clipboard!");
    setTimeout(() => setMessage(""), 2000);
  };

  const getIntegrationIcon = (type: string) => {
    switch (type) {
      case "github": return <Github className="w-5 h-5" />;
      case "aws": return <Cloud className="w-5 h-5" />;
      case "gcp": return <Cloud className="w-5 h-5" />;
      case "azure": return <Cloud className="w-5 h-5" />;
      case "vercel": return <Zap className="w-5 h-5" />;
      case "netlify": return <Globe className="w-5 h-5" />;
      case "railway": return <Database className="w-5 h-5" />;
      case "render": return <Monitor className="w-5 h-5" />;
      default: return <Settings className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-600 bg-green-100";
      case "inactive": return "text-gray-600 bg-gray-100";
      case "error": return "text-red-600 bg-red-100";
      case "pending": return "text-yellow-600 bg-yellow-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const availableEvents = [
    "project.created", "project.updated", "project.deleted",
    "deployment.started", "deployment.completed", "deployment.failed",
    "user.login", "user.logout", "team.member.added", "team.member.removed"
  ];

  const availablePermissions = [
    "projects:read", "projects:write", "projects:delete",
    "deployments:read", "deployments:write", "analytics:read",
    "teams:read", "teams:write", "integrations:read", "integrations:write"
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading integrations...</div>
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
              <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
              <p className="text-gray-600 mt-2">Connect your third-party services and manage API access</p>
            </div>
            {message && (
              <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                message.includes("successfully") || message.includes("created") || message.includes("Copied")
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}>
                {message.includes("successfully") || message.includes("created") || message.includes("Copied") ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="mb-6">
          <nav className="flex space-x-8">
            {[
              { id: "integrations", label: "Connected Services", icon: Settings },
              { id: "webhooks", label: "Webhooks", icon: Webhook },
              { id: "api-keys", label: "API Keys", icon: Key }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeSection === id
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

        {/* Integrations Section */}
        {activeSection === "integrations" && (
          <div className="space-y-6">
            {/* Popular Integrations */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Popular Integrations</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Connect your favorite services to enhance your development workflow
                </p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { type: "github", name: "GitHub", description: "Import repositories and sync code changes" },
                    { type: "aws", name: "Amazon Web Services", description: "Deploy to AWS cloud infrastructure" },
                    { type: "gcp", name: "Google Cloud Platform", description: "Deploy to Google Cloud services" },
                    { type: "azure", name: "Microsoft Azure", description: "Deploy to Azure cloud platform" },
                    { type: "vercel", name: "Vercel", description: "Deploy frontend applications instantly" },
                    { type: "netlify", name: "Netlify", description: "Deploy static sites and serverless functions" }
                  ].map((service) => {
                    const integration = integrations.find(i => i.type === service.type);
                    return (
                      <div key={service.type} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {getIntegrationIcon(service.type)}
                            <div>
                              <h3 className="font-medium text-gray-900">{service.name}</h3>
                              <p className="text-sm text-gray-600">{service.description}</p>
                            </div>
                          </div>
                          {integration && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(integration.status)}`}>
                              {integration.status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          {integration ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-green-600 flex items-center gap-1">
                                <Check className="w-4 h-4" />
                                Connected
                              </span>
                              {integration.lastSync && (
                                <span className="text-xs text-gray-500">
                                  Last sync: {new Date(integration.lastSync).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">Not connected</span>
                          )}
                          <div className="flex items-center gap-2">
                            {integration ? (
                              <>
                                <button
                                  onClick={() => connectIntegration(service.type)}
                                  disabled={isLoading}
                                  className="px-3 py-1 text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => disconnectIntegration(integration.id)}
                                  disabled={isLoading}
                                  className="px-3 py-1 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                                >
                                  Disconnect
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => connectIntegration(service.type)}
                                disabled={isLoading}
                                className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
                              >
                                Connect
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Webhooks Section */}
        {activeSection === "webhooks" && (
          <div className="space-y-6">
            {/* Create Webhook */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Webhooks</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Receive real-time notifications about events in your account
                    </p>
                  </div>
                  <button
                    onClick={() => setShowNewWebhook(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New Webhook
                  </button>
                </div>
              </div>

              {showNewWebhook && (
                <div className="p-6 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-medium text-gray-900 mb-4">Create New Webhook</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={newWebhook.name}
                        onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Production deployment webhook"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                      <input
                        type="url"
                        value={newWebhook.url}
                        onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="https://your-server.com/webhook"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
                      <div className="grid grid-cols-2 gap-2">
                        {availableEvents.map((event) => (
                          <label key={event} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={newWebhook.events.includes(event)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewWebhook({ ...newWebhook, events: [...newWebhook.events, event] });
                                } else {
                                  setNewWebhook({ ...newWebhook, events: newWebhook.events.filter(e => e !== event) });
                                }
                              }}
                              className="rounded text-indigo-600"
                            />
                            <span className="text-sm text-gray-700">{event}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Secret (Optional)</label>
                      <input
                        type="password"
                        value={newWebhook.secret}
                        onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Webhook secret for verification"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={createWebhook}
                        disabled={isLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Create Webhook
                      </button>
                      <button
                        onClick={() => setShowNewWebhook(false)}
                        className="px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-gray-200">
                {webhooks.map((webhook) => (
                  <div key={webhook.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-gray-900">{webhook.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(webhook.status)}`}>
                            {webhook.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{webhook.url}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>Events: {webhook.events.length}</span>
                          <span>Success: {webhook.successCount}</span>
                          <span>Errors: {webhook.errorCount}</span>
                          {webhook.lastTriggered && (
                            <span>Last: {new Date(webhook.lastTriggered).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(webhook.url)}
                          className="p-2 text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteWebhook(webhook.id)}
                          disabled={isLoading}
                          className="p-2 text-red-400 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {webhooks.length === 0 && (
                  <div className="p-12 text-center">
                    <Webhook className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Webhooks</h3>
                    <p className="text-gray-600 mb-4">Create your first webhook to receive real-time notifications</p>
                    <button
                      onClick={() => setShowNewWebhook(true)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Create Webhook
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API Keys Section */}
        {activeSection === "api-keys" && (
          <div className="space-y-6">
            {/* Create API Key */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Generate API keys for programmatic access to your account
                    </p>
                  </div>
                  <button
                    onClick={() => setShowNewApiKey(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New API Key
                  </button>
                </div>
              </div>

              {showNewApiKey && (
                <div className="p-6 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-medium text-gray-900 mb-4">Create New API Key</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={newApiKey.name}
                        onChange={(e) => setNewApiKey({ ...newApiKey, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Production API Key"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                      <div className="grid grid-cols-2 gap-2">
                        {availablePermissions.map((permission) => (
                          <label key={permission} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={newApiKey.permissions.includes(permission)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewApiKey({ ...newApiKey, permissions: [...newApiKey.permissions, permission] });
                                } else {
                                  setNewApiKey({ ...newApiKey, permissions: newApiKey.permissions.filter(p => p !== permission) });
                                }
                              }}
                              className="rounded text-indigo-600"
                            />
                            <span className="text-sm text-gray-700">{permission}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Expires In</label>
                      <select
                        value={newApiKey.expiresIn}
                        onChange={(e) => setNewApiKey({ ...newApiKey, expiresIn: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                        <option value="365">1 year</option>
                        <option value="0">Never</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={createApiKey}
                        disabled={isLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Create API Key
                      </button>
                      <button
                        onClick={() => setShowNewApiKey(false)}
                        className="px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showApiKey && (
                <div className="p-6 border-b border-gray-200 bg-yellow-50 border-yellow-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-yellow-900">Your new API key</h3>
                      <p className="text-sm text-yellow-800 mt-1">
                        Make sure to copy your API key now. You won't be able to see it again!
                      </p>
                      <div className="mt-3 p-3 bg-white border border-yellow-300 rounded-lg font-mono text-sm">
                        {showApiKey}
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => copyToClipboard(showApiKey)}
                          className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                        >
                          Copy Key
                        </button>
                        <button
                          onClick={() => setShowApiKey(null)}
                          className="px-3 py-1 text-yellow-700 text-sm rounded hover:bg-yellow-100"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="divide-y divide-gray-200">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-gray-900">{apiKey.name}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(apiKey.status)}`}>
                            {apiKey.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {apiKey.key.substring(0, 20)}...
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>Permissions: {apiKey.permissions.length}</span>
                          <span>Used: {apiKey.usageCount} times</span>
                          {apiKey.lastUsed && (
                            <span>Last used: {new Date(apiKey.lastUsed).toLocaleDateString()}</span>
                          )}
                          {apiKey.expiresAt && (
                            <span>Expires: {new Date(apiKey.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(apiKey.key)}
                          className="p-2 text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteApiKey(apiKey.id)}
                          disabled={isLoading}
                          className="p-2 text-red-400 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {apiKeys.length === 0 && (
                  <div className="p-12 text-center">
                    <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
                    <p className="text-gray-600 mb-4">Create your first API key for programmatic access</p>
                    <button
                      onClick={() => setShowNewApiKey(true)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Create API Key
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const runtime = "edge";
