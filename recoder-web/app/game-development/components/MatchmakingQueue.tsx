'use client'

import { useState, useEffect } from 'react'
import { 
  ClockIcon, 
  StopIcon,
  UserGroupIcon,
  MapIcon,
  SignalIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

interface MatchmakingQueueProps {
  queueStatus: any
  onLeaveQueue: () => void
  loading: boolean
}

export default function MatchmakingQueue({ queueStatus, onLeaveQueue, loading }: MatchmakingQueueProps) {
  const [currentWaitTime, setCurrentWaitTime] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      if (queueStatus) {
        setCurrentWaitTime(queueStatus.waitTime + Math.floor((Date.now() - Date.now()) / 1000))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [queueStatus])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getQueueProgress = () => {
    if (!queueStatus) return 0
    const progress = Math.min((queueStatus.waitTime / queueStatus.estimatedWaitTime) * 100, 100)
    return Math.max(progress, 10) // Always show at least 10% progress
  }

  const getStatusColor = () => {
    if (!queueStatus) return 'blue'
    
    if (queueStatus.waitTime > queueStatus.estimatedWaitTime * 1.5) return 'red'
    if (queueStatus.waitTime > queueStatus.estimatedWaitTime) return 'yellow'
    return 'blue'
  }

  const statusColor = getStatusColor()
  const progress = getQueueProgress()

  if (!queueStatus) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-4" />
          <div className="h-8 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          {statusColor === 'red' ? (
            <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
          ) : (
            <UserGroupIcon className="h-8 w-8 text-blue-500" />
          )}
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {statusColor === 'red' ? 'Queue Taking Longer' : 'Finding Match...'}
        </h3>
        
        <p className="text-sm text-gray-600 mb-4">
          {statusColor === 'red' 
            ? 'We\'re still looking for the perfect match for you'
            : `Searching for players in ${queueStatus.gameMode.replace('_', ' ')}`
          }
        </p>
      </div>

      {/* Queue Progress */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Search Progress</span>
          <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-1000 ${
              statusColor === 'red' ? 'bg-red-500' :
              statusColor === 'yellow' ? 'bg-yellow-500' : 
              'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <ClockIcon className="h-5 w-5 text-gray-400 mx-auto mb-2" />
          <div className="text-lg font-semibold text-gray-900">
            {formatTime(queueStatus.waitTime || 0)}
          </div>
          <div className="text-xs text-gray-500">Time Waited</div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <SignalIcon className="h-5 w-5 text-gray-400 mx-auto mb-2" />
          <div className="text-lg font-semibold text-gray-900">
            #{queueStatus.position || '-'}
          </div>
          <div className="text-xs text-gray-500">Queue Position</div>
        </div>
      </div>

      {/* Estimated Time */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <ClockIcon className="h-5 w-5 text-blue-500 mr-3" />
          <div>
            <div className="text-sm font-medium text-blue-900">
              Estimated Wait Time
            </div>
            <div className="text-sm text-blue-700">
              {formatTime(queueStatus.estimatedWaitTime || 0)} 
              {queueStatus.waitTime > queueStatus.estimatedWaitTime && (
                <span className="text-red-600 ml-2">(Exceeded)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Current Search Parameters */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h4 className="font-medium text-gray-900 mb-3">Search Parameters</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Game Mode:</span>
            <span className="font-medium text-gray-900 capitalize">
              {queueStatus.gameMode.replace('_', ' ')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span className={`font-medium capitalize ${
              queueStatus.status === 'waiting' ? 'text-blue-600' :
              queueStatus.status === 'matched' ? 'text-green-600' :
              'text-gray-600'
            }`}>
              {queueStatus.status}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={onLeaveQueue}
          disabled={loading}
          className="w-full flex items-center justify-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500 mr-2" />
          ) : (
            <StopIcon className="h-4 w-4 mr-2" />
          )}
          {loading ? 'Leaving...' : 'Cancel Search'}
        </button>
        
        <div className="text-center">
          <button className="text-sm text-blue-600 hover:text-blue-700">
            Change Preferences
          </button>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h5 className="text-sm font-medium text-yellow-900 mb-2">💡 Tips for Faster Matching</h5>
        <ul className="text-xs text-yellow-800 space-y-1">
          <li>• Try different game modes if wait time is long</li>
          <li>• Consider expanding your skill range preference</li>
          <li>• Peak hours typically have faster matching</li>
          {statusColor === 'red' && (
            <li>• Current demand may be high for this mode</li>
          )}
        </ul>
      </div>
    </div>
  )
}