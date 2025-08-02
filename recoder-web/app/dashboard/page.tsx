"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { redirect } from "next/navigation";
import { getUserChats, getUserStats } from "@/app/(main)/actions";
import Link from "next/link";
import Image from "next/image";
import {
  User, History, Settings, Zap, TrendingUp, Calendar,
  MessageSquare, Code, Database, Deploy, ChevronRight,
  Activity, Clock, Sparkles, Target
} from "lucide-react";

interface UserStats {
  generationsToday: number;
  generationsTotal: number;
  tokensUsed: number;
  favoriteModel: string;
  averageQuality: string;
  deploymentsCount: number;
  chatsCount: number;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<UserStats>({
    generationsToday: 0,
    generationsTotal: 0,
    tokensUsed: 0,
    favoriteModel: "claude-3-5-sonnet-20241022",
    averageQuality: "high",
    deploymentsCount: 0,
    chatsCount: 0,
  });
  const [recentChats, setRecentChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/auth/signin");
    }
  }, [status]);

  useEffect(() => {
    if (session?.user) {
      fetchUserStats();
      fetchRecentChats();
    }
  }, [session]);

  const fetchUserStats = async () => {
    try {
      const userStats = await getUserStats();
      setStats(userStats);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch user stats:", error);
      setIsLoading(false);
    }
  };

  const fetchRecentChats = async () => {
    try {
      const userChats = await getUserChats(5);
      setRecentChats(userChats as any);
    } catch (error) {
      console.error("Failed to fetch recent chats:", error);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                ← Back to Recoder
              </Link>
              <div className="w-px h-6 bg-gray-300" />
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            </div>
            
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
              <div>
                <p className="font-medium text-gray-900">{session.user?.name}</p>
                <p className="text-sm text-gray-600">{session.user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome back, {session.user?.name?.split(' ')[0] || 'User'}! 👋
          </h2>
          <p className="text-gray-600">
            Here's an overview of your AI-powered development activity.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Today's Generations</p>
                <p className="text-3xl font-bold text-gray-900">{stats.generationsToday}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Generations</p>
                <p className="text-3xl font-bold text-gray-900">{stats.generationsTotal}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tokens Used</p>
                <p className="text-3xl font-bold text-gray-900">{stats.tokensUsed.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Deployments</p>
                <p className="text-3xl font-bold text-gray-900">{stats.deploymentsCount}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Deploy className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Recent Chats</h3>
                <Link 
                  href="/chats"
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View all
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <div className="p-6">
              {recentChats.length > 0 ? (
                <div className="space-y-4">
                  {recentChats.map((chat: any) => (
                    <div key={chat.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{chat.title}</p>
                          <p className="text-sm text-gray-600">{chat.model}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {new Date(chat.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No recent chats</p>
                  <Link 
                    href="/"
                    className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block"
                  >
                    Start your first chat
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <Link
                  href="/"
                  className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                    <Code className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-900">New Chat</span>
                  <span className="text-sm text-gray-600">Start coding</span>
                </Link>

                <Link
                  href="/chats"
                  className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors"
                >
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                    <History className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="font-medium text-gray-900">Chat History</span>
                  <span className="text-sm text-gray-600">View past work</span>
                </Link>

                <Link
                  href="/settings"
                  className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                    <Settings className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="font-medium text-gray-900">Settings</span>
                  <span className="text-sm text-gray-600">Customize</span>
                </Link>

                <div className="flex flex-col items-center p-4 border border-gray-200 rounded-lg opacity-50">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                    <Target className="w-6 h-6 text-gray-400" />
                  </div>
                  <span className="font-medium text-gray-500">Templates</span>
                  <span className="text-sm text-gray-400">Coming soon</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Models Usage */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Your AI Models</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🤖</span>
                </div>
                <h4 className="font-medium text-gray-900">Favorite Model</h4>
                <p className="text-sm text-gray-600 mt-1">Claude 3.5 Sonnet</p>
                <p className="text-xs text-gray-500">Best for complex tasks</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">⚡</span>
                </div>
                <h4 className="font-medium text-gray-900">Speed Champion</h4>
                <p className="text-sm text-gray-600 mt-1">Groq Llama 3.1</p>
                <p className="text-xs text-gray-500">Ultra-fast generation</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🎯</span>
                </div>
                <h4 className="font-medium text-gray-900">Quality Level</h4>
                <p className="text-sm text-gray-600 mt-1">High Quality</p>
                <p className="text-xs text-gray-500">Production-ready code</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const runtime = "edge";