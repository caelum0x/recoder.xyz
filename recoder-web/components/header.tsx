'use client';

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { User, Settings, LogOut, Plus, History, Zap, Palette, Users, Trophy, Bot, TrendingUp, Target } from "lucide-react";

import GithubIcon from "@/components/icons/github-icon";
import { getBrandConfig } from "@/lib/recoder-config";

const brandConfig = getBrandConfig();

export default function Header() {
  const { user, loading, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [showUserMenu]);

  const handleSignOut = async () => {
    await logout();
    setShowUserMenu(false);
    if (typeof window !== 'undefined') {
      window.location.href = "/";
    }
  };

  return (
    <header className="web-header relative mx-auto flex w-full shrink-0 items-center justify-between py-6 z-50 px-6">
      {/* Enhanced Logo Section */}
      <Link href="/" className="flex items-center gap-3 group transition-all duration-300 hover:scale-105">
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Recoder
            </span>
            <span className="text-xs text-gray-500 font-medium -mt-1">AI Development Platform</span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-lg" />
        </div>
      </Link>

      {/* Navigation Links */}
      <nav className="hidden md:flex items-center gap-6">
        <Link 
          href="/docs" 
          className="text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors duration-200 hover:scale-105"
        >
          📚 Docs
        </Link>
        <Link 
          href="/cli" 
          className="text-sm font-semibold text-gray-700 hover:text-purple-600 transition-colors duration-200 hover:scale-105"
        >
          ⚡ CLI
        </Link>
        <a 
          href="https://chat.recoder.xyz" 
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-gray-700 hover:text-green-600 transition-colors duration-200 hover:scale-105"
        >
          💬 Chat
        </a>
        <Link 
          href="/" 
          className="text-sm font-semibold text-gray-700 hover:text-orange-600 transition-colors duration-200 hover:scale-105"
        >
          🛠️ Builder
        </Link>
      </nav>

      <div className="flex items-center gap-4">
        {/* Enhanced Multi-AI Status Indicator */}
        <div className="hidden items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-50/80 to-purple-50/80 backdrop-blur-sm px-4 py-2 text-xs font-semibold text-blue-800 ring-1 ring-blue-200/50 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 lg:flex">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              <div className="h-4 w-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 ring-2 ring-white shadow-sm animate-pulse" title="Claude - Active" />
              <div className="h-4 w-4 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 ring-2 ring-white shadow-sm" title="Groq" />
              <div className="h-4 w-4 rounded-full bg-gradient-to-br from-green-500 to-green-600 ring-2 ring-white shadow-sm" title="Gemini" />
              <div className="h-4 w-4 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 ring-2 ring-white shadow-sm" title="OpenRouter" />
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="bg-gradient-to-r from-blue-700 to-purple-700 bg-clip-text text-transparent font-bold">Multi-AI Active</span>
            </div>
          </div>
        </div>

        {/* Enhanced GitHub Link */}
        <a
          href={brandConfig.urls.github()}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-3 rounded-2xl bg-white/95 backdrop-blur-sm px-6 py-2.5 text-sm font-medium text-gray-700 shadow-lg ring-1 ring-gray-200/50 transition-all duration-300 hover:bg-white hover:shadow-xl hover:ring-gray-300 hover:scale-105 group sm:flex"
        >
          <GithubIcon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">Production-Ready</span>
            <div className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-emerald-500 animate-pulse"
              >
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">Code</span>
            </div>
          </div>
        </a>

        {/* Enhanced Authentication UI */}
        {loading ? (
          <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl animate-pulse shadow-sm"></div>
        ) : user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-green-100 to-blue-100 px-4 py-2.5 text-sm font-semibold text-green-800 shadow-lg ring-1 ring-green-200/50 transition-all duration-300 hover:shadow-xl hover:scale-105 hover:from-green-200 hover:to-blue-200"
            >
              {user?.image ? (
                <div className="relative">
                  <Image
                    src={user.image}
                    alt={user.name || "User"}
                    width={24}
                    height={24}
                    className="rounded-full ring-2 ring-white shadow-sm"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white" />
                </div>
              ) : (
                <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-sm">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <span className="hidden sm:block font-bold">
                {user?.name || user?.email?.split('@')[0] || 'User'}
              </span>
              <svg className="w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Enhanced User Menu Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-3 w-72 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200/50 py-3 z-50 animate-in slide-in-from-top-2 duration-200">
                {/* Enhanced User Info Section */}
                <div className="px-5 py-4 border-b border-gray-200/50">
                  <div className="flex items-center gap-4">
                    {user?.image ? (
                      <div className="relative">
                        <Image
                          src={user.image}
                          alt={user.name || "User"}
                          width={48}
                          height={48}
                          className="rounded-2xl ring-2 ring-blue-200 shadow-md"
                        />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full ring-2 ring-white" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-md">
                        <User className="w-6 h-6 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate text-lg">
                        {user?.name || "User"}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        {user?.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs text-green-600 font-medium">Online</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Menu Items with Categories */}
                <div className="py-3">
                  {/* Primary Actions */}
                  <div className="px-2 mb-3">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2">Create & Build</div>
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Plus className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">New App</div>
                        <div className="text-xs text-gray-500">Start building</div>
                      </div>
                    </Link>
                    <Link
                      href="/templates"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-purple-50 hover:text-purple-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Palette className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">Templates</div>
                        <div className="text-xs text-gray-500">Pre-built apps</div>
                      </div>
                    </Link>
                  </div>

                  {/* Management */}
                  <div className="px-2 mb-3">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2">Manage</div>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-green-50 hover:text-green-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Zap className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">Dashboard</div>
                        <div className="text-xs text-gray-500">Overview</div>
                      </div>
                    </Link>
                    <Link
                      href="/projects"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-orange-50 hover:text-orange-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Target className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">Projects</div>
                        <div className="text-xs text-gray-500">Your apps</div>
                      </div>
                    </Link>
                    <Link
                      href="/chats"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-indigo-50 hover:text-indigo-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <History className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">Chat History</div>
                        <div className="text-xs text-gray-500">AI conversations</div>
                      </div>
                    </Link>
                  </div>

                  {/* AI & Community */}
                  <div className="px-2 mb-3">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2">AI & Community</div>
                    <Link
                      href="/agents"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-cyan-50 hover:text-cyan-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">AI Agents</div>
                        <div className="text-xs text-gray-500">Smart assistants</div>
                      </div>
                    </Link>
                    <Link
                      href="/social"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-pink-50 hover:text-pink-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">Community</div>
                        <div className="text-xs text-gray-500">Connect & share</div>
                      </div>
                    </Link>
                    <Link
                      href="/discover"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-teal-50 hover:text-teal-700 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-green-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">Discover</div>
                        <div className="text-xs text-gray-500">Trending apps</div>
                      </div>
                    </Link>
                  </div>
                  
                  {/* Settings */}
                  <div className="px-2">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-2">Account</div>
                    <Link
                      href="/settings"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 rounded-xl mx-1 transition-all duration-200 hover:bg-gray-50 hover:text-gray-900 hover:translate-x-1 group"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-gray-500 to-gray-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Settings className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">Settings</div>
                        <div className="text-xs text-gray-500">Preferences</div>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Enhanced Sign Out */}
                <div className="border-t border-gray-200/50 pt-3 px-3">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 w-full text-left rounded-xl mx-1 transition-all duration-200 hover:translate-x-1 group"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <LogOut className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold">Sign Out</div>
                      <div className="text-xs text-red-500">End session</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="btn-gradient inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold transition-all duration-300 hover:scale-105"
          >
            <User className="w-4 h-4" />
            <span>Sign In</span>
          </Link>
        )}

        {/* Enhanced CLI & Extension Links */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href={brandConfig.urls.github()}
            className="flex items-center gap-2 rounded-xl bg-gray-100/80 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200/50 transition-all duration-300 hover:bg-gray-200 hover:shadow-md hover:scale-105"
          >
            <span>⚡</span>
            <span>CLI</span>
          </Link>
          <Link
            href="https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-blue-100/80 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200/50 transition-all duration-300 hover:bg-blue-200 hover:shadow-md hover:scale-105"
          >
            <span>📦</span>
            <span>VS Code</span>
          </Link>
        </div>
      </div>

    </header>
  );
}
