"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  User, Mail, Globe, MapPin, Calendar, Camera, 
  Save, X, Check, AlertTriangle, Edit, Upload,
  Github, Twitter, Linkedin, Link as LinkIcon,
  Shield, Settings, Bell, Trash2, Eye, EyeOff
} from "lucide-react";
import Image from "next/image";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  username: string;
  bio?: string;
  avatar?: string;
  location?: string;
  website?: string;
  company?: string;
  timezone: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  socialLinks: {
    github?: string;
    twitter?: string;
    linkedin?: string;
    website?: string;
  };
  preferences: {
    theme: "light" | "dark" | "system";
    language: string;
    publicProfile: boolean;
    showEmail: boolean;
    showLocation: boolean;
  };
  createdAt: string;
  lastLoginAt: string;
}

interface AccountFormProps {
  profile?: UserProfile;
  onUpdate?: (profile: UserProfile) => void;
  readOnly?: boolean;
}

export function AccountForm({ profile: initialProfile, onUpdate, readOnly = false }: AccountFormProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile || null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isEditing, setIsEditing] = useState(!readOnly);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    bio: "",
    location: "",
    website: "",
    company: "",
    timezone: "",
    socialLinks: {
      github: "",
      twitter: "",
      linkedin: "",
      website: "",
    } as { github?: string; twitter?: string; linkedin?: string; website?: string },
    preferences: {
      theme: "system" as "light" | "dark" | "system",
      language: "en",
      publicProfile: true,
      showEmail: false,
      showLocation: true,
    },
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || "",
        username: profile.username || "",
        bio: profile.bio || "",
        location: profile.location || "",
        website: profile.website || "",
        company: profile.company || "",
        timezone: profile.timezone || "UTC",
        socialLinks: {
          github: profile.socialLinks?.github || "",
          twitter: profile.socialLinks?.twitter || "",
          linkedin: profile.socialLinks?.linkedin || "",
          website: profile.socialLinks?.website || "",
        },
        preferences: {
          theme: (profile.preferences?.theme || "system") as "light" | "dark" | "system",
          language: profile.preferences?.language || "en",
          publicProfile: profile.preferences?.publicProfile ?? true,
          showEmail: profile.preferences?.showEmail ?? false,
          showLocation: profile.preferences?.showLocation ?? true,
        },
      });
    } else {
      loadProfile();
    }
  }, [profile]);

  const loadProfile = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/profile", {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        // Create default profile from user data
        const defaultProfile: UserProfile = {
          id: user.id,
          email: user.email,
          name: user.name || "",
          username: "",
          timezone: "UTC",
          emailVerified: user.emailVerified || false,
          twoFactorEnabled: false,
          socialLinks: {},
          preferences: {
            theme: "system",
            language: "en",
            publicProfile: true,
            showEmail: false,
            showLocation: true,
          },
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        setProfile(defaultProfile);
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
      setMessage("Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        return {
          ...prev,
          [parent]: {
            ...(prev[parent as keyof typeof prev] as object),
            [child]: value,
          },
        };
      }
      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setMessage("File size must be less than 5MB");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Please upload an image file");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async (file: File) => {
    const formDataObj = new FormData();
    formDataObj.append("avatar", file);

    const response = await fetch("/api/user/profile/avatar", {
      method: "POST",
      credentials: "include",
      body: formDataObj,
    });

    if (!response.ok) {
      throw new Error("Failed to upload avatar");
    }

    const data = await response.json();
    return data.avatarUrl;
  };

  const saveProfile = async () => {
    setIsLoading(true);
    try {
      // Handle avatar upload if there's a new one
      let avatarUrl = profile?.avatar;
      if (avatarPreview && fileInputRef.current?.files?.[0]) {
        avatarUrl = await uploadAvatar(fileInputRef.current.files[0]);
      }

      const updatedProfile = {
        ...formData,
        avatar: avatarUrl,
      };

      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updatedProfile),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
        setAvatarPreview(null);
        setIsEditing(false);
        setMessage("Profile updated successfully!");
        
        if (onUpdate) {
          onUpdate(data);
        }
      } else {
        setMessage("Failed to update profile");
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
      setMessage("Failed to update profile");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const changePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      setMessage("Please fill in all password fields");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage("New passwords don't match");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setMessage("Password must be at least 8 characters long");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setMessage("Password changed successfully!");
        setShowPasswordDialog(false);
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        const data = await response.json();
        setMessage(data.error || "Failed to change password");
      }
    } catch (error) {
      setMessage("Failed to change password");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const resendVerificationEmail = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setMessage("Verification email sent!");
      } else {
        setMessage("Failed to send verification email");
      }
    } catch (error) {
      setMessage("Failed to send verification email");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  if (isLoading && !profile) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Failed to load profile data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Account Settings</h2>
          <p className="text-gray-600 mt-1">Manage your personal information and preferences</p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              message.includes("successfully") || message.includes("sent")
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}>
              {message.includes("successfully") || message.includes("sent") ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {message}
            </div>
          )}
          
          {!readOnly && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Avatar and Basic Info */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="text-center">
              {/* Avatar */}
              <div className="relative mb-4">
                <div className="w-32 h-32 rounded-full mx-auto overflow-hidden border-4 border-gray-200">
                  {avatarPreview || profile.avatar ? (
                    <Image
                      src={avatarPreview || profile.avatar || ""}
                      alt="Profile"
                      width={128}
                      height={128}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <User className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                </div>
                
                {isEditing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-1/2 transform translate-x-1/2 translate-y-2 bg-indigo-600 text-white rounded-full p-2 hover:bg-indigo-700"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                )}
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>

              <h3 className="text-xl font-semibold text-gray-900">{profile.name || "No name set"}</h3>
              <p className="text-gray-600">@{profile.username || "username"}</p>
              
              {/* Account Status */}
              <div className="mt-4 space-y-2">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                  profile.emailVerified ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                }`}>
                  {profile.emailVerified ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  {profile.emailVerified ? "Email Verified" : "Email Pending"}
                </div>
                
                {!profile.emailVerified && (
                  <div>
                    <button
                      onClick={resendVerificationEmail}
                      disabled={isLoading}
                      className="text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                    >
                      Resend verification email
                    </button>
                  </div>
                )}
                
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                  profile.twoFactorEnabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                }`}>
                  <Shield className="w-3 h-3" />
                  {profile.twoFactorEnabled ? "2FA Enabled" : "2FA Disabled"}
                </div>
              </div>

              {/* Account Stats */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  <div className="flex justify-between mb-1">
                    <span>Member since:</span>
                    <span>{new Date(profile.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last active:</span>
                    <span>{new Date(profile.lastLoginAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="John Doe"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => handleInputChange("username", e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="johndoe"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed here</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => handleInputChange("company", e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="Acme Inc."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => handleInputChange("location", e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="San Francisco, CA"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => handleInputChange("timezone", e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Berlin">Berlin</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                      <option value="Australia/Sydney">Sydney</option>
                    </select>
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => handleInputChange("bio", e.target.value)}
                    disabled={!isEditing}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                    placeholder="Tell us about yourself..."
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500 mt-1">{formData.bio.length}/500 characters</p>
                </div>
              </div>

              {/* Social Links */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Social Links</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Github className="w-5 h-5 text-gray-500" />
                    <input
                      type="url"
                      value={formData.socialLinks.github || ""}
                      onChange={(e) => handleInputChange("socialLinks.github", e.target.value)}
                      disabled={!isEditing}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="https://github.com/username"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Twitter className="w-5 h-5 text-gray-500" />
                    <input
                      type="url"
                      value={formData.socialLinks.twitter || ""}
                      onChange={(e) => handleInputChange("socialLinks.twitter", e.target.value)}
                      disabled={!isEditing}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="https://twitter.com/username"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Linkedin className="w-5 h-5 text-gray-500" />
                    <input
                      type="url"
                      value={formData.socialLinks.linkedin || ""}
                      onChange={(e) => handleInputChange("socialLinks.linkedin", e.target.value)}
                      disabled={!isEditing}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="https://linkedin.com/in/username"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <LinkIcon className="w-5 h-5 text-gray-500" />
                    <input
                      type="url"
                      value={formData.website || ""}
                      onChange={(e) => handleInputChange("website", e.target.value)}
                      disabled={!isEditing}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                      placeholder="https://yourwebsite.com"
                    />
                  </div>
                </div>
              </div>

              {/* Privacy Preferences */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Privacy & Preferences</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Public Profile</p>
                      <p className="text-xs text-gray-500">Allow others to view your profile</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.preferences.publicProfile}
                        onChange={(e) => handleInputChange("preferences.publicProfile", e.target.checked)}
                        disabled={!isEditing}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Show Email</p>
                      <p className="text-xs text-gray-500">Display email on public profile</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.preferences.showEmail}
                        onChange={(e) => handleInputChange("preferences.showEmail", e.target.checked)}
                        disabled={!isEditing}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Show Location</p>
                      <p className="text-xs text-gray-500">Display location on public profile</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.preferences.showLocation}
                        onChange={(e) => handleInputChange("preferences.showLocation", e.target.checked)}
                        disabled={!isEditing}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Theme Preference</label>
                    <select
                      value={formData.preferences.theme}
                      onChange={(e) => handleInputChange("preferences.theme", e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="system">System</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {isEditing && (
                <div className="flex items-center justify-between pt-6 border-t border-gray-200">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={saveProfile}
                      disabled={isLoading}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {isLoading ? "Saving..." : "Save Changes"}
                    </button>
                    
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setAvatarPreview(null);
                        // Reset form data
                        setFormData({
                          name: profile.name || "",
                          username: profile.username || "",
                          bio: profile.bio || "",
                          location: profile.location || "",
                          website: profile.website || "",
                          company: profile.company || "",
                          timezone: profile.timezone || "UTC",
                          socialLinks: {
                            github: profile.socialLinks?.github || "",
                            twitter: profile.socialLinks?.twitter || "",
                            linkedin: profile.socialLinks?.linkedin || "",
                            website: profile.socialLinks?.website || "",
                          },
                          preferences: {
                            theme: (profile.preferences?.theme || "system") as "light" | "dark" | "system",
                            language: profile.preferences?.language || "en",
                            publicProfile: profile.preferences?.publicProfile ?? true,
                            showEmail: profile.preferences?.showEmail ?? false,
                            showLocation: profile.preferences?.showLocation ?? true,
                          },
                        });
                      }}
                      className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                  
                  <button
                    onClick={() => setShowPasswordDialog(true)}
                    className="px-4 py-2 text-indigo-600 hover:text-indigo-700 flex items-center gap-2"
                  >
                    <Shield className="w-4 h-4" />
                    Change Password
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Dialog */}
      {showPasswordDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
              <button
                onClick={() => setShowPasswordDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowPasswordDialog(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={changePassword}
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLoading ? "Changing..." : "Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}