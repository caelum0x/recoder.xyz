"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GDPRDataExport } from "@/components/settings/gdpr-data-export";
import {
  Shield, ChevronLeft, Eye, EyeOff, Globe, Users, UserX, Lock,
  Settings, Bell, BellOff, Database, Download, Trash2, AlertTriangle,
  Check, X, Info, Cookie, MapPin, Activity, BarChart3, Camera,
  Mic, FileText, Share2, Monitor, Mail, Phone
} from "lucide-react";

interface PrivacySettings {
  profileVisibility: "public" | "friends" | "private";
  showEmail: boolean;
  showPhone: boolean;
  showLocation: boolean;
  showOnlineStatus: boolean;
  allowDirectMessages: "everyone" | "friends" | "none";
  allowFriendRequests: boolean;
  showProjectsPublicly: boolean;
  allowProjectSharing: boolean;
  dataCollection: {
    analytics: boolean;
    marketing: boolean;
    personalization: boolean;
    thirdParty: boolean;
  };
  tracking: {
    cookies: boolean;
    location: boolean;
    usage: boolean;
    performance: boolean;
  };
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
    marketing: boolean;
  };
  searchVisibility: boolean;
  allowSearchEngines: boolean;
  twoFactorRequired: boolean;
  sessionTimeout: number; // in minutes
}

export default function PrivacySettings() {
  const { user, loading } = useAuth();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("visibility");
  const [showDataDeletion, setShowDataDeletion] = useState(false);
  const [deletionConfirm, setDeletionConfirm] = useState("");

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  useEffect(() => {
    if (user) {
      loadPrivacySettings();
    }
  }, [user]);

  const loadPrivacySettings = async () => {
    try {
      const response = await fetch("/api/user/privacy/settings", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Failed to load privacy settings:", error);
    }
  };

  const updateSettings = async (newSettings: Partial<PrivacySettings>) => {
    if (!settings) return;

    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    try {
      const response = await fetch("/api/user/privacy/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updatedSettings),
      });

      if (response.ok) {
        setMessage("Privacy settings updated successfully!");
      } else {
        setMessage("Failed to update privacy settings");
        setSettings(settings); // Revert on error
      }
    } catch (error) {
      setMessage("Failed to update privacy settings");
      setSettings(settings); // Revert on error
    } finally {
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const deletePersonalData = async () => {
    if (deletionConfirm !== "DELETE MY DATA") {
      setMessage("Please type 'DELETE MY DATA' to confirm");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/privacy/delete-data", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setMessage("Data deletion request submitted. This may take up to 30 days to complete.");
        setShowDataDeletion(false);
        setDeletionConfirm("");
      } else {
        setMessage("Failed to submit data deletion request");
      }
    } catch (error) {
      setMessage("Failed to submit data deletion request");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 5000);
    }
  };

  const getVisibilityIcon = (level: string) => {
    switch (level) {
      case "public": return <Globe className="w-4 h-4" />;
      case "friends": return <Users className="w-4 h-4" />;
      case "private": return <Lock className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getVisibilityColor = (level: string) => {
    switch (level) {
      case "public": return "text-blue-600 bg-blue-100";
      case "friends": return "text-green-600 bg-green-100";
      case "private": return "text-gray-600 bg-gray-100";
      default: return "text-blue-600 bg-blue-100";
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
        <div className="text-gray-600">Loading privacy settings...</div>
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
              <h1 className="text-3xl font-bold text-gray-900">Privacy Settings</h1>
              <p className="text-gray-600 mt-2">Control your privacy and data sharing preferences</p>
            </div>
            {message && (
              <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                message.includes("successfully") || message.includes("requested")
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}>
                {message.includes("successfully") || message.includes("requested") ? (
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
              { id: "visibility", label: "Profile Visibility", icon: Eye },
              { id: "data", label: "Data & Tracking", icon: Database },
              { id: "communications", label: "Communications", icon: Mail },
              { id: "export", label: "Data Export", icon: Download },
              { id: "deletion", label: "Data Deletion", icon: Trash2 }
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

        {/* Profile Visibility Section */}
        {activeSection === "visibility" && (
          <div className="space-y-6">
            {/* Profile Visibility Level */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Profile Visibility
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Control who can see your profile and information
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {[
                    { value: "public", label: "Public", description: "Anyone can see your profile" },
                    { value: "friends", label: "Friends Only", description: "Only your friends can see your profile" },
                    { value: "private", label: "Private", description: "Only you can see your profile" }
                  ].map((option) => (
                    <label key={option.value} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="radio"
                        name="profileVisibility"
                        value={option.value}
                        checked={settings.profileVisibility === option.value}
                        onChange={(e) => updateSettings({ profileVisibility: e.target.value as any })}
                        className="text-indigo-600"
                      />
                      <div className={`p-2 rounded-full ${getVisibilityColor(option.value)}`}>
                        {getVisibilityIcon(option.value)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{option.label}</div>
                        <div className="text-sm text-gray-600">{option.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Contact Information Visibility */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Choose what contact information to show on your profile
                </p>
              </div>
              <div className="p-6 space-y-4">
                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Email Address</div>
                      <div className="text-sm text-gray-600">Show your email on your profile</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ showEmail: !settings.showEmail })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.showEmail ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.showEmail ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Phone Number</div>
                      <div className="text-sm text-gray-600">Show your phone number on your profile</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ showPhone: !settings.showPhone })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.showPhone ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.showPhone ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Location</div>
                      <div className="text-sm text-gray-600">Show your location on your profile</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ showLocation: !settings.showLocation })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.showLocation ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.showLocation ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Online Status</div>
                      <div className="text-sm text-gray-600">Show when you're online</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ showOnlineStatus: !settings.showOnlineStatus })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.showOnlineStatus ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.showOnlineStatus ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>
              </div>
            </div>

            {/* Search & Discovery */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Search & Discovery</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Control how others can find you
                </p>
              </div>
              <div className="p-6 space-y-4">
                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Searchable on Platform</div>
                      <div className="text-sm text-gray-600">Allow others to find you in search results</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ searchVisibility: !settings.searchVisibility })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.searchVisibility ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.searchVisibility ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Search Engine Indexing</div>
                      <div className="text-sm text-gray-600">Allow search engines to index your public profile</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ allowSearchEngines: !settings.allowSearchEngines })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.allowSearchEngines ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.allowSearchEngines ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Data & Tracking Section */}
        {activeSection === "data" && (
          <div className="space-y-6">
            {/* Data Collection */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Data Collection
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Control what data we collect to improve your experience
                </p>
              </div>
              <div className="p-6 space-y-4">
                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Analytics</div>
                      <div className="text-sm text-gray-600">Help us understand how you use the platform</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      dataCollection: { ...settings.dataCollection, analytics: !settings.dataCollection.analytics } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.dataCollection.analytics ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.dataCollection.analytics ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Marketing</div>
                      <div className="text-sm text-gray-600">Allow us to send you marketing communications</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      dataCollection: { ...settings.dataCollection, marketing: !settings.dataCollection.marketing } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.dataCollection.marketing ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.dataCollection.marketing ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Personalization</div>
                      <div className="text-sm text-gray-600">Personalize your experience based on your activity</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      dataCollection: { ...settings.dataCollection, personalization: !settings.dataCollection.personalization } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.dataCollection.personalization ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.dataCollection.personalization ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Share2 className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Third-Party Sharing</div>
                      <div className="text-sm text-gray-600">Allow sharing data with trusted partners</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      dataCollection: { ...settings.dataCollection, thirdParty: !settings.dataCollection.thirdParty } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.dataCollection.thirdParty ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.dataCollection.thirdParty ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>
              </div>
            </div>

            {/* Tracking Preferences */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Cookie className="w-5 h-5" />
                  Tracking Preferences
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Control cookies and tracking technologies
                </p>
              </div>
              <div className="p-6 space-y-4">
                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Cookie className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Cookies</div>
                      <div className="text-sm text-gray-600">Allow non-essential cookies for enhanced experience</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      tracking: { ...settings.tracking, cookies: !settings.tracking.cookies } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.tracking.cookies ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.tracking.cookies ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Location Tracking</div>
                      <div className="text-sm text-gray-600">Allow location-based features and content</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      tracking: { ...settings.tracking, location: !settings.tracking.location } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.tracking.location ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.tracking.location ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Usage Analytics</div>
                      <div className="text-sm text-gray-600">Track feature usage and interactions</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      tracking: { ...settings.tracking, usage: !settings.tracking.usage } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.tracking.usage ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.tracking.usage ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Monitor className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">Performance Monitoring</div>
                      <div className="text-sm text-gray-600">Help us monitor and improve performance</div>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ 
                      tracking: { ...settings.tracking, performance: !settings.tracking.performance } 
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.tracking.performance ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.tracking.performance ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Communications Section */}
        {activeSection === "communications" && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Communication Preferences
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Control how and when we communicate with you
              </p>
            </div>
            <div className="p-6 space-y-6">
              {/* Messaging Preferences */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-4">Direct Messages</h3>
                <div className="space-y-3">
                  {[
                    { value: "everyone", label: "Everyone", description: "Anyone can send you messages" },
                    { value: "friends", label: "Friends Only", description: "Only your friends can message you" },
                    { value: "none", label: "No One", description: "Block all direct messages" }
                  ].map((option) => (
                    <label key={option.value} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="radio"
                        name="allowDirectMessages"
                        value={option.value}
                        checked={settings.allowDirectMessages === option.value}
                        onChange={(e) => updateSettings({ allowDirectMessages: e.target.value as any })}
                        className="text-indigo-600"
                      />
                      <div>
                        <div className="font-medium text-gray-900">{option.label}</div>
                        <div className="text-sm text-gray-600">{option.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notification Preferences */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-4">Notifications</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">Email Notifications</div>
                        <div className="text-sm text-gray-600">Receive notifications via email</div>
                      </div>
                    </div>
                    <button
                      onClick={() => updateSettings({ 
                        notifications: { ...settings.notifications, email: !settings.notifications.email } 
                      })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.notifications.email ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.notifications.email ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">SMS Notifications</div>
                        <div className="text-sm text-gray-600">Receive notifications via SMS</div>
                      </div>
                    </div>
                    <button
                      onClick={() => updateSettings({ 
                        notifications: { ...settings.notifications, sms: !settings.notifications.sms } 
                      })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.notifications.sms ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.notifications.sms ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">Push Notifications</div>
                        <div className="text-sm text-gray-600">Receive push notifications in your browser</div>
                      </div>
                    </div>
                    <button
                      onClick={() => updateSettings({ 
                        notifications: { ...settings.notifications, push: !settings.notifications.push } 
                      })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.notifications.push ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.notifications.push ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">Marketing Emails</div>
                        <div className="text-sm text-gray-600">Receive product updates and promotional emails</div>
                      </div>
                    </div>
                    <button
                      onClick={() => updateSettings({ 
                        notifications: { ...settings.notifications, marketing: !settings.notifications.marketing } 
                      })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.notifications.marketing ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.notifications.marketing ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Export Section */}
        {activeSection === "export" && (
          <GDPRDataExport />
        )}

        {/* Data Deletion Section */}
        {activeSection === "deletion" && (
          <div className="bg-white rounded-lg shadow-sm border border-red-200">
            <div className="p-6 border-b border-red-200">
              <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Data Deletion
              </h2>
              <p className="text-sm text-red-600 mt-1">
                Permanently delete your personal data from our systems
              </p>
            </div>
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-red-900">Important Information</h3>
                    <ul className="text-sm text-red-800 mt-2 space-y-1">
                      <li>• This action is irreversible and cannot be undone</li>
                      <li>• All your projects, data, and account information will be permanently deleted</li>
                      <li>• Deletion may take up to 30 days to complete across all systems</li>
                      <li>• Some data may be retained for legal or security purposes as required by law</li>
                    </ul>
                  </div>
                </div>
              </div>

              {!showDataDeletion ? (
                <button
                  onClick={() => setShowDataDeletion(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Request Data Deletion
                </button>
              ) : (
                <div className="space-y-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-800 font-medium">
                    Are you absolutely sure? This action cannot be undone.
                  </p>
                  <p className="text-sm text-red-700">
                    Type <span className="font-mono font-bold">DELETE MY DATA</span> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deletionConfirm}
                    onChange={(e) => setDeletionConfirm(e.target.value)}
                    className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    placeholder="Type DELETE MY DATA to confirm"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={deletePersonalData}
                      disabled={isLoading || deletionConfirm !== "DELETE MY DATA"}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      {isLoading ? "Processing..." : "Permanently Delete My Data"}
                    </button>
                    <button
                      onClick={() => {
                        setShowDataDeletion(false);
                        setDeletionConfirm("");
                      }}
                      className="px-4 py-2 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const runtime = "edge";
