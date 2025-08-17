'use client';

/**
 * Social Dashboard - Main Social Engagement Hub
 * KILLER FEATURE: Central command center for all social and gamification features
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SocialFeed from '@/components/social-feed';
import AchievementsSystem from '@/components/gamification/achievements-system';
import NotificationSystem from '@/components/gamification/notification-system';
import Leaderboards from '@/components/gamification/leaderboards';
import { 
  Activity,
  Trophy,
  Bell,
  TrendingUp,
  Users,
  Heart,
  Code,
  Bot,
  Rocket,
  Star,
  Flame,
  Target,
  Crown,
  Zap,
  Gift,
  Calendar,
  ArrowRight,
  ExternalLink,
  Plus,
  Play
} from 'lucide-react';

export default function SocialDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Mock user data
  const userStats = {
    level: 12,
    xp: 2847,
    nextLevelXP: 3200,
    credits: 1250,
    streak: 5,
    projects: 23,
    followers: 89,
    following: 156,
    totalLikes: 1247
  };

  const quickStats = [
    { label: 'Projects Created', value: userStats.projects, icon: <Code className="h-5 w-5" />, color: 'text-blue-600' },
    { label: 'Total Likes', value: userStats.totalLikes, icon: <Heart className="h-5 w-5" />, color: 'text-red-600' },
    { label: 'Current Streak', value: userStats.streak, icon: <Flame className="h-5 w-5" />, color: 'text-orange-600' },
    { label: 'Followers', value: userStats.followers, icon: <Users className="h-5 w-5" />, color: 'text-green-600' }
  ];

  const recentAchievements = [
    { id: 1, title: 'Code Streak Master', description: '7 days in a row!', icon: '🔥', unlocked: true },
    { id: 2, title: 'Community Favorite', description: '100 likes received', icon: '❤️', unlocked: true },
    { id: 3, title: 'AI Explorer', description: 'Tried 5 different models', icon: '🤖', unlocked: true }
  ];

  const dailyChallenges = [
    { id: 1, title: 'Build Something Amazing', progress: 0, max: 1, reward: 25 },
    { id: 2, title: 'Spread the Love', progress: 2, max: 5, reward: 15 },
    { id: 3, title: 'Explorer\'s Quest', progress: 1, max: 3, reward: 20 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🎯 Your AI Development Hub
            </h1>
            <p className="text-gray-600">
              Track your progress, engage with the community, and unlock achievements
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <NotificationSystem />
            <Button className="bg-gradient-to-r from-blue-500 to-purple-500">
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {quickStats.map((stat, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
                  </div>
                  <div className={stat.color}>
                    {stat.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Level Progress */}
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Crown className="h-8 w-8 text-yellow-500" />
                  <div>
                    <h3 className="text-xl font-bold">Level {userStats.level}</h3>
                    <p className="text-sm text-gray-600">{userStats.xp}/{userStats.nextLevelXP} XP</p>
                  </div>
                </div>
                <div className="w-64 bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${(userStats.xp / userStats.nextLevelXP) * 100}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Zap className="h-4 w-4" />
                  {userStats.credits} Credits
                </Badge>
                <Button variant="outline" size="sm">
                  <Gift className="h-4 w-4 mr-2" />
                  Shop
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="feed" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Community Feed
            </TabsTrigger>
            <TabsTrigger value="achievements" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Achievements
            </TabsTrigger>
            <TabsTrigger value="leaderboards" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              Leaderboards
            </TabsTrigger>
            <TabsTrigger value="challenges" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Challenges
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-8">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Recent Activity */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Recent Activity
                    </CardTitle>
                    <CardDescription>Your latest achievements and community interactions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { type: 'achievement', text: 'Unlocked "Code Streak Master" achievement', time: '2 hours ago', icon: '🏆' },
                        { type: 'social', text: 'Received 15 likes on "AI E-commerce Platform"', time: '4 hours ago', icon: '❤️' },
                        { type: 'project', text: 'Created "Blockchain Voting System"', time: '1 day ago', icon: '🚀' },
                        { type: 'social', text: 'AIExplorer started following you', time: '2 days ago', icon: '👥' }
                      ].map((activity, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg">
                          <span className="text-2xl">{activity.icon}</span>
                          <div className="flex-1">
                            <p className="text-sm">{activity.text}</p>
                            <p className="text-xs text-gray-500">{activity.time}</p>
                          </div>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Recent Achievements */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Trophy className="h-5 w-5" />
                      Recent Achievements
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recentAchievements.map((achievement) => (
                        <div key={achievement.id} className="flex items-center gap-3 p-2 bg-yellow-50 rounded-lg">
                          <span className="text-2xl">{achievement.icon}</span>
                          <div>
                            <h4 className="font-medium text-sm">{achievement.title}</h4>
                            <p className="text-xs text-gray-600">{achievement.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" className="w-full mt-4" size="sm">
                      View All Achievements
                    </Button>
                  </CardContent>
                </Card>

                {/* Daily Challenges */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Target className="h-5 w-5" />
                      Daily Challenges
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {dailyChallenges.map((challenge) => (
                        <div key={challenge.id} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-sm">{challenge.title}</h4>
                            <Badge variant="outline" className="text-xs">
                              {challenge.reward} credits
                            </Badge>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${(challenge.progress / challenge.max) * 100}%` }}
                            ></div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {challenge.progress}/{challenge.max}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="feed" className="mt-8">
            <SocialFeed type="home" showHeader={true} />
          </TabsContent>

          <TabsContent value="achievements" className="mt-8">
            <AchievementsSystem />
          </TabsContent>

          <TabsContent value="leaderboards" className="mt-8">
            <Leaderboards />
          </TabsContent>

          <TabsContent value="challenges" className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Daily & Weekly Challenges
                </CardTitle>
                <CardDescription>Complete challenges to earn XP, credits, and exclusive rewards</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Daily Challenges */}
                  <div>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Daily Challenges
                    </h3>
                    <div className="space-y-4">
                      {dailyChallenges.map((challenge) => (
                        <Card key={challenge.id}>
                          <CardContent className="p-4">
                            <h4 className="font-medium mb-2">{challenge.title}</h4>
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                              <div 
                                className="bg-green-500 h-2 rounded-full"
                                style={{ width: `${(challenge.progress / challenge.max) * 100}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">
                                {challenge.progress}/{challenge.max}
                              </span>
                              <Badge variant="outline">
                                {challenge.reward} credits
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Weekly Challenges */}
                  <div>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Flame className="h-4 w-4" />
                      Weekly Challenges
                    </h3>
                    <div className="space-y-4">
                      {[
                        { title: 'Create 3 AI Projects', progress: 1, max: 3, reward: 100 },
                        { title: 'Get 50 Total Likes', progress: 23, max: 50, reward: 75 },
                        { title: 'Try 5 Different Models', progress: 3, max: 5, reward: 50 }
                      ].map((challenge, index) => (
                        <Card key={index}>
                          <CardContent className="p-4">
                            <h4 className="font-medium mb-2">{challenge.title}</h4>
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                              <div 
                                className="bg-purple-500 h-2 rounded-full"
                                style={{ width: `${(challenge.progress / challenge.max) * 100}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">
                                {challenge.progress}/{challenge.max}
                              </span>
                              <Badge variant="outline">
                                {challenge.reward} credits
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}