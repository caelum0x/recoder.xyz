'use client'

import { useState, useEffect } from 'react'
import { 
  UserGroupIcon, 
  LockClosedIcon,
  GlobeAltIcon,
  PlayIcon,
  PlusIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  ServerIcon
} from '@heroicons/react/24/outline'

interface GameRoomBrowserProps {
  onStatsChange?: () => void
}

interface GameRoom {
  id: string
  name: string
  gameMode: string
  currentPlayers: number
  maxPlayers: number
  isPrivate: boolean
  status: string
  mapName?: string
  serverRegion?: string
  host: {
    id: string
    name: string
  }
  players: Array<{
    id: string
    userId: string
    status: string
    user: {
      name: string
    }
  }>
  createdAt: string
}

export default function GameRoomBrowser({ onStatsChange }: GameRoomBrowserProps) {
  const [rooms, setRooms] = useState<GameRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [filterRegion, setFilterRegion] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  })

  useEffect(() => {
    fetchRooms()
  }, [filterMode, filterRegion, pagination.page])

  const fetchRooms = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      })
      
      if (filterMode !== 'all') params.append('gameMode', filterMode)
      if (filterRegion !== 'all') params.append('region', filterRegion)

      const response = await fetch(`/api/matchmaking/rooms?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setRooms(data.data.rooms)
        setPagination(data.data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch rooms:', error)
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async (roomId: string, password?: string) => {
    try {
      setJoiningRoom(roomId)
      
      const response = await fetch(`/api/matchmaking/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      })

      const data = await response.json()

      if (response.ok) {
        // Room joined successfully
        fetchRooms()
        onStatsChange?.()
        alert('Successfully joined room!')
      } else {
        throw new Error(data.error || 'Failed to join room')
      }
    } catch (error) {
      console.error('Join room error:', error)
      alert(`Failed to join room: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setJoiningRoom(null)
    }
  }

  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.host.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.gameMode.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'text-yellow-600 bg-yellow-100'
      case 'active': return 'text-green-600 bg-green-100'
      case 'finished': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getRegionFlag = (region: string) => {
    const flags: Record<string, string> = {
      'us-east': '🇺🇸',
      'us-west': '🇺🇸',
      'eu-west': '🇪🇺',
      'eu-east': '🇪🇺',
      'asia-pacific': '🌏'
    }
    return flags[region] || '🌍'
  }

  if (loading && rooms.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-6 animate-pulse">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 mr-4">
                <div className="h-4 bg-gray-200 rounded mb-2 w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
              <div className="h-8 bg-gray-200 rounded w-20" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 bg-gray-200 rounded w-1/4" />
              <div className="h-3 bg-gray-200 rounded w-1/6" />
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
          <h3 className="text-lg font-medium text-gray-900">Game Rooms</h3>
          <p className="text-sm text-gray-600">Browse and join active game rooms</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Create Room
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search rooms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Game Mode Filter */}
          <div>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Game Modes</option>
              <option value="deathmatch">Deathmatch</option>
              <option value="team">Team Battle</option>
              <option value="cooperative">Co-op</option>
              <option value="battle_royale">Battle Royale</option>
            </select>
          </div>

          {/* Region Filter */}
          <div>
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Regions</option>
              <option value="us-east">US East</option>
              <option value="us-west">US West</option>
              <option value="eu-west">EU West</option>
              <option value="asia-pacific">Asia Pacific</option>
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <FunnelIcon className="h-4 w-4" />
            <span>{filteredRooms.length} rooms found</span>
          </div>
        </div>
      </div>

      {/* Rooms List */}
      <div className="space-y-4">
        {filteredRooms.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No rooms found</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterMode !== 'all' || filterRegion !== 'all'
                ? 'Try adjusting your search filters'
                : 'No active game rooms at the moment'
              }
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create First Room
            </button>
          </div>
        ) : (
          filteredRooms.map((room) => (
            <div key={room.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <h4 className="text-lg font-medium text-gray-900 truncate">
                      {room.name}
                    </h4>
                    {room.isPrivate && (
                      <LockClosedIcon className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span className="flex items-center">
                      <UserGroupIcon className="h-4 w-4 mr-1" />
                      {room.currentPlayers}/{room.maxPlayers}
                    </span>
                    
                    <span className="capitalize">
                      {room.gameMode.replace('_', ' ')}
                    </span>
                    
                    {room.mapName && (
                      <span className="flex items-center">
                        <ServerIcon className="h-4 w-4 mr-1" />
                        {room.mapName}
                      </span>
                    )}
                    
                    {room.serverRegion && (
                      <span className="flex items-center">
                        <span className="mr-1">{getRegionFlag(room.serverRegion)}</span>
                        {room.serverRegion.replace('-', ' ').toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-2 text-sm text-gray-500">
                    Host: {room.host.name}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(room.status)}`}>
                    {room.status}
                  </div>
                  
                  <button
                    onClick={() => joinRoom(room.id)}
                    disabled={joiningRoom === room.id || room.currentPlayers >= room.maxPlayers || room.status !== 'waiting'}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {joiningRoom === room.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    ) : (
                      <PlayIcon className="h-4 w-4 mr-2" />
                    )}
                    {joiningRoom === room.id ? 'Joining...' : 
                     room.currentPlayers >= room.maxPlayers ? 'Full' :
                     room.status !== 'waiting' ? 'In Progress' : 'Join'}
                  </button>
                </div>
              </div>

              {/* Room Players */}
              {room.players.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <UserGroupIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Players</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {room.players.slice(0, 8).map((player) => (
                      <div
                        key={player.id}
                        className={`px-2 py-1 rounded text-xs ${
                          player.status === 'ready' ? 'bg-green-100 text-green-800' :
                          player.status === 'connected' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {player.user.name}
                      </div>
                    ))}
                    {room.players.length > 8 && (
                      <div className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                        +{room.players.length - 8} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Room Age */}
              <div className="border-t border-gray-100 pt-3 mt-3 text-xs text-gray-500 flex items-center">
                <ClockIcon className="h-3 w-3 mr-1" />
                Created {new Date(room.createdAt).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} rooms
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