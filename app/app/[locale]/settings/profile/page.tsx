/**
 * Profile Settings Page
 * Manage avatar, bio, and public profile
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowLeft,
  Terminal,
  Upload,
  X,
  Save,
  Loader2,
  CheckCircle,
  User,
  Briefcase,
  Globe as GlobeIcon,
  Github,
  Twitter,
  Linkedin
} from 'lucide-react';

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState({
    display_name: '',
    bio: '',
    company: '',
    website: '',
    location: '',
    avatar_url: '',
    github_username: '',
    twitter_username: '',
    linkedin_username: '',
    public_profile: true
  });

  // Load profile data from API
  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/profile');
      const data = await response.json();

      if (data.success && data.profile) {
        setProfileData({
          display_name: data.profile.display_name || '',
          bio: data.profile.bio || '',
          company: data.profile.company || '',
          website: data.profile.website || '',
          location: data.profile.location || '',
          avatar_url: data.profile.avatar_url || '',
          github_username: data.profile.github_username || '',
          twitter_username: data.profile.twitter_username || '',
          linkedin_username: data.profile.linkedin_username || '',
          public_profile: data.profile.public_profile ?? true
        });
        setAvatarPreview(data.profile.avatar_url);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Failed to load profile settings');
    } finally {
      setLoading(false);
    }
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      // Update avatar_url if preview changed
      const dataToSave = {
        ...profileData,
        avatar_url: avatarPreview || profileData.avatar_url
      };

      const response = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to update profile');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
            <p className="text-gray-400">Manage your public profile and information</p>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400">Profile updated successfully!</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Avatar Upload */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Profile Picture</h2>
              <div className="flex items-center space-x-6">
                <div className="relative">
                  {avatarPreview ? (
                    <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-orange-500">
                      <Image
                        src={avatarPreview}
                        alt="Avatar preview"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center">
                      <User className="w-12 h-12 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload New Picture</span>
                  </button>
                  {avatarPreview && (
                    <button
                      onClick={handleRemoveAvatar}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg font-medium transition-all flex items-center space-x-2"
                    >
                      <X className="w-4 h-4" />
                      <span>Remove</span>
                    </button>
                  )}
                  <p className="text-xs text-gray-500">
                    JPG, PNG or GIF. Max size 5MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Basic Information */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Basic Information</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">
                    Display Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={profileData.display_name}
                    onChange={(e) => setProfileData({ ...profileData, display_name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="bio" className="block text-sm font-medium text-gray-300">
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    rows={4}
                    value={profileData.bio}
                    onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white resize-none"
                    placeholder="Tell us about yourself..."
                  />
                  <p className="text-xs text-gray-500">
                    {profileData.bio.length}/160 characters
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="company" className="block text-sm font-medium text-gray-300">
                    Company
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="company"
                      type="text"
                      value={profileData.company}
                      onChange={(e) => setProfileData({ ...profileData, company: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="website" className="block text-sm font-medium text-gray-300">
                    Website
                  </label>
                  <div className="relative">
                    <GlobeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="website"
                      type="url"
                      value={profileData.website}
                      onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="location" className="block text-sm font-medium text-gray-300">
                    Location
                  </label>
                  <input
                    id="location"
                    type="text"
                    value={profileData.location}
                    onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    placeholder="City, Country"
                  />
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Social Links</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="github" className="block text-sm font-medium text-gray-300">
                    GitHub
                  </label>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="github"
                      type="text"
                      value={profileData.github_username}
                      onChange={(e) => setProfileData({
                        ...profileData,
                        github_username: e.target.value
                      })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                      placeholder="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="twitter" className="block text-sm font-medium text-gray-300">
                    Twitter
                  </label>
                  <div className="relative">
                    <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="twitter"
                      type="text"
                      value={profileData.twitter_username}
                      onChange={(e) => setProfileData({
                        ...profileData,
                        twitter_username: e.target.value
                      })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                      placeholder="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="linkedin" className="block text-sm font-medium text-gray-300">
                    LinkedIn
                  </label>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="linkedin"
                      type="text"
                      value={profileData.linkedin_username}
                      onChange={(e) => setProfileData({
                        ...profileData,
                        linkedin_username: e.target.value
                      })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                      placeholder="username"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Privacy</h2>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Public Profile</div>
                  <div className="text-sm text-gray-400">Make your profile visible to everyone</div>
                </div>
                <button
                  onClick={() => setProfileData({ ...profileData, public_profile: !profileData.public_profile })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    profileData.public_profile ? 'bg-orange-500' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      profileData.public_profile ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end space-x-3">
              <Link
                href="/settings"
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
