/**
 * User Menu Component for recoder-web
 * Displays user profile and navigation menu
 */

import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('UserMenu');

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
      const data = await response.json() as { success?: boolean; user?: UserProfile };

      if (data.success && data.user) {
        userProfileStore.set(data.user);
      } else {
        userProfileStore.set(null);
      }
    } catch (error) {
      logger.error('[UserMenu] Failed to load profile:', error);
      userProfileStore.set(null);
    } finally {
      setLoading(false);
    }
  }

  function getMainSiteUrl() {
    // Check environment variable first
    if (import.meta.env.MAIN_SITE_URL) {
      return import.meta.env.MAIN_SITE_URL;
    }

    // Client-side: detect production from hostname
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'web.recoder.xyz' || hostname === 'recoder.xyz') {
        return 'https://recoder.xyz';
      }
    }

    // Development fallback
    return 'http://localhost:3000';
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
    const mainSiteUrl = getMainSiteUrl();
    window.location.href = `${mainSiteUrl}/dashboard`;
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
      <div className="px-3 py-2 text-sm text-recoder-elements-textSecondary">
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
        className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-recoder-elements-background-depth-1 hover:bg-recoder-elements-background-depth-2 transition-colors border border-recoder-elements-borderColor text-recoder-elements-textPrimary"
      >
        {userProfile.image && !imageError ? (
          <img
            src={userProfile.image}
            alt={userProfile.name || userProfile.email}
            className="w-8 h-8 rounded-full"
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
            {getInitials(userProfile.name)}
          </div>
        )}
        <div className="i-ph:caret-down text-recoder-elements-textSecondary" />
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
          <div className="absolute right-0 mt-2 w-64 rounded-lg border border-recoder-elements-borderColor shadow-2xl z-50 overflow-hidden bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary">
            {/* User Info */}
            <div className="p-4 border-b border-recoder-elements-borderColor">
              <div className="font-medium truncate text-recoder-elements-textPrimary">
                {userProfile.name || 'User'}
              </div>
              <div className="text-sm truncate text-recoder-elements-textSecondary">
                {userProfile.email}
              </div>
              {userProfile.subscription && (
                <div className="mt-2 inline-flex px-2 py-0.5 rounded-full text-xs bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary">
                  {userProfile.subscription === 'free' ? 'Free Beta' : userProfile.subscription}
                </div>
              )}
            </div>

            {/* Menu Items */}
            <div className="p-2">
              <button
                onClick={goToDashboard}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8H96a8,8,0,0,0,8-8V160h48v56a8,8,0,0,0,8,8h56a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H168V152a8,8,0,0,0-8-8H96a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z"/></svg>
                <span className="text-sm">Dashboard</span>
              </button>
              <button
                onClick={goToAccount}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z"/></svg>
                <span className="text-sm">Account</span>
              </button>
              <button
                onClick={goToSettings}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.68l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187.11,168a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.67a73.68,73.68,0,0,1-8.68,0,8,8,0,0,0-5.68,1.74L100.45,210.7a91.57,91.57,0,0,1-15-6.23L88,181.89a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64l-22.58-2.51a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.68,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.68L45.3,100.45a91.57,91.57,0,0,1,6.23-15L74.11,88A8,8,0,0,0,79.21,85.4a74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,88,74.16L90.47,51.58a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.68,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.68-1.74L155.55,45.3a91.57,91.57,0,0,1,15,6.23l2.51,22.58a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z"/></svg>
                <span className="text-sm">Settings</span>
              </button>
            </div>

            {/* Sign Out */}
            <div className="p-2 border-t border-recoder-elements-borderColor">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors group text-recoder-elements-textPrimary hover:bg-red-500/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor" className="group-hover:text-red-500"><path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H112a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z"/></svg>
                <span className="text-sm group-hover:text-red-500">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
