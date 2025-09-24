'use client'

import { useState, useEffect } from 'react'
import { 
  PlayIcon, 
  PauseIcon,
  StopIcon,
  UserGroupIcon,
  TrophyIcon,
  ClockIcon,
  GlobeAltIcon,
  ChartBarIcon,
  CogIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import MatchmakingQueue from './MatchmakingQueue'
import GameRoomBrowser from './GameRoomBrowser'
import MatchHistory from './MatchHistory'
import MatchmakingStats from './MatchmakingStats'

interface MatchmakingDashboardProps {
  onStatsChange?: () => void
}

interface QueueStatus {
  inQueue: boolean
  gameMode: string
  position?: number
  estimatedWaitTime?: number
  playersInQueue?: number
  matchFound?: boolean
}

interface MatchmakingStats {
  currentSkill: number
  winRate: number
  totalMatches: number
  kdr: number
  wonMatches: number
}

interface MatchPreferences {
  maxWaitTime: number
  skillRange: number
  partySize: number
}

const GAME_MODES = [
  { id: 'deathmatch', name: 'Deathmatch', description: '4-10 players, free-for-all', playerCount: '4-10' },
  { id: 'team', name: 'Team Battle', description: '2v2, 3v3, or 5v5 matches', playerCount: '4-10' },
  { id: 'cooperative', name: 'Co-op', description: 'Team up against AI', playerCount: '2-6' },
  { id: 'battle_royale', name: 'Battle Royale', description: 'Last player standing', playerCount: '20-100' }
]

const REGIONS = [
  { id: 'us-east', name: 'US East', ping: '12ms' },
  { id: 'us-west', name: 'US West', ping: '34ms' },
  { id: 'eu-west', name: 'EU West', ping: '67ms' },
  { id: 'asia-pacific', name: 'Asia Pacific', ping: '142ms' }
]

export default function MatchmakingDashboard({ onStatsChange }: MatchmakingDashboardProps) {
  const [activeTab, setActiveTab] = useState<string>('matchmaking')
  const [isInQueue, setIsInQueue] = useState<boolean>(false)
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [selectedGameMode, setSelectedGameMode] = useState<string>('deathmatch')
  const [selectedRegion, setSelectedRegion] = useState<string>('us-east')
  const [skillLevel, setSkillLevel] = useState<number>(1000)
  const [matchPreferences, setMatchPreferences] = useState<MatchPreferences>({
    maxWaitTime: 300,
    skillRange: 200,
    partySize: 1
  })
  const [stats, setStats] = useState<MatchmakingStats | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMatchmakingStats()
    checkQueueStatus()
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isInQueue) {
      interval = setInterval(checkQueueStatus, 2000)
    }
    return () => clearInterval(interval)
  }, [isInQueue])

  const fetchMatchmakingStats = async () => {
    try {
      const response = await fetch('/api/matchmaking/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setStats(data.data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const checkQueueStatus = async () => {
    try {
      const response = await fetch('/api/matchmaking/queue/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        const status = data.data
        
        setQueueStatus(status)
        setIsInQueue(status.inQueue)
        
        if (status.inQueue) {
          setSelectedGameMode(status.gameMode)
        }
      }
    } catch (error) {
      console.error('Failed to check queue status:', error)
    }
  }

  const joinQueue = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/matchmaking/queue/join', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameMode: selectedGameMode,
          skillLevel,
          preferredRegion: selectedRegion,
          maxWaitTime: matchPreferences.maxWaitTime,
          partySize: matchPreferences.partySize,
          preferences: {
            skillRange: matchPreferences.skillRange
          }
        })
      })

      const data = await response.json()

      if (response.ok) {
        setIsInQueue(true)
        checkQueueStatus()
        onStatsChange?.()
      } else {
        setError(data.error || 'Failed to join queue')
      }
    } catch (error) {
      setError('Network error occurred')
    } finally {
      setLoading(false)
    }
  }

  const leaveQueue = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/matchmaking/queue/leave', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setIsInQueue(false)
        setQueueStatus(null)
        onStatsChange?.()
      } else {
        setError(data.error || 'Failed to leave queue')
      }
    } catch (error) {
      setError('Network error occurred')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getSkillRank = (skill: number) => {
    if (skill < 800) return { rank: 'Bronze', color: 'text-orange-600' }
    if (skill < 1200) return { rank: 'Silver', color: 'text-gray-500' }
    if (skill < 1600) return { rank: 'Gold', color: 'text-yellow-500' }
    if (skill < 2000) return { rank: 'Platinum', color: 'text-blue-500' }
    return { rank: 'Diamond', color: 'text-purple-500' }
  }

  const skillRank = getSkillRank(skillLevel)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <UserGroupIcon className="h-6 w-6 mr-2" />
              Multiplayer Matchmaking
            </h2>
            <p className="text-sm text-gray-600 mt-1">Find and join matches with players of similar skill</p>
          </div>
          
          {stats && (
            <div className="flex items-center space-x-6 text-sm">
              <div className="text-center">
                <div className="font-semibold text-gray-900">{stats.currentSkill}</div>
                <div className={`text-xs ${skillRank.color}`}>{skillRank.rank}</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-900">{stats.winRate}%</div>
                <div className="text-xs text-gray-500">Win Rate</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-900">{stats.totalMatches}</div>
                <div className="text-xs text-gray-500">Matches</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-3" />
          <span className="text-red-700">{error}</span>
          <button 
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'matchmaking', name: 'Matchmaking', icon: PlayIcon },
            { id: 'rooms', name: 'Browse Rooms', icon: UserGroupIcon },
            { id: 'history', name: 'Match History', icon: ClockIcon },
            { id: 'stats', name: 'Statistics', icon: ChartBarIcon }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-5 w-5 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'matchmaking' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Matchmaking Controls */}
          <div className="lg:col-span-2 space-y-6">
            {!isInQueue ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Find Match</h3>
                
                {/* Game Mode Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Game Mode</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {GAME_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setSelectedGameMode(mode.id)}
                        className={`p-4 border-2 rounded-lg text-left transition-all ${
                          selectedGameMode === mode.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-gray-900">{mode.name}</div>
                        <div className="text-sm text-gray-600">{mode.description}</div>
                        <div className="text-xs text-gray-500 mt-1">{mode.playerCount} players</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Region Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Server Region</label>
                  <div className="grid grid-cols-2 gap-3">
                    {REGIONS.map((region) => (
                      <button
                        key={region.id}
                        onClick={() => setSelectedRegion(region.id)}
                        className={`p-3 border-2 rounded-lg flex items-center justify-between transition-all ${
                          selectedRegion === region.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">{region.name}</div>
                          <div className="text-sm text-gray-600">{region.ping}</div>
                        </div>
                        <GlobeAltIcon className="h-5 w-5 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced Settings */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900 flex items-center">
                    <CogIcon className="h-5 w-5 mr-2" />
                    Match Preferences
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max Wait Time</label>
                      <select 
                        value={matchPreferences.maxWaitTime}
                        onChange={(e) => setMatchPreferences(prev => ({ ...prev, maxWaitTime: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value={60}>1 minute</option>
                        <option value={180}>3 minutes</option>
                        <option value={300}>5 minutes</option>
                        <option value={600}>10 minutes</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Skill Range</label>
                      <select
                        value={matchPreferences.skillRange}
                        onChange={(e) => setMatchPreferences(prev => ({ ...prev, skillRange: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value={100}>Very Similar (±100)</option>
                        <option value={200}>Similar (±200)</option>
                        <option value={300}>Moderate (±300)</option>
                        <option value={500}>Any (±500)</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Party Size</label>
                      <select
                        value={matchPreferences.partySize}
                        onChange={(e) => setMatchPreferences(prev => ({ ...prev, partySize: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value={1}>Solo (1)</option>
                        <option value={2}>Duo (2)</option>
                        <option value={3}>Squad (3)</option>
                        <option value={4}>Team (4)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Join Queue Button */}
                <div className="pt-4">
                  <button
                    onClick={joinQueue}
                    disabled={loading}
                    className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                    ) : (
                      <PlayIcon className="h-5 w-5 mr-2" />
                    )}
                    {loading ? 'Joining...' : 'Find Match'}
                  </button>
                </div>
              </div>
            ) : (
              <MatchmakingQueue 
                queueStatus={queueStatus}
                onLeaveQueue={leaveQueue}
                loading={loading}
              />
            )}
          </div>

          {/* Quick Stats Sidebar */}
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <TrophyIcon className="h-5 w-5 mr-2" />
                Your Stats
              </h3>
              
              {stats ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Current Skill</span>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{stats.currentSkill}</div>
                      <div className={`text-xs ${skillRank.color}`}>{skillRank.rank}</div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Matches Played</span>
                    <span className="font-semibold text-gray-900">{stats.totalMatches}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Win Rate</span>
                    <span className="font-semibold text-green-600">{stats.winRate}%</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">K/D Ratio</span>
                    <span className="font-semibold text-gray-900">{stats.kdr}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600">Matches Won</span>
                    <span className="font-semibold text-gray-900">{stats.wonMatches}</span>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-4 bg-gray-200 rounded" />
                </div>
              )}
            </div>

            {/* Online Players */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Online Now</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">In Queue</span>
                  <div className="flex items-center">
                    <div className="h-2 w-2 bg-yellow-400 rounded-full mr-2" />
                    <span className="font-semibold text-gray-900">127</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">In Match</span>
                  <div className="flex items-center">
                    <div className="h-2 w-2 bg-green-400 rounded-full mr-2" />
                    <span className="font-semibold text-gray-900">2,843</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Online</span>
                  <div className="flex items-center">
                    <div className="h-2 w-2 bg-blue-400 rounded-full mr-2" />
                    <span className="font-semibold text-gray-900">15,672</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rooms' && (
        <GameRoomBrowser onStatsChange={onStatsChange} />
      )}

      {activeTab === 'history' && (
        <MatchHistory />
      )}

      {activeTab === 'stats' && (
        <MatchmakingStats stats={stats} onRefresh={fetchMatchmakingStats} />
      )}
    </div>
  )
}