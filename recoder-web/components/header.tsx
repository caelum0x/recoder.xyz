'use client';

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { User, Settings, LogOut, Plus, History, Zap, Palette } from "lucide-react";

import GithubIcon from "@/components/icons/github-icon";
import { getBrandConfig } from "@/lib/recoder-config";

const brandConfig = getBrandConfig();

export default function Header() {
  const { data: session, status } = useSession();
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
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
    setShowUserMenu(false);
  };

  return (
    <header className="relative mx-auto flex w-full shrink-0 items-center justify-center py-6">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/recoder-logo.svg"
          alt={brandConfig.fullName}
          width={200}
          height={48}
          className="h-9 w-auto object-contain"
          priority
        />
      </Link>

      <div className="absolute right-3 flex items-center gap-3">
        {/* Multi-AI Indicator */}
        <div className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200/50 lg:flex">
          <div className="flex -space-x-1">
            <div className="h-3 w-3 rounded-full bg-blue-500 ring-1 ring-white" title="Claude" />
            <div className="h-3 w-3 rounded-full bg-purple-500 ring-1 ring-white" title="Groq" />
            <div className="h-3 w-3 rounded-full bg-green-500 ring-1 ring-white" title="Gemini" />
            <div className="h-3 w-3 rounded-full bg-orange-500 ring-1 ring-white" title="Ollama" />
          </div>
          <span>Multi-AI</span>
        </div>

        {/* GitHub Link */}
        <a
          href={brandConfig.urls.github()}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto hidden items-center gap-3 rounded-full bg-white/95 px-5 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-100 transition-all hover:bg-white hover:shadow-md hover:ring-gray-200 sm:flex"
        >
          <GithubIcon className="h-[18px] w-[18px]" />
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900">Production-Ready</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-emerald-500"
            >
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Code</span>
          </div>
        </a>

        {/* Authentication UI */}
        {status === "loading" ? (
          <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
        ) : session ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-200"
            >
              {session.user?.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  width={20}
                  height={20}
                  className="rounded-full"
                />
              ) : (
                <User className="w-4 h-4" />
              )}
              <span className="hidden sm:block">
                {session.user?.name || session.user?.email?.split('@')[0] || 'User'}
              </span>
            </button>
            
            {/* User menu dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                {/* User Info */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    {session.user?.image ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name || "User"}
                        width={40}
                        height={40}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {session.user?.name || "User"}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        {session.user?.email}
                      </p>
                      {session.user?.username && (
                        <p className="text-xs text-gray-500">
                          @{session.user.username}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-2">
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Plus className="w-4 h-4" />
                    New Chat
                  </Link>
                  <Link
                    href="/chats"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <History className="w-4 h-4" />
                    Chat History
                  </Link>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Zap className="w-4 h-4" />
                    Dashboard
                  </Link>
                  <Link
                    href="/templates"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Palette className="w-4 h-4" />
                    Templates
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                </div>

                {/* Sign Out */}
                <div className="border-t border-gray-100 pt-2">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => signIn()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Sign In
          </button>
        )}

        {/* CLI & Extension Links */}
        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href={brandConfig.urls.github()}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            CLI
          </Link>
          <Link
            href="https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-200"
          >
            VS Code
          </Link>
        </div>
      </div>

    </header>
  );
}
