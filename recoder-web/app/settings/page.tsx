"use client";

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';

import { useAuth } from "@/lib/auth/auth-context";
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  User, Save, Key, Palette, Zap, Shield, Bell,
  ChevronLeft, Eye, EyeOff, Plus, Trash2, Check
} from "lucide-react";

interface UserSettings {
  theme: "light" | "dark" | "system";
  defaultModel: string;
  codeStyle: "typescript" | "javascript" | "python";
  enableSmartRouting: boolean;
  enableRealCode: boolean;
  enableNotifications: boolean;
  apiKeys: { [provider: string]: string };
}

export default function Settings() {
  const { user, loading } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    theme: "light",
    defaultModel: "claude-3-5-sonnet-20241022",
    codeStyle: "typescript",
    enableSmartRouting: true,
    enableRealCode: true,
    enableNotifications: true,
    apiKeys: {},
  });
  const [showApiKeys, setShowApiKeys] = useState<{ [key: string]: boolean }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  useEffect(() => {
    if (user) {
      loadUserSettings();
    }
  }, [user]);

  const loadUserSettings = async () => {
    try {
      // Simulate loading user settings
      const defaultSettings: UserSettings = {
        theme: "light",
        defaultModel: "claude-3-5-sonnet-20241022",
        codeStyle: "typescript",
        enableSmartRouting: true,
        enableRealCode: true,
        enableNotifications: true,
        apiKeys: {},
      };
      setSettings(defaultSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      // Simulate API call to save settings
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      setSaveMessage("Failed to save settings. Please try again.");
      setTimeout(() => setSaveMessage(""), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const updateApiKey = (provider: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: value,
      },
    }));
  };

  const removeApiKey = (provider: string) => {
    setSettings(prev => {
      const newApiKeys = { ...prev.apiKeys };
      delete newApiKeys[provider];
      return {
        ...prev,
        apiKeys: newApiKeys,
      };
    });
  };

  const toggleApiKeyVisibility = (provider: string) => {
    setShowApiKeys(prev => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" />
                Back to Dashboard
              </Link>
              <div className="w-px h-6 bg-gray-300" />
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            </div>
            
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Save Message */}
        {saveMessage && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
            saveMessage.includes("successfully") 
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            <Check className="w-5 h-5" />
            {saveMessage}
          </div>
        )}

        <div className="space-y-8">
          {/* Profile Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4">
                {user?.image ? (
                  <Image
                    src={user.image}
                    alt={user.name || "User"}
                    width={64}
                    height={64}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8 text-white" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{user?.name}</h3>
                  <p className="text-gray-600">{user?.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Preferences */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                AI Preferences
              </h2>
            </div>
            <div className="p-6 space-y-6">
              {/* Default Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default AI Model
                </label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) => setSettings(prev => ({ ...prev, defaultModel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Premium)</option>
                  <option value="llama-3.1-70b-versatile">Groq Llama 3.1 70B (Fast)</option>
                  <option value="deepseek-ai/DeepSeek-V3">DeepSeek V3 (Reasoning)</option>
                  <option value="meta-llama/Llama-3.3-70B-Instruct-Turbo">Llama 3.3 70B (Balanced)</option>
                  <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Multimodal)</option>
                </select>
              </div>

              {/* Code Style */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Code Style
                </label>
                <select
                  value={settings.codeStyle}
                  onChange={(e) => setSettings(prev => ({ ...prev, codeStyle: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="typescript">TypeScript</option>
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                </select>
              </div>

              {/* Smart Routing */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Smart AI Routing</h3>
                  <p className="text-sm text-gray-600">Automatically select the best AI model for each task</p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, enableSmartRouting: !prev.enableSmartRouting }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.enableSmartRouting ? "bg-blue-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.enableSmartRouting ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Real Code Generation */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Real Code Generation</h3>
                  <p className="text-sm text-gray-600">Generate production-ready code with real functionality</p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, enableRealCode: !prev.enableRealCode }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.enableRealCode ? "bg-blue-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.enableRealCode ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Appearance
              </h2>
            </div>
            <div className="p-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Theme
                </label>
                <select
                  value={settings.theme}
                  onChange={(e) => setSettings(prev => ({ ...prev, theme: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Key className="w-5 h-5" />
                API Keys
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Add your own API keys to use premium features
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Existing API Keys */}
              {Object.entries(settings.apiKeys).map(([provider, key]) => (
                <div key={provider} className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                      {provider} API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKeys[provider] ? "text" : "password"}
                        value={key}
                        onChange={(e) => updateApiKey(provider, e.target.value)}
                        className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={`Enter ${provider} API key`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleApiKeyVisibility(provider)}
                        className="absolute right-8 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showApiKeys[provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => removeApiKey(provider)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Add New API Key */}
              <div className="border-t border-gray-200 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  {["anthropic", "openai", "groq", "google"].map((provider) => (
                    !settings.apiKeys[provider] && (
                      <button
                        key={provider}
                        onClick={() => updateApiKey(provider, "")}
                        className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="capitalize">Add {provider} Key</span>
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Email Notifications</h3>
                  <p className="text-sm text-gray-600">Receive updates about new features and tips</p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, enableNotifications: !prev.enableNotifications }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.enableNotifications ? "bg-blue-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.enableNotifications ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-lg shadow-sm border border-red-200">
            <div className="p-6 border-b border-red-200">
              <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Danger Zone
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-red-900">Delete Account</h3>
                  <p className="text-sm text-red-600">Permanently delete your account and all data</p>
                </div>
                <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const runtime = "edge";