'use client'

import { useState, useEffect } from 'react'
import { 
  TrophyIcon, 
  ClockIcon,
  UserGroupIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  FunnelIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline'

interface Match {
  id: string
  matchType: string
  gameMode: string
  status: string
  duration?: number
  winner?: string
  startedAt: string
  endedAt?: string
  players: Array<{
    id: string
    userId: string
    team?: string
    finalPosition?: number
    kills: number
    deaths: number
    assists: number
    score: number
    skillBefore: number
    skillAfter?: number
    skillChange: number
    user: {
      id: string
      name: string
    }
  }>
}

export default function MatchHistory() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMode, setFilterMode] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  })

  useEffect(() => {
    fetchMatches()
  }, [filterMode, filterType, pagination.page])

  const fetchMatches = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      })
      
      if (filterMode !== 'all') params.append('gameMode', filterMode)
      if (filterType !== 'all') params.append('matchType', filterType)

      const response = await fetch(`/api/matchmaking/matches/history?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setMatches(data.data.matches)
        setPagination(data.data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch match history:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getMatchResult = (match: Match, userId: string) => {
    const player = match.players.find(p => p.userId === userId)
    if (!player) return { result: 'unknown', color: 'text-gray-600', bg: 'bg-gray-100' }

    if (match.gameMode === 'team') {
      const playerTeam = player.team
      const winnerTeam = match.winner
      if (playerTeam === winnerTeam) {
        return { result: 'Victory', color: 'text-green-700', bg: 'bg-green-100' }
      } else {
        return { result: 'Defeat', color: 'text-red-700', bg: 'bg-red-100' }
      }
    } else {
      const position = player.finalPosition
      if (position === 1) {
        return { result: `#${position} Victory`, color: 'text-green-700', bg: 'bg-green-100' }
      } else if (position && position <= 3) {
        return { result: `#${position} Place`, color: 'text-yellow-700', bg: 'bg-yellow-100' }
      } else {
        return { result: position ? `#${position} Place` : 'Defeat', color: 'text-red-700', bg: 'bg-red-100' }
      }
    }
  }

  const getSkillChange = (change: number) => {
    if (change > 0) {
      return {
        icon: ArrowTrendingUpIcon,
        color: 'text-green-600',
        text: `+${change}`
      }
    } else if (change < 0) {
      return {
        icon: ArrowTrendingDownIcon,
        color: 'text-red-600',
        text: change.toString()
      }
    } else {
      return {
        icon: null,
        color: 'text-gray-600',
        text: '0'
      }
    }
  }

  const getCurrentUserId = () => {
    // This should come from your auth context or token
    return localStorage.getItem('user_id') || 'current-user-id'
  }

  if (loading && matches.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-6 animate-pulse">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded mb-2 w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
              <div className="h-6 bg-gray-200 rounded w-20" />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="h-3 bg-gray-200 rounded" />
              <div className="h-3 bg-gray-200 rounded" />
              <div className="h-3 bg-gray-200 rounded" />
              <div className="h-3 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Match History</h3>
          <p className="text-sm text-gray-600">View your recent matches and performance</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Game Mode</label>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Modes</option>
              <option value="deathmatch">Deathmatch</option>
              <option value="team">Team Battle</option>
              <option value="cooperative">Co-op</option>
              <option value="battle_royale">Battle Royale</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="ranked">Ranked</option>
              <option value="casual">Casual</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>

          <div className="flex items-end">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <FunnelIcon className="h-4 w-4" />
              <span>{matches.length} matches</span>
            </div>
          </div>
        </div>
      </div>

      {/* Matches */}
      <div className="space-y-4">
        {matches.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No matches found</h3>
            <p className="text-gray-600">
              {filterMode !== 'all' || filterType !== 'all'
                ? 'Try adjusting your filters to see more matches'
                : 'Start playing matches to see your history here'
              }
            </p>
          </div>
        ) : (
          matches.map((match) => {
            const currentUserId = getCurrentUserId()
            const currentPlayer = match.players.find(p => p.userId === currentUserId)
            const matchResult = getMatchResult(match, currentUserId)
            const skillChange = currentPlayer ? getSkillChange(currentPlayer.skillChange) : null

            return (
              <div key={match.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900 capitalize">
                        {match.gameMode.replace('_', ' ')} • {match.matchType}
                      </h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${matchResult.bg} ${matchResult.color}`}>
                        {matchResult.result}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className="flex items-center">
                        <CalendarDaysIcon className="h-4 w-4 mr-1" />
                        {new Date(match.startedAt).toLocaleDateString()}
                      </span>
                      
                      <span className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1" />
                        {formatDuration(match.duration || 0)}
                      </span>
                      
                      <span className="flex items-center">
                        <UserGroupIcon className="h-4 w-4 mr-1" />
                        {match.players.length} players
                      </span>
                    </div>
                  </div>

                  {skillChange && (
                    <div className="flex items-center space-x-2">
                      {skillChange.icon && (
                        <skillChange.icon className={`h-4 w-4 ${skillChange.color}`} />
                      )}
                      <span className={`font-semibold ${skillChange.color}`}>
                        {skillChange.text}
                      </span>
                      <span className="text-sm text-gray-500">MMR</span>
                    </div>
                  )}
                </div>

                {/* Player Stats */}
                {currentPlayer && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h5 className="font-medium text-gray-900 mb-3 flex items-center">
                      <ChartBarIcon className="h-4 w-4 mr-2" />
                      Your Performance
                    </h5>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-xl font-bold text-gray-900">{currentPlayer.score}</div>
                        <div className="text-xs text-gray-500">Score</div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-xl font-bold text-green-600">{currentPlayer.kills}</div>
                        <div className="text-xs text-gray-500">Kills</div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-xl font-bold text-red-600">{currentPlayer.deaths}</div>
                        <div className="text-xs text-gray-500">Deaths</div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-xl font-bold text-blue-600">{currentPlayer.assists}</div>
                        <div className="text-xs text-gray-500">Assists</div>
                      </div>
                    </div>

                    {currentPlayer.skillAfter && (
                      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center text-sm">
                        <span className="text-gray-600">Skill Rating</span>
                        <span className="font-medium text-gray-900">
                          {currentPlayer.skillBefore} → {currentPlayer.skillAfter}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Other Players */}
                {match.players.length > 1 && (
                  <div>
                    <h5 className="font-medium text-gray-900 mb-3">All Players</h5>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-1">Player</th>
                            <th className="text-right py-2 px-1">Score</th>
                            <th className="text-right py-2 px-1">K/D/A</th>
                            {match.gameMode === 'team' && (
                              <th className="text-center py-2 px-1">Team</th>
                            )}
                            {match.gameMode !== 'team' && (
                              <th className="text-center py-2 px-1">Position</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {match.players.map((player) => (
                            <tr 
                              key={player.id} 
                              className={`border-b border-gray-100 ${
                                player.userId === currentUserId ? 'bg-blue-50' : ''
                              }`}
                            >
                              <td className="py-2 px-1">
                                <div className="flex items-center">
                                  {player.userId === currentUserId && (
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
                                  )}
                                  {player.user.name}
                                </div>
                              </td>
                              <td className="text-right py-2 px-1 font-medium">
                                {player.score}
                              </td>
                              <td className="text-right py-2 px-1 text-gray-600">
                                {player.kills}/{player.deaths}/{player.assists}
                              </td>
                              {match.gameMode === 'team' && (
                                <td className="text-center py-2 px-1">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    player.team === 'team1' ? 'bg-blue-100 text-blue-800' :
                                    player.team === 'team2' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {player.team?.toUpperCase() || 'N/A'}
                                  </span>
                                </td>
                              )}
                              {match.gameMode !== 'team' && (
                                <td className="text-center py-2 px-1">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    player.finalPosition === 1 ? 'bg-yellow-100 text-yellow-800' :
                                    player.finalPosition && player.finalPosition <= 3 ? 'bg-gray-100 text-gray-800' :
                                    'bg-gray-50 text-gray-600'
                                  }`}>
                                    {player.finalPosition ? `#${player.finalPosition}` : '-'}
                                  </span>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} matches
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page <= 1}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            <span className="px-3 py-2 text-sm text-gray-700">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}