'use client';

/**
 * Achievements System - Complete Gamification Engine
 * KILLER FEATURE: Keep users engaged with rewards, badges, and progression
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Trophy,
  Star,
  Crown,
  Zap,
  Flame,
  Target,
  Award,
  Medal,
  Shield,
  Rocket,
  Heart,
  Code,
  Bot,
  Users,
  TrendingUp,
  Calendar,
  CheckCircle,
  Lock,
  Gift,
  Sparkles,
  Activity,
  Clock,
  ArrowRight,
  Plus
} from 'lucide-react';

interface Achievement {
  id: string;
  title: string;
  description: string;
  category: 'coding' | 'social' | 'exploration' | 'contribution' | 'milestone';
  type: 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary';
  icon: string;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedAt?: string;
  reward: {
    credits: number;
    perks: string[];
  };
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  type: 'create' | 'explore' | 'social' | 'learn';
  progress: number;
  maxProgress: number;
  completed: boolean;
  reward: {
    credits: number;
    xp: number;
  };
  expiresAt: string;
}

interface UserStats {
  level: number;
  xp: number;
  nextLevelXP: number;
  totalCredits: number;
  currentStreak: number;
  maxStreak: number;
  totalProjectsCreated: number;
  totalLikesReceived: number;
  totalFollowers: number;
  joinedAt: string;
}

export default function AchievementsSystem() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallenge[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [activeTab, setActiveTab] = useState('achievements');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showReward, setShowReward] = useState<string | null>(null);

  useEffect(() => {
    loadAchievements();
    loadDailyChallenges();
    loadUserStats();
  }, []);

  const loadAchievements = async () => {
    try {
      const response = await fetch('/api/social/achievements', {
        headers: {
          'Authorization': `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('auth_token') : 'development-token'}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      if (data.success && data.data) {
        // Transform backend data to match frontend interface
        const transformedAchievements = [
          ...data.data.unlockedAchievements.map(achievement => ({
            id: achievement.id,
            title: `${achievement.icon} ${achievement.name}`,
            description: achievement.description,
            category: 'milestone' as const,
            type: achievement.tier.toLowerCase() as 'bronze' | 'silver' | 'gold' | 'diamond',
            icon: achievement.icon,
            progress: 1,
            maxProgress: 1,
            unlocked: true,
            unlockedAt: achievement.unlockedAt,
            reward: { credits: 100, perks: [achievement.name] },
            rarity: achievement.rarity.toLowerCase() as 'common' | 'rare' | 'epic' | 'legendary'
          })),
          ...data.data.availableAchievements.map(achievement => ({
            id: achievement.id,
            title: `${achievement.icon} ${achievement.name}`,
            description: achievement.description,
            category: 'milestone' as const,
            type: achievement.tier.toLowerCase() as 'bronze' | 'silver' | 'gold' | 'diamond',
            icon: achievement.icon,
            progress: achievement.progress || 0,
            maxProgress: achievement.target || 100,
            unlocked: false,
            reward: { credits: 100, perks: [achievement.name] },
            rarity: achievement.rarity.toLowerCase() as 'common' | 'rare' | 'epic' | 'legendary'
          }))
        ];
        setAchievements(transformedAchievements);
        
        // Set user stats from backend data
        setUserStats({
          level: data.data.userLevel.level,
          xp: data.data.userLevel.xp,
          nextLevelXP: data.data.userLevel.nextLevelXp,
          totalCredits: 1000, // Placeholder
          currentStreak: data.data.streaks.current,
          maxStreak: data.data.streaks.longest,
          totalProjectsCreated: 50, // Placeholder
          totalLikesReceived: 500, // Placeholder
          totalFollowers: 100, // Placeholder
          joinedAt: '2024-01-01T00:00:00Z'
        });
      } else {
        // Fallback to mock data
        const mockAchievements: Achievement[] = [
      {
        id: '1',
        title: '🎯 First Steps',
        description: 'Create your first AI project',
        category: 'coding',
        type: 'bronze',
        icon: '🎯',
        progress: 1,
        maxProgress: 1,
        unlocked: true,
        unlockedAt: '2024-01-15T10:30:00Z',
        reward: { credits: 50, perks: ['Welcome Badge'] },
        rarity: 'common'
      },
      {
        id: '2',
        title: '🔥 Code Streak Master',
        description: 'Maintain a 7-day coding streak',
        category: 'milestone',
        type: 'gold',
        icon: '🔥',
        progress: 5,
        maxProgress: 7,
        unlocked: false,
        reward: { credits: 200, perks: ['Streak Master Badge', '10% Speed Boost'] },
        rarity: 'rare'
      },
      {
        id: '3',
        title: '👑 Community Leader',
        description: 'Get 1000 likes on your projects',
        category: 'social',
        type: 'diamond',
        icon: '👑',
        progress: 247,
        maxProgress: 1000,
        unlocked: false,
        reward: { credits: 500, perks: ['Leader Badge', 'Priority Support'] },
        rarity: 'epic'
      },
      {
        id: '4',
        title: '🤖 AI Whisperer',
        description: 'Successfully use 10 different AI models',
        category: 'exploration',
        type: 'silver',
        icon: '🤖',
        progress: 6,
        maxProgress: 10,
        unlocked: false,
        reward: { credits: 150, perks: ['AI Expert Badge'] },
        rarity: 'common'
      },
      {
        id: '5',
        title: '💫 Legendary Creator',
        description: 'Create 100 projects and receive 10,000 likes',
        category: 'milestone',
        type: 'legendary',
        icon: '💫',
        progress: 12,
        maxProgress: 100,
        unlocked: false,
        reward: { credits: 1000, perks: ['Legendary Badge', 'Unlimited API Access', 'Custom Profile'] },
        rarity: 'legendary'
      }
    ];
        setAchievements(mockAchievements);
      }
    } catch (error) {
      console.error('Failed to load achievements:', error);
      // Set empty array on error
      setAchievements([]);
    }
  };

  const loadDailyChallenges = async () => {
    const mockChallenges: DailyChallenge[] = [
      {
        id: '1',
        title: '🚀 Build Something Amazing',
        description: 'Create a new project using any AI model',
        type: 'create',
        progress: 0,
        maxProgress: 1,
        completed: false,
        reward: { credits: 25, xp: 100 },
        expiresAt: '2024-01-16T23:59:59Z'
      },
      {
        id: '2',
        title: '💝 Spread the Love',
        description: 'Like 5 community projects',
        type: 'social',
        progress: 2,
        maxProgress: 5,
        completed: false,
        reward: { credits: 15, xp: 50 },
        expiresAt: '2024-01-16T23:59:59Z'
      },
      {
        id: '3',
        title: '🔍 Explorer\'s Quest',
        description: 'Try 3 different AI models',
        type: 'explore',
        progress: 1,
        maxProgress: 3,
        completed: false,
        reward: { credits: 20, xp: 75 },
        expiresAt: '2024-01-16T23:59:59Z'
      }
    ];
    setDailyChallenges(mockChallenges);
  };

  const loadUserStats = async () => {
    const mockStats: UserStats = {
      level: 12,
      xp: 2847,
      nextLevelXP: 3200,
      totalCredits: 1250,
      currentStreak: 5,
      maxStreak: 14,
      totalProjectsCreated: 23,
      totalLikesReceived: 1247,
      totalFollowers: 89,
      joinedAt: '2023-12-01T00:00:00Z'
    };
    setUserStats(mockStats);
  };

  const claimReward = (achievementId: string) => {
    setShowReward(achievementId);
    // Update achievement status
    setAchievements(prev => prev.map(ach => 
      ach.id === achievementId 
        ? { ...ach, unlocked: true, unlockedAt: new Date().toISOString() }
        : ach
    ));
    setTimeout(() => setShowReward(null), 3000);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bronze': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'silver': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'gold': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'diamond': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'legendary': return 'bg-purple-100 text-purple-800 border-purple-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'text-gray-600';
      case 'rare': return 'text-blue-600';
      case 'epic': return 'text-purple-600';
      case 'legendary': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'coding': return <Code className="h-4 w-4" />;
      case 'social': return <Users className="h-4 w-4" />;
      case 'exploration': return <Zap className="h-4 w-4" />;
      case 'contribution': return <Heart className="h-4 w-4" />;
      case 'milestone': return <Trophy className="h-4 w-4" />;
      default: return <Star className="h-4 w-4" />;
    }
  };

  const filteredAchievements = achievements.filter(achievement => 
    selectedCategory === 'all' || achievement.category === selectedCategory
  );

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      {/* Header with User Stats */}
      {userStats && (
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Level & XP */}
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Crown className="h-8 w-8 text-yellow-500 mr-2" />
                  <span className="text-2xl font-bold">Level {userStats.level}</span>
                </div>
                <Progress value={(userStats.xp / userStats.nextLevelXP) * 100} className="mb-2" />
                <p className="text-sm text-gray-600">{userStats.xp}/{userStats.nextLevelXP} XP</p>
              </div>

              {/* Credits */}
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Sparkles className="h-8 w-8 text-purple-500 mr-2" />
                  <span className="text-2xl font-bold">{userStats.totalCredits}</span>
                </div>
                <p className="text-sm text-gray-600">Total Credits</p>
              </div>

              {/* Streak */}
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Flame className="h-8 w-8 text-orange-500 mr-2" />
                  <span className="text-2xl font-bold">{userStats.currentStreak}</span>
                </div>
                <p className="text-sm text-gray-600">Day Streak (Max: {userStats.maxStreak})</p>
              </div>

              {/* Community Stats */}
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Users className="h-8 w-8 text-green-500 mr-2" />
                  <span className="text-2xl font-bold">{userStats.totalFollowers}</span>
                </div>
                <p className="text-sm text-gray-600">Followers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="achievements" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Achievements
          </TabsTrigger>
          <TabsTrigger value="challenges" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Daily Challenges
          </TabsTrigger>
          <TabsTrigger value="rewards" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Rewards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="achievements" className="mt-6">
          {/* Category Filters */}
          <div className="flex flex-wrap gap-2 mb-6">
            {['all', 'coding', 'social', 'exploration', 'contribution', 'milestone'].map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="capitalize"
              >
                {category !== 'all' && getCategoryIcon(category)}
                <span className={category !== 'all' ? 'ml-1' : ''}>{category}</span>
              </Button>
            ))}
          </div>

          {/* Achievements Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAchievements.map((achievement) => (
              <Card 
                key={achievement.id} 
                className={`relative transition-all duration-300 hover:shadow-lg ${
                  achievement.unlocked ? 'border-green-300' : ''
                } ${!achievement.unlocked && achievement.progress >= achievement.maxProgress ? 'border-yellow-300 shadow-yellow-100' : ''}`}
              >
                <CardContent className="p-6">
                  {/* Achievement Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{achievement.icon}</div>
                      <div>
                        <Badge className={getTypeColor(achievement.type)}>
                          {achievement.type.toUpperCase()}
                        </Badge>
                        <div className={`text-xs mt-1 ${getRarityColor(achievement.rarity)}`}>
                          {achievement.rarity.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    {achievement.unlocked && <CheckCircle className="h-6 w-6 text-green-500" />}
                    {!achievement.unlocked && achievement.progress < achievement.maxProgress && <Lock className="h-6 w-6 text-gray-400" />}
                  </div>

                  {/* Achievement Info */}
                  <h3 className="font-semibold text-lg mb-2">{achievement.title}</h3>
                  <p className="text-sm text-gray-600 mb-4">{achievement.description}</p>

                  {/* Progress */}
                  {!achievement.unlocked && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{achievement.progress}/{achievement.maxProgress}</span>
                      </div>
                      <Progress value={(achievement.progress / achievement.maxProgress) * 100} />
                    </div>
                  )}

                  {/* Rewards */}
                  <div className="space-y-2 mb-4">
                    <h4 className="text-sm font-medium">Rewards:</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        {achievement.reward.credits} Credits
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {achievement.reward.perks.map((perk, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {perk}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Action Button */}
                  {achievement.unlocked ? (
                    <Button disabled className="w-full" variant="outline">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Unlocked
                    </Button>
                  ) : achievement.progress >= achievement.maxProgress ? (
                    <Button 
                      className="w-full bg-gradient-to-r from-yellow-500 to-orange-500"
                      onClick={() => claimReward(achievement.id)}
                    >
                      <Gift className="h-4 w-4 mr-2" />
                      Claim Reward!
                    </Button>
                  ) : (
                    <Button disabled className="w-full" variant="outline">
                      <Lock className="h-4 w-4 mr-2" />
                      Locked
                    </Button>
                  )}

                  {/* Unlocked Date */}
                  {achievement.unlocked && achievement.unlockedAt && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>

                {/* Reward Animation */}
                {showReward === achievement.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-400 opacity-20 animate-pulse rounded-lg"></div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="challenges" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dailyChallenges.map((challenge) => (
              <Card key={challenge.id} className="hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">{challenge.title}</h3>
                    {challenge.completed ? (
                      <CheckCircle className="h-6 w-6 text-green-500" />
                    ) : (
                      <Clock className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-4">{challenge.description}</p>
                  
                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Progress</span>
                      <span>{challenge.progress}/{challenge.maxProgress}</span>
                    </div>
                    <Progress value={(challenge.progress / challenge.maxProgress) * 100} />
                  </div>
                  
                  {/* Rewards */}
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        {challenge.reward.credits} Credits
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        {challenge.reward.xp} XP
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Time Remaining */}
                  <p className="text-xs text-gray-500 text-center">
                    Expires: {new Date(challenge.expiresAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rewards" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Credit Store */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Credit Store
                </CardTitle>
                <CardDescription>Spend your credits on amazing perks and boosts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { item: 'Speed Boost (24h)', cost: 50, description: '2x faster generation' },
                    { item: 'Priority Queue', cost: 100, description: 'Skip the line' },
                    { item: 'Advanced Models', cost: 200, description: 'Access premium AI models' },
                    { item: 'Custom Profile', cost: 500, description: 'Personalize your profile' }
                  ].map((reward, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{reward.item}</h4>
                        <p className="text-sm text-gray-600">{reward.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{reward.cost} Credits</Badge>
                        <Button size="sm">Buy</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Leaderboards */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Leaderboards
                </CardTitle>
                <CardDescription>See how you rank against other creators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { rank: 1, name: 'CodeMaster', score: '15,234 XP', badge: '👑' },
                    { rank: 2, name: 'AIGuru', score: '12,891 XP', badge: '🥈' },
                    { rank: 3, name: 'DevPro', score: '11,567 XP', badge: '🥉' },
                    { rank: 15, name: 'You', score: '2,847 XP', badge: '🎯' }
                  ].map((player, index) => (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${player.name === 'You' ? 'bg-blue-50 border-2 border-blue-300' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{player.badge}</span>
                        <div>
                          <h4 className="font-medium">{player.name}</h4>
                          <p className="text-sm text-gray-600">#{player.rank}</p>
                        </div>
                      </div>
                      <span className="font-medium">{player.score}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}