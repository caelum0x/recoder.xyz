/**
 * Profile Settings Page for Recoder Web
 * Edit user profile information
 */

import { useState } from 'react';
import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getProfileSettings, updateProfileSettings, type ProfileSettings } from '~/lib/api/settings';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SettingsProfile');

export async function loader({ request }: LoaderFunctionArgs) {
  // Load profile settings from API
  const settings = await getProfileSettings();

  return json({
    settings: settings || {
      display_name: '',
      bio: '',
      company: '',
      website: '',
      location: '',
      avatar_url: '',
      github_username: '',
      twitter_username: '',
      linkedin_username: '',
      public_profile: true,
    },
  });
}

export default function ProfileSettingsPage() {
  const { settings: initialSettings } = useLoaderData<typeof loader>();
  const [settings, setSettings] = useState<ProfileSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');

    try {
      const success = await updateProfileSettings(settings);

      if (success) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      logger.error('Failed to save profile settings:', error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof ProfileSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
        <p className="text-bolt-elements-textSecondary">
          Manage your public profile and information
        </p>
      </div>

      {/* Save Status */}
      {saveStatus === 'success' && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400">
          Profile updated successfully!
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          Failed to save profile. Please try again.
        </div>
      )}

      {/* Avatar Section */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Profile Picture</h2>
        <div className="flex items-center space-x-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
            {settings.display_name ? settings.display_name.charAt(0).toUpperCase() : '?'}
          </div>
          <div>
            <p className="text-sm text-bolt-elements-textSecondary mb-2">
              Avatar URL (optional)
            </p>
            <input
              type="url"
              value={settings.avatar_url}
              onChange={(e) => updateSetting('avatar_url', e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-80 px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
          </div>
        </div>
      </section>

      {/* Basic Information */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Basic Information</h2>
        <div className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium mb-2">Display Name</label>
            <input
              type="text"
              value={settings.display_name}
              onChange={(e) => updateSetting('display_name', e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium mb-2">Bio</label>
            <textarea
              rows={4}
              value={settings.bio}
              onChange={(e) => updateSetting('bio', e.target.value)}
              placeholder="Tell us about yourself..."
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus resize-none"
            />
            <p className="text-xs text-bolt-elements-textSecondary mt-1">
              {settings.bio.length}/160 characters
            </p>
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium mb-2">Company</label>
            <input
              type="text"
              value={settings.company}
              onChange={(e) => updateSetting('company', e.target.value)}
              placeholder="Your company"
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium mb-2">Website</label>
            <input
              type="url"
              value={settings.website}
              onChange={(e) => updateSetting('website', e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            <input
              type="text"
              value={settings.location}
              onChange={(e) => updateSetting('location', e.target.value)}
              placeholder="City, Country"
              className="w-full px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
            />
          </div>
        </div>
      </section>

      {/* Social Links */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Social Links</h2>
        <div className="space-y-4">
          {/* GitHub */}
          <div>
            <label className="block text-sm font-medium mb-2">GitHub Username</label>
            <div className="flex items-center">
              <span className="px-4 py-2 bg-bolt-elements-background-depth-3 border border-r-0 border-bolt-elements-borderColor rounded-l-lg text-bolt-elements-textSecondary">
                github.com/
              </span>
              <input
                type="text"
                value={settings.github_username}
                onChange={(e) => updateSetting('github_username', e.target.value)}
                placeholder="username"
                className="flex-1 px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-r-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
            </div>
          </div>

          {/* Twitter */}
          <div>
            <label className="block text-sm font-medium mb-2">Twitter Username</label>
            <div className="flex items-center">
              <span className="px-4 py-2 bg-bolt-elements-background-depth-3 border border-r-0 border-bolt-elements-borderColor rounded-l-lg text-bolt-elements-textSecondary">
                twitter.com/
              </span>
              <input
                type="text"
                value={settings.twitter_username}
                onChange={(e) => updateSetting('twitter_username', e.target.value)}
                placeholder="username"
                className="flex-1 px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-r-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
            </div>
          </div>

          {/* LinkedIn */}
          <div>
            <label className="block text-sm font-medium mb-2">LinkedIn Username</label>
            <div className="flex items-center">
              <span className="px-4 py-2 bg-bolt-elements-background-depth-3 border border-r-0 border-bolt-elements-borderColor rounded-l-lg text-bolt-elements-textSecondary">
                linkedin.com/in/
              </span>
              <input
                type="text"
                value={settings.linkedin_username}
                onChange={(e) => updateSetting('linkedin_username', e.target.value)}
                placeholder="username"
                className="flex-1 px-4 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-r-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="p-6 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <h2 className="text-xl font-bold mb-4">Privacy</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Public Profile</div>
            <div className="text-sm text-bolt-elements-textSecondary">
              Make your profile visible to everyone
            </div>
          </div>
          <button
            onClick={() => updateSetting('public_profile', !settings.public_profile)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.public_profile ? 'bg-bolt-elements-item-contentAccent' : 'bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                settings.public_profile ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-contentActive rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
