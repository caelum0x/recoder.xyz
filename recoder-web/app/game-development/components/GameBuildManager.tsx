'use client'

import { useState, useEffect } from 'react'
import { 
  CloudArrowUpIcon, 
  PlayIcon, 
  PauseIcon,
  StopIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  EyeIcon,
  FunnelIcon,
  PlusIcon
} from '@heroicons/react/24/outline'

interface GameBuild {
  id: string
  platform: string
  buildType: string
  version: string
  status: 'queued' | 'building' | 'completed' | 'failed' | 'cancelled'
  priority: number
  queuedAt: string
  startedAt?: string
  completedAt?: string
  progress?: number
  downloadUrl?: string
  artifactSize?: number
  queuePosition?: number
  estimatedWaitTime?: number
  logs?: Array<{ timestamp: string; message: string; level: string }>
  project: {
    id: string
    name: string
    framework: string
  }
}

interface GameBuildManagerProps {
  onStatsChange: () => void
}

const PLATFORMS = {
  'Unity': ['Windows', 'Mac', 'Linux', 'iOS', 'Android', 'WebGL'],
  'Unreal Engine': ['Windows', 'Mac', 'Linux', 'iOS', 'Android', 'PlayStation', 'Xbox']
}

const BUILD_TYPES = ['Debug', 'Release', 'Development']

export default function GameBuildManager({ onStatsChange }: GameBuildManagerProps) {
  const [builds, setBuilds] = useState<GameBuild[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [projects, setProjects] = useState<Array<{ id: string; name: string; framework: string }>>([])
  const [queueStatus, setQueueStatus] = useState<any>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedBuild, setSelectedBuild] = useState<GameBuild | null>(null)
  const [showLogsModal, setShowLogsModal] = useState(false)

  useEffect(() => {
    fetchBuilds()
    fetchProjects()
    fetchQueueStatus()
  }, [])

  useEffect(() => {
    fetchBuilds()
  }, [selectedProject, selectedStatus, selectedPlatform])

  useEffect(() => {
    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      fetchBuilds()
      fetchQueueStatus()
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const fetchBuilds = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (selectedProject !== 'all') params.append('projectId', selectedProject)
      if (selectedStatus !== 'all') params.append('status', selectedStatus)
      if (selectedPlatform !== 'all') params.append('platform', selectedPlatform)

      const response = await fetch(`/api/game-development/builds?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setBuilds(data.data.builds)
        onStatsChange()
      }
    } catch (error) {
      console.error('Failed to fetch builds:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/game-development/projects', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setProjects(data.data.projects)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const fetchQueueStatus = async () => {
    try {
      const response = await fetch('/api/game-development/builds/queue/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setQueueStatus(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch queue status:', error)
    }
  }

  const handleCreateBuild = async (buildData: any) => {
    try {
      const response = await fetch('/api/game-development/builds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildData)
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Successfully queued ${data.data.buildJobs.length} build(s)`)
        setShowCreateModal(false)
        fetchBuilds()
        fetchQueueStatus()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create build')
      }
    } catch (error) {
      console.error('Build creation failed:', error)
      alert(`Build creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleCancelBuild = async (buildId: string) => {
    if (!confirm('Are you sure you want to cancel this build?')) return

    try {
      const response = await fetch(`/api/game-development/builds/${buildId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        fetchBuilds()
        fetchQueueStatus()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to cancel build')
      }
    } catch (error) {
      console.error('Build cancellation failed:', error)
      alert(`Failed to cancel build: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRetryBuild = async (buildId: string) => {
    try {
      const response = await fetch(`/api/game-development/builds/${buildId}/retry`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        fetchBuilds()
        fetchQueueStatus()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to retry build')
      }
    } catch (error) {
      console.error('Build retry failed:', error)
      alert(`Failed to retry build: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const fetchBuildLogs = async (buildId: string) => {
    try {
      const response = await fetch(`/api/game-development/builds/${buildId}/logs`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSelectedBuild(data.data.build)
        setShowLogsModal(true)
      }
    } catch (error) {
      console.error('Failed to fetch build logs:', error)
    }
  }

  const getStatusIcon = (status: string, progress?: number) => {
    switch (status) {
      case 'queued':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />
      case 'building':
        return <PlayIcon className="h-5 w-5 text-blue-500" />
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
      case 'cancelled':
        return <XMarkIcon className="h-5 w-5 text-gray-500" />
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'building': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'completed': return 'bg-green-100 text-green-800 border-green-200'
      case 'failed': return 'bg-red-100 text-red-800 border-red-200'
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : new Date()
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60)
    return `${duration} min`
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Build Manager</h2>
          <p className="text-sm text-gray-600">Create and manage game builds across multiple platforms</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
          Create Build
        </button>
      </div>

      {/* Queue Status */}
      {queueStatus && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Build Queue Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{queueStatus.queue.totalInQueue}</div>
              <div className="text-xs text-gray-500">In Queue</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{queueStatus.queue.currentlyBuilding}</div>
              <div className="text-xs text-gray-500">Building</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {queueStatus.statistics.last24Hours.completed || 0}
              </div>
              <div className="text-xs text-gray-500">Completed (24h)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {queueStatus.statistics.last24Hours.failed || 0}
              </div>
              <div className="text-xs text-gray-500">Failed (24h)</div>
            </div>
          </div>
          
          {queueStatus.userBuilds.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Your Queued Builds:</h4>
              <div className="space-y-1">
                {queueStatus.userBuilds.map((build: any) => (
                  <div key={build.id} className="text-sm text-gray-600 flex justify-between">
                    <span>{build.project.name} ({build.platform})</span>
                    <span className="text-yellow-600">
                      Queue #{build.queuePosition} - ~{build.estimatedWaitTime}min
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filters:</span>
        </div>
        
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">All Projects</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.framework})
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="queued">Queued</option>
          <option value="building">Building</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">All Platforms</option>
          <option value="Windows">Windows</option>
          <option value="Mac">Mac</option>
          <option value="Linux">Linux</option>
          <option value="iOS">iOS</option>
          <option value="Android">Android</option>
          <option value="WebGL">WebGL</option>
          <option value="PlayStation">PlayStation</option>
          <option value="Xbox">Xbox</option>
        </select>
      </div>

      {/* Builds List */}
      {builds.length === 0 ? (
        <div className="text-center py-12">
          <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No builds found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first build to get started.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              Create Build
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {builds.map((build) => (
              <li key={build.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {getStatusIcon(build.status, build.progress)}
                    <div className="ml-4">
                      <div className="flex items-center">
                        <h3 className="text-sm font-medium text-gray-900">
                          {build.project.name} v{build.version}
                        </h3>
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(build.status)}`}>
                          {build.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center text-sm text-gray-500">
                        <span>{build.platform} • {build.buildType}</span>
                        {build.status === 'building' && build.progress && (
                          <>
                            <span className="mx-1">•</span>
                            <span>{build.progress}%</span>
                          </>
                        )}
                        {build.queuePosition && (
                          <>
                            <span className="mx-1">•</span>
                            <span>Queue #{build.queuePosition}</span>
                          </>
                        )}
                      </div>
                      {build.status === 'building' && build.progress && (
                        <div className="mt-2 w-48">
                          <div className="bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${build.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => fetchBuildLogs(build.id)}
                      className="text-gray-400 hover:text-blue-500"
                      title="View Logs"
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>

                    {build.downloadUrl && build.status === 'completed' && (
                      <a
                        href={build.downloadUrl}
                        download
                        className="text-gray-400 hover:text-green-500"
                        title="Download Build"
                      >
                        <DocumentArrowDownIcon className="h-5 w-5" />
                      </a>
                    )}

                    {['failed', 'cancelled'].includes(build.status) && (
                      <button
                        onClick={() => handleRetryBuild(build.id)}
                        className="text-gray-400 hover:text-blue-500"
                        title="Retry Build"
                      >
                        <ArrowPathIcon className="h-5 w-5" />
                      </button>
                    )}

                    {['queued', 'building'].includes(build.status) && (
                      <button
                        onClick={() => handleCancelBuild(build.id)}
                        className="text-gray-400 hover:text-red-500"
                        title="Cancel Build"
                      >
                        <StopIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Build Details */}
                <div className="mt-2 flex items-center text-xs text-gray-500 space-x-4">
                  <span>Queued: {new Date(build.queuedAt).toLocaleDateString()}</span>
                  {build.startedAt && (
                    <span>Started: {new Date(build.startedAt).toLocaleString()}</span>
                  )}
                  {build.completedAt && (
                    <>
                      <span>Duration: {formatDuration(build.startedAt!, build.completedAt)}</span>
                      {build.artifactSize && (
                        <span>Size: {formatFileSize(build.artifactSize * 1024 * 1024)}</span>
                      )}
                    </>
                  )}
                  {build.estimatedWaitTime && build.status === 'queued' && (
                    <span>Est. wait: {build.estimatedWaitTime} min</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Create Build Modal */}
      {showCreateModal && (
        <CreateBuildModal
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateBuild}
        />
      )}

      {/* Build Logs Modal */}
      {showLogsModal && selectedBuild && (
        <BuildLogsModal
          build={selectedBuild}
          onClose={() => {
            setShowLogsModal(false)
            setSelectedBuild(null)
          }}
        />
      )}
    </div>
  )
}

// Create Build Modal Component
function CreateBuildModal({ projects, onClose, onSubmit }: any) {
  const [formData, setFormData] = useState({
    projectId: '',
    platforms: [] as string[],
    buildType: 'Release',
    version: '1.0.0',
    priority: 'normal'
  })

  const selectedProject = projects.find((p: any) => p.id === formData.projectId)
  const availablePlatforms = selectedProject ? PLATFORMS[selectedProject.framework as keyof typeof PLATFORMS] || [] : []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const togglePlatform = (platform: string) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform]
    }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Create Build</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project
            </label>
            <select
              value={formData.projectId}
              onChange={(e) => setFormData(prev => ({ ...prev, projectId: e.target.value, platforms: [] }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            >
              <option value="">Select Project</option>
              {projects.map((project: any) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.framework})
                </option>
              ))}
            </select>
          </div>

          {availablePlatforms.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platforms
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availablePlatforms.map(platform => (
                  <label key={platform} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.platforms.includes(platform)}
                      onChange={() => togglePlatform(platform)}
                      className="mr-2"
                    />
                    {platform}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Build Type
              </label>
              <select
                value={formData.buildType}
                onChange={(e) => setFormData(prev => ({ ...prev, buildType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {BUILD_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Version
              </label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="1.0.0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.projectId || formData.platforms.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Build
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Build Logs Modal Component
function BuildLogsModal({ build, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">
            Build Logs - {build.project.name} ({build.platform})
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-96">
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
            {build.logs && build.logs.length > 0 ? (
              build.logs.map((log: any, index: number) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`ml-2 ${
                    log.level === 'error' ? 'text-red-400' : 
                    log.level === 'warning' ? 'text-yellow-400' :
                    log.level === 'success' ? 'text-green-400' : 'text-white'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500">No logs available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}