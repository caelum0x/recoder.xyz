'use client';

/**
 * Leaderboards - Competitive Social Rankings
 * KILLER FEATURE: Drive engagement through friendly competition and recognition
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Trophy,
  Crown,
  Medal,
  Star,
  TrendingUp,
  Users,
  Code,
  Heart,
  Zap,
  Flame,
  Target,
  Award,
  Calendar,
  Clock,
  ArrowUp,
  ArrowDown,
  Minus,
  ExternalLink,
  User,
  Bot,
  Rocket,
  Activity
} from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  prevRank?: number;
  user: {
    id: string;
    name: string;
    avatar: string;
    verified: boolean;
    title?: string;
  };
  score: number;
  change: 'up' | 'down' | 'same' | 'new';
  changeAmount?: number;
  details: any;
}

interface LeaderboardData {
  period: 'daily' | 'weekly' | 'monthly' | 'allTime';
  category: string;
  entries: LeaderboardEntry[];
  userRank?: number;
  totalParticipants: number;
}

export default function Leaderboards() {
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardData>>({});
  const [activeCategory, setActiveCategory] = useState('overall');
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly' | 'monthly' | 'allTime'>('weekly');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboards();
  }, [activePeriod]);

  const loadLeaderboards = async () => {
    setLoading(true);
    
    try {
      const response = await fetch(`/api/social/leaderboard?category=${activeCategory}&timeframe=${activePeriod}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'development-token'}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      if (data.success && data.data) {
        // Transform backend data to match frontend interface
        const transformedData: Record<string, LeaderboardData> = {
          [activeCategory]: {
            period: activePeriod,
            category: activeCategory,
            totalParticipants: data.data.metadata.totalParticipants,
            userRank: data.data.leaderboard.find((entry, index) => entry.user.id === 'current-user')?.rank || undefined,
            entries: data.data.leaderboard.map(entry => ({
              rank: entry.rank,
              prevRank: entry.rank,
              user: {
                id: entry.user.id,
                name: entry.user.name,
                avatar: entry.user.avatar || entry.user.name.substring(0, 2).toUpperCase(),
                verified: entry.user.verified,
                title: entry.user.tier
              },
              score: entry.score,
              change: entry.trend as 'up' | 'down' | 'same',
              changeAmount: parseInt(entry.change?.replace(/[^0-9]/g, '') || '0'),
              details: entry.metrics
            }))
          }
        };
        setLeaderboards(transformedData);
      } else {
        // Fallback to mock data
        const mockData: Record<string, LeaderboardData> = {
      overall: {
        period: activePeriod,
        category: 'overall',
        totalParticipants: 15847,
        userRank: 342,
        entries: [
          {
            rank: 1,
            prevRank: 1,
            user: { id: '1', name: 'CodeMaster', avatar: 'CM', verified: true, title: 'Legendary Creator' },
            score: 15234,
            change: 'same',
            details: { projects: 156, likes: 12400, followers: 2340 }
          },
          {
            rank: 2,
            prevRank: 3,
            user: { id: '2', name: 'AIGuru', avatar: 'AG', verified: true, title: 'AI Whisperer' },
            score: 12891,
            change: 'up',
            changeAmount: 1,
            details: { projects: 134, likes: 10200, followers: 1890 }
          },
          {
            rank: 3,
            prevRank: 2,
            user: { id: '3', name: 'DevPro', avatar: 'DP', verified: false, title: 'Rising Star' },
            score: 11567,
            change: 'down',
            changeAmount: 1,
            details: { projects: 98, likes: 8900, followers: 1560 }
          },
          {
            rank: 4,
            prevRank: 5,
            user: { id: '4', name: 'TechNinja', avatar: 'TN', verified: true, title: 'Innovation Expert' },
            score: 10234,
            change: 'up',
            changeAmount: 1,
            details: { projects: 87, likes: 7800, followers: 1340 }
          },
          {
            rank: 5,
            user: { id: '5', name: 'CodeWizard', avatar: 'CW', verified: false, title: 'Magic Maker' },
            score: 9876,
            change: 'new',
            details: { projects: 76, likes: 6900, followers: 1120 }
          }
        ]
      },
      
      projects: {
        period: activePeriod,
        category: 'projects',
        totalParticipants: 12345,
        userRank: 156,
        entries: [
          {
            rank: 1,
            user: { id: '1', name: 'BuildMaster', avatar: 'BM', verified: true },
            score: 234,
            change: 'same',
            details: { projectsThisPeriod: 23, avgLikes: 89, successRate: 98 }
          },
          {
            rank: 2,
            user: { id: '2', name: 'AppCreator', avatar: 'AC', verified: true },
            score: 198,
            change: 'up',
            changeAmount: 2,
            details: { projectsThisPeriod: 19, avgLikes: 76, successRate: 95 }
          },
          {
            rank: 3,
            user: { id: '3', name: 'WebDev', avatar: 'WD', verified: false },
            score: 187,
            change: 'down',
            changeAmount: 1,
            details: { projectsThisPeriod: 18, avgLikes: 65, successRate: 92 }
          }
        ]
      },

      social: {
        period: activePeriod,
        category: 'social',
        totalParticipants: 18234,
        userRank: 89,
        entries: [
          {
            rank: 1,
            user: { id: '1', name: 'SocialStar', avatar: 'SS', verified: true },
            score: 45678,
            change: 'same',
            details: { likesReceived: 15600, commentsReceived: 2340, shares: 890 }
          },
          {
            rank: 2,
            user: { id: '2', name: 'CommunityLead', avatar: 'CL', verified: true },
            score: 38912,
            change: 'up',
            changeAmount: 1,
            details: { likesReceived: 12800, commentsReceived: 1980, shares: 720 }
          },
          {
            rank: 3,
            user: { id: '3', name: 'Influencer', avatar: 'IF', verified: true },
            score: 35467,
            change: 'down',
            changeAmount: 1,
            details: { likesReceived: 11200, commentsReceived: 1650, shares: 610 }
          }
        ]
      },

      streaks: {
        period: activePeriod,
        category: 'streaks',
        totalParticipants: 8967,
        userRank: 45,
        entries: [
          {
            rank: 1,
            user: { id: '1', name: 'StreakLegend', avatar: 'SL', verified: true },
            score: 127,
            change: 'same',
            details: { currentStreak: 127, maxStreak: 145, totalDays: 298 }
          },
          {
            rank: 2,
            user: { id: '2', name: 'DailyCodr', avatar: 'DC', verified: false },
            score: 89,
            change: 'up',
            changeAmount: 3,
            details: { currentStreak: 89, maxStreak: 92, totalDays: 267 }
          },
          {
            rank: 3,
            user: { id: '3', name: 'ConsistentDev', avatar: 'CD', verified: true },
            score: 76,
            change: 'down',
            changeAmount: 1,
            details: { currentStreak: 76, maxStreak: 89, totalDays: 234 }
          }
        ]
      }
    };

        setLeaderboards(mockData);
      }
    } catch (error) {
      console.error('Failed to load leaderboards:', error);
      // Set empty object on error
      setLeaderboards({});
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="h-6 w-6 text-yellow-500" />;
      case 2: return <Medal className="h-6 w-6 text-gray-400" />;
      case 3: return <Award className="h-6 w-6 text-amber-600" />;
      default: return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-gray-600">#{rank}</span>;
    }
  };

  const getChangeIcon = (change: string, amount?: number) => {
    switch (change) {
      case 'up': return <ArrowUp className="h-4 w-4 text-green-500" />;
      case 'down': return <ArrowDown className="h-4 w-4 text-red-500" />;
      case 'same': return <Minus className="h-4 w-4 text-gray-500" />;
      case 'new': return <Star className="h-4 w-4 text-blue-500" />;
      default: return null;
    }
  };

  const getChangeText = (change: string, amount?: number) => {
    switch (change) {
      case 'up': return `+${amount}`;
      case 'down': return `-${amount}`;
      case 'same': return '─';
      case 'new': return 'NEW';
      default: return '';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'overall': return <Trophy className="h-5 w-5" />;
      case 'projects': return <Code className="h-5 w-5" />;
      case 'social': return <Heart className="h-5 w-5" />;
      case 'streaks': return <Flame className="h-5 w-5" />;
      case 'models': return <Bot className="h-5 w-5" />;
      default: return <Activity className="h-5 w-5" />;
    }
  };

  const currentLeaderboard = leaderboards[activeCategory];

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          🏆 Community Leaderboards
        </h1>
        <p className="text-gray-600 mb-6">
          Compete with the best creators and climb the ranks!
        </p>
        
        {/* Period Selector */}
        <div className="flex justify-center gap-2 mb-6">
          {(['daily', 'weekly', 'monthly', 'allTime'] as const).map((period) => (
            <Button
              key={period}
              variant={activePeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActivePeriod(period)}
              className="capitalize"
            >
              {period === 'allTime' ? 'All Time' : period}
            </Button>
          ))}
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overall" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Overall
          </TabsTrigger>
          <TabsTrigger value="projects" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="social" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Social
          </TabsTrigger>
          <TabsTrigger value="streaks" className="flex items-center gap-2">
            <Flame className="h-4 w-4" />
            Streaks
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Models
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeCategory} className="mt-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Leaderboard */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {getCategoryIcon(activeCategory)}
                      {activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} Leaderboard
                    </CardTitle>
                    <Badge variant="outline">
                      {currentLeaderboard?.totalParticipants?.toLocaleString()} participants
                    </Badge>
                  </div>
                  <CardDescription>
                    Top performers for {activePeriod === 'allTime' ? 'all time' : `this ${activePeriod.slice(0, -2)}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="animate-pulse flex items-center gap-4 p-3">
                          <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-gray-200 rounded mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          </div>
                          <div className="h-6 w-16 bg-gray-200 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {currentLeaderboard?.entries.map((entry, index) => (
                        <div
                          key={entry.user.id}
                          className={`flex items-center gap-4 p-4 rounded-lg transition-all hover:bg-gray-50 ${
                            index < 3 ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200' : ''
                          }`}
                        >
                          {/* Rank */}
                          <div className="flex items-center gap-2">
                            {getRankIcon(entry.rank)}
                            <div className="flex items-center gap-1">
                              {getChangeIcon(entry.change, entry.changeAmount)}
                              <span className="text-xs text-gray-500">
                                {getChangeText(entry.change, entry.changeAmount)}
                              </span>
                            </div>
                          </div>

                          {/* User Info */}
                          <div className="flex items-center gap-3 flex-1">
                            <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                              {entry.user.avatar}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{entry.user.name}</span>
                                {entry.user.verified && <Badge variant="secondary" className="text-xs">✓</Badge>}
                              </div>
                              {entry.user.title && (
                                <p className="text-xs text-gray-600">{entry.user.title}</p>
                              )}
                            </div>
                          </div>

                          {/* Score */}
                          <div className="text-right">
                            <div className="font-bold text-lg">{entry.score.toLocaleString()}</div>
                            <div className="text-xs text-gray-500">
                              {activeCategory === 'overall' && 'XP'}
                              {activeCategory === 'projects' && 'Projects'}
                              {activeCategory === 'social' && 'Likes'}
                              {activeCategory === 'streaks' && 'Days'}
                            </div>
                          </div>

                          {/* Action */}
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Your Rank */}
              {currentLeaderboard?.userRank && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Your Rank</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600 mb-2">
                        #{currentLeaderboard.userRank}
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        out of {currentLeaderboard.totalParticipants.toLocaleString()} participants
                      </p>
                      <Progress 
                        value={(1 - (currentLeaderboard.userRank / currentLeaderboard.totalParticipants)) * 100} 
                        className="mb-2"
                      />
                      <p className="text-xs text-gray-500">
                        Top {Math.round((currentLeaderboard.userRank / currentLeaderboard.totalParticipants) * 100)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Categories Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { category: 'Projects Created', value: 23, icon: <Code className="h-4 w-4" /> },
                      { category: 'Likes Received', value: 1247, icon: <Heart className="h-4 w-4" /> },
                      { category: 'Current Streak', value: 5, icon: <Flame className="h-4 w-4" /> },
                      { category: 'Followers', value: 89, icon: <Users className="h-4 w-4" /> }
                    ].map((stat, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {stat.icon}
                          <span className="text-sm">{stat.category}</span>
                        </div>
                        <span className="font-medium">{stat.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Seasonal Events */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Seasonal Events
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg">
                      <h4 className="font-medium text-sm mb-1">🎃 Halloween Code Challenge</h4>
                      <p className="text-xs text-gray-600 mb-2">Build the spookiest AI project!</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">5 days left</Badge>
                        <Button size="sm" variant="outline">Join</Button>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-lg">
                      <h4 className="font-medium text-sm mb-1">❄️ Winter Sprint</h4>
                      <p className="text-xs text-gray-600 mb-2">Code every day in December!</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">25 days left</Badge>
                        <Button size="sm" variant="outline">Join</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}