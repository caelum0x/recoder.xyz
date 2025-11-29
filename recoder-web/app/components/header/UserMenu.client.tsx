/**
 * User Menu Component for recoder-web
 * Displays user profile and navigation menu
 */

import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  image?: string;
  subscription?: string;
}

// Store for user profile
export const userProfileStore = atom<UserProfile | null>(null);

export function UserMenu() {
  const userProfile = useStore(userProfileStore);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, []);

  async function loadUserProfile() {
    try {
      setLoading(true);
      const response = await fetch('/api/user/profile');
      const data = await response.json();

      if (data.success && data.user) {
        userProfileStore.set(data.user);
      } else {
        userProfileStore.set(null);
      }
    } catch (error) {
      console.error('[UserMenu] Failed to load profile:', error);
      userProfileStore.set(null);
    } finally {
      setLoading(false);
    }
  }

  function getMainSiteUrl() {
    return import.meta.env.MAIN_SITE_URL || 'http://localhost:3000';
  }

  function handleSignOut() {
    window.location.href = `${getMainSiteUrl()}/auth/signout`;
  }

  function goToSettings() {
    window.location.href = `${getMainSiteUrl()}/settings`;
  }

  function goToAccount() {
    window.location.href = `${getMainSiteUrl()}/settings/account`;
  }

  function goToDashboard() {
    window.location.href = `${getMainSiteUrl()}/dashboard`;
  }

  const getInitials = (name?: string) => {
    if (!name) return userProfile?.email.charAt(0).toUpperCase();
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="px-3 py-2 text-sm text-bolt-elements-textSecondary">
        Loading...
      </div>
    );
  }

  if (!userProfile) {
    return (
      <a
        href={`${getMainSiteUrl()}/auth/signin?redirect=${encodeURIComponent(window.location.href)}`}
        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
      >
        Sign In
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-bolt-elements-background-depth-2 transition-colors"
      >
        {userProfile.image && !imageError ? (
          <img
            src={userProfile.image}
            alt={userProfile.name || userProfile.email}
            className="w-8 h-8 rounded-full"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
            {getInitials(userProfile.name)}
          </div>
        )}
        <div className="i-ph:caret-down text-bolt-elements-textSecondary" />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 mt-2 w-64 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-2xl z-50 overflow-hidden">
            {/* User Info */}
            <div className="p-4 border-b border-bolt-elements-borderColor">
              <div className="font-medium text-bolt-elements-textPrimary truncate">
                {userProfile.name || 'User'}
              </div>
              <div className="text-sm text-bolt-elements-textSecondary truncate">
                {userProfile.email}
              </div>
              {userProfile.subscription && (
                <div className="mt-2 inline-flex px-2 py-0.5 bg-bolt-elements-background-depth-2 rounded-full text-xs text-bolt-elements-textTertiary">
                  {userProfile.subscription === 'free' ? 'Free Beta' : userProfile.subscription}
                </div>
              )}
            </div>

            {/* Menu Items */}
            <div className="p-2">
              <button
                onClick={goToDashboard}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-bolt-elements-background-depth-2 transition-colors text-bolt-elements-textPrimary"
              >
                <div className="i-ph:house text-lg" />
                <span className="text-sm">Dashboard</span>
              </button>
              <button
                onClick={goToAccount}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-bolt-elements-background-depth-2 transition-colors text-bolt-elements-textPrimary"
              >
                <div className="i-ph:user text-lg" />
                <span className="text-sm">Account</span>
              </button>
              <button
                onClick={goToSettings}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-bolt-elements-background-depth-2 transition-colors text-bolt-elements-textPrimary"
              >
                <div className="i-ph:gear text-lg" />
                <span className="text-sm">Settings</span>
              </button>
            </div>

            {/* Sign Out */}
            <div className="p-2 border-t border-bolt-elements-borderColor">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-bolt-elements-textPrimary group"
              >
                <div className="i-ph:sign-out text-lg group-hover:text-red-500" />
                <span className="text-sm group-hover:text-red-500">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
