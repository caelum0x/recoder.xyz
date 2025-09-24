'use client'

import { useState } from 'react'
import { 
  TrophyIcon, 
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarDaysIcon,
  FunnelIcon
} from '@heroicons/react/24/outline'

interface MatchmakingStatsProps {
  stats: any
  onRefresh: () => void
}

export default function MatchmakingStats({ stats, onRefresh }: MatchmakingStatsProps) {
  const [timeFilter, setTimeFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    await onRefresh()
    setLoading(false)
  }

  const getSkillRank = (skill: number) => {
    if (skill < 800) return { rank: 'Bronze', color: 'text-orange-600 bg-orange-100', tier: 'I' }
    if (skill < 1000) return { rank: 'Silver', color: 'text-gray-600 bg-gray-100', tier: 'I' }
    if (skill < 1200) return { rank: 'Gold', color: 'text-yellow-600 bg-yellow-100', tier: 'I' }
    if (skill < 1600) return { rank: 'Platinum', color: 'text-blue-600 bg-blue-100', tier: 'I' }
    if (skill < 2000) return { rank: 'Diamond', color: 'text-purple-600 bg-purple-100', tier: 'I' }
    return { rank: 'Master', color: 'text-indigo-600 bg-indigo-100', tier: 'I' }
  }

  const getPerformanceTrend = (current: number, previous: number) => {
    if (current > previous) {
      return {
        icon: ArrowTrendingUpIcon,
        color: 'text-green-600',
        text: 'Improving',
        change: `+${((current - previous) / previous * 100).toFixed(1)}%`
      }
    } else if (current < previous) {
      return {
        icon: ArrowTrendingDownIcon,
        color: 'text-red-600',
        text: 'Declining',
        change: `-${((previous - current) / previous * 100).toFixed(1)}%`
      }
    }
    return {
      icon: null,
      color: 'text-gray-600',
      text: 'Stable',
      change: '0%'
    }
  }

  if (!stats) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="h-6 bg-gray-200 rounded mb-4" />
              <div className="h-8 bg-gray-200 rounded mb-2" />
              <div className="h-4 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const skillRank = getSkillRank(stats.currentSkill)
  // Mock previous skill for trend calculation
  const previousSkill = stats.currentSkill - Math.floor(Math.random() * 100) + 50
  const skillTrend = getPerformanceTrend(stats.currentSkill, previousSkill)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Performance Statistics</h3>
          <p className="text-sm text-gray-600">Detailed analysis of your matchmaking performance</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Time</option>
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="season">This Season</option>
          </select>
          
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mr-2" />
            ) : (
              <ArrowTrendingUpIcon className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Updating...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Key Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Skill Rating */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <TrophyIcon className="h-5 w-5 text-gray-400 mr-2" />
              <span className="text-sm font-medium text-gray-600">Skill Rating</span>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${skillRank.color}`}>
              {skillRank.rank} {skillRank.tier}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-gray-900">{stats.currentSkill}</span>
            <div className="flex items-center">
              {skillTrend.icon && (
                <skillTrend.icon className={`h-4 w-4 mr-1 ${skillTrend.color}`} />
              )}
              <span className={`text-sm font-medium ${skillTrend.color}`}>
                {skillTrend.change}
              </span>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-gray-500">
            {skillTrend.text} performance trend
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <ChartBarIcon className="h-5 w-5 text-gray-400 mr-2" />
            <span className="text-sm font-medium text-gray-600">Win Rate</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-green-600">{stats.winRate}%</span>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{stats.wonMatches} Wins</div>
              <div className="text-xs text-gray-500">{stats.totalMatches} Total</div>
            </div>
          </div>
          
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Win Progress</span>
              <span>{stats.wonMatches}/{stats.totalMatches}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full" 
                style={{ width: `${stats.winRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* K/D Ratio */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <UserGroupIcon className="h-5 w-5 text-gray-400 mr-2" />
            <span className="text-sm font-medium text-gray-600">K/D Ratio</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-blue-600">{stats.kdr}</span>
            <div className="text-right">
              <div className="text-sm font-medium text-green-600">{stats.totalKills} K</div>
              <div className="text-sm font-medium text-red-600">{stats.totalDeaths} D</div>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-gray-500">
            {stats.totalKills + stats.totalDeaths} total eliminations
          </div>
        </div>

        {/* Activity */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <ClockIcon className="h-5 w-5 text-gray-400 mr-2" />
            <span className="text-sm font-medium text-gray-600">Activity</span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Matches</span>
              <span className="text-sm font-medium text-gray-900">{stats.totalMatches}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">This Week</span>
              <span className="text-sm font-medium text-gray-900">{stats.matchesThisWeek || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Avg Duration</span>
              <span className="text-sm font-medium text-gray-900">
                {stats.averageMatchDuration || 0}min
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Chart Placeholder */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-lg font-medium text-gray-900 flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2" />
            Performance Over Time
          </h4>
          
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <FunnelIcon className="h-4 w-4" />
            <span>Skill Rating Trend</span>
          </div>
        </div>
        
        {/* Mock Chart */}
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h5 className="text-lg font-medium text-gray-900 mb-2">Performance Chart</h5>
            <p className="text-gray-600 mb-4">Detailed performance analytics coming soon</p>
            <div className="flex items-center justify-center space-x-4 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-2" />
                <span className="text-gray-600">Skill Rating</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                <span className="text-gray-600">Win Rate</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-purple-500 rounded-full mr-2" />
                <span className="text-gray-600">K/D Ratio</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Game Mode Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Game Mode Performance */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Performance by Game Mode</h4>
          
          <div className="space-y-4">
            {[
              { mode: 'Deathmatch', matches: 42, winRate: 65, kdr: 1.8, favorite: true },
              { mode: 'Team Battle', matches: 28, winRate: 71, kdr: 1.6, favorite: false },
              { mode: 'Co-op', matches: 15, winRate: 87, kdr: 2.3, favorite: false },
              { mode: 'Battle Royale', matches: 8, winRate: 25, kdr: 1.1, favorite: false }
            ].map((mode) => (
              <div key={mode.mode} className={`p-4 rounded-lg border-2 ${mode.favorite ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900">{mode.mode}</span>
                    {mode.favorite && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        Favorite
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-600">{mode.matches} matches</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-500">Win Rate</span>
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-900 mr-2">{mode.winRate}%</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-green-500 h-1.5 rounded-full" 
                          style={{ width: `${mode.winRate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-xs text-gray-500">K/D Ratio</span>
                    <div className="text-sm font-medium text-gray-900">{mode.kdr}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Achievements */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Recent Achievements</h4>
          
          <div className="space-y-4">
            {[
              { title: 'Win Streak', description: '5 consecutive victories', date: '2 days ago', icon: '🔥' },
              { title: 'Skill Milestone', description: 'Reached 1000+ rating', date: '1 week ago', icon: '🏆' },
              { title: 'Perfect Game', description: 'No deaths in deathmatch', date: '1 week ago', icon: '💎' },
              { title: 'Team Player', description: 'Most assists in team match', date: '2 weeks ago', icon: '🤝' }
            ].map((achievement, index) => (
              <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl mr-3">{achievement.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{achievement.title}</div>
                  <div className="text-xs text-gray-600">{achievement.description}</div>
                </div>
                <div className="text-xs text-gray-500 flex items-center">
                  <CalendarDaysIcon className="h-3 w-3 mr-1" />
                  {achievement.date}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}