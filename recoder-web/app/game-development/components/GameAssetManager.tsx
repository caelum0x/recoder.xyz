'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  PlusIcon, 
  FolderIcon, 
  DocumentIcon, 
  PhotoIcon, 
  SpeakerWaveIcon,
  CubeIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  TagIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline'

interface GameAsset {
  id: string
  assetName: string
  assetType: 'Texture' | 'Model' | 'Audio' | 'Animation' | 'Script' | 'Prefab' | 'Material' | 'Shader'
  category?: string
  tags: string[]
  fileUrl: string
  fileSize: number
  metadata: {
    format?: string
    resolution?: string
    duration?: number
    dimensions?: string
  }
  dependencies: string[]
  status: string
  createdAt: string
  updatedAt: string
  project: {
    id: string
    name: string
    framework: string
  }
}

interface GameAssetManagerProps {
  onStatsChange: () => void
}

const ASSET_TYPES = [
  { value: 'Texture', label: 'Texture', icon: PhotoIcon, color: 'bg-purple-500', extensions: ['.png', '.jpg', '.jpeg', '.tga', '.psd'] },
  { value: 'Model', label: '3D Model', icon: CubeIcon, color: 'bg-blue-500', extensions: ['.fbx', '.obj', '.3ds', '.blend', '.dae'] },
  { value: 'Audio', label: 'Audio', icon: SpeakerWaveIcon, color: 'bg-green-500', extensions: ['.wav', '.mp3', '.ogg', '.aiff'] },
  { value: 'Animation', label: 'Animation', icon: DocumentIcon, color: 'bg-orange-500', extensions: ['.anim', '.fbx', '.dae'] },
  { value: 'Script', label: 'Script', icon: DocumentIcon, color: 'bg-gray-500', extensions: ['.cs', '.js', '.ts', '.cpp', '.h'] },
  { value: 'Prefab', label: 'Prefab', icon: CubeIcon, color: 'bg-indigo-500', extensions: ['.prefab', '.uasset'] },
  { value: 'Material', label: 'Material', icon: DocumentIcon, color: 'bg-pink-500', extensions: ['.mat', '.uasset'] },
  { value: 'Shader', label: 'Shader', icon: DocumentIcon, color: 'bg-yellow-500', extensions: ['.shader', '.hlsl', '.glsl'] }
]

export default function GameAssetManager({ onStatsChange }: GameAssetManagerProps) {
  const [assets, setAssets] = useState<GameAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [projects, setProjects] = useState<Array<{ id: string; name: string; framework: string }>>([])
  const [categories, setCategories] = useState<string[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<GameAsset | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchOperation, setBatchOperation] = useState<string>('')
  const [pipelineStatus, setPipelineStatus] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchAssets()
    fetchProjects()
    fetchPipelineStatus()
  }, [])

  useEffect(() => {
    // Poll pipeline status every 30 seconds
    const interval = setInterval(fetchPipelineStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetchAssets()
  }, [selectedProject, selectedType, searchQuery, selectedCategory])

  const fetchAssets = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (selectedProject !== 'all') params.append('projectId', selectedProject)
      if (selectedType !== 'all') params.append('type', selectedType)
      if (searchQuery) params.append('search', searchQuery)
      if (selectedCategory !== 'all') params.append('category', selectedCategory)

      const response = await fetch(`/api/game-development/assets?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setAssets(data.data.assets)
        
        // Extract unique categories
        const uniqueCategories = Array.from(new Set(
          data.data.assets
            .map((asset: GameAsset) => asset.category)
            .filter((category: string) => category && category.trim() !== '')
        )) as string[]
        setCategories(uniqueCategories)
        
        onStatsChange()
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error)
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

  const handleFileUpload = async (files: FileList, projectId: string) => {
    if (!files.length || projectId === 'all') return

    const formData = new FormData()
    const fileArray = Array.from(files)

    // Add all files to single FormData object
    fileArray.forEach(file => {
      formData.append('files', file)
    })
    
    // Add project metadata
    formData.append('projectId', projectId)
    formData.append('category', 'General')
    formData.append('tags', '')

    try {
      // Set initial progress for all files
      fileArray.forEach(file => {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }))
      })

      const response = await fetch('/api/game-development/assets/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        
        // Set progress to 100% for all files
        fileArray.forEach(file => {
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }))
        })

        // Clear progress after 2 seconds
        setTimeout(() => {
          setUploadProgress(prev => {
            const newProgress = { ...prev }
            fileArray.forEach(file => {
              delete newProgress[file.name]
            })
            return newProgress
          })
        }, 2000)

        // Refresh assets list
        fetchAssets()
        
        alert(`Successfully uploaded ${data.data.uploaded} of ${data.data.total} files`)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to upload files')
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert(`Upload failed: ${error instanceof Error ? error.message : String(error)}`)
      
      // Clear progress on error
      fileArray.forEach(file => {
        setUploadProgress(prev => {
          const newProgress = { ...prev }
          delete newProgress[file.name]
          return newProgress
        })
      })
    }
  }

  const detectAssetType = (filename: string): string | null => {
    const extension = '.' + filename.split('.').pop()?.toLowerCase()
    
    for (const assetType of ASSET_TYPES) {
      if (assetType.extensions.includes(extension)) {
        return assetType.value
      }
    }
    return null
  }

  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) {
      return
    }

    try {
      const response = await fetch(`/api/game-development/assets?id=${assetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        setAssets(prev => prev.filter(asset => asset.id !== assetId))
        setSelectedAsset(null)
        onStatsChange()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete asset')
      }
    } catch (error) {
      console.error('Failed to delete asset:', error)
      alert(`Failed to delete asset: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const fetchPipelineStatus = async () => {
    try {
      const response = await fetch('/api/game-development/assets/pipeline/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setPipelineStatus(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch pipeline status:', error)
    }
  }

  const handleBatchProcess = async (operations: string[]) => {
    if (selectedAssets.size === 0) {
      alert('Please select assets to process')
      return
    }

    try {
      const response = await fetch('/api/game-development/assets/batch-process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedAssets),
          operations
        })
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Successfully processed ${data.data.processed} of ${data.data.total} assets`)
        setSelectedAssets(new Set())
        setShowBatchModal(false)
        fetchAssets()
        fetchPipelineStatus()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to process assets')
      }
    } catch (error) {
      console.error('Batch processing failed:', error)
      alert(`Batch processing failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleOptimizeAsset = async (assetId: string, optimizations: string[]) => {
    try {
      const response = await fetch('/api/game-development/assets/optimize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assetId,
          optimizations
        })
      })

      if (response.ok) {
        const data = await response.json()
        alert('Asset optimized successfully')
        fetchAssets()
        fetchPipelineStatus()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to optimize asset')
      }
    } catch (error) {
      console.error('Asset optimization failed:', error)
      alert(`Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const toggleAssetSelection = (assetId: string) => {
    const newSelection = new Set(selectedAssets)
    if (newSelection.has(assetId)) {
      newSelection.delete(assetId)
    } else {
      newSelection.add(assetId)
    }
    setSelectedAssets(newSelection)
  }

  const selectAllAssets = () => {
    setSelectedAssets(new Set(assets.map(asset => asset.id)))
  }

  const clearSelection = () => {
    setSelectedAssets(new Set())
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getAssetTypeInfo = (type: string) => {
    return ASSET_TYPES.find(t => t.value === type) || ASSET_TYPES[0]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
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
          <h2 className="text-xl font-semibold text-gray-900">Asset Manager</h2>
          <p className="text-sm text-gray-600">Upload and manage game assets for your projects</p>
        </div>
        
        <div className="flex items-center space-x-3">
          {selectedAssets.size > 0 && (
            <>
              <span className="text-sm text-gray-600">
                {selectedAssets.size} selected
              </span>
              <button
                onClick={() => setShowBatchModal(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Batch Process
              </button>
              <button
                onClick={clearSelection}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Clear
              </button>
            </>
          )}
          
          {selectedProject !== 'all' && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              Upload Assets
            </button>
          )}
        </div>
      </div>

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
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">All Types</option>
          {ASSET_TYPES.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        {categories.length > 0 && (
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        )}

        <div className="flex-1 max-w-xs">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm w-full"
            />
          </div>
        </div>
      </div>

      {/* Pipeline Status */}
      {pipelineStatus && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Processing Pipeline Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{pipelineStatus.overview.processed || 0}</div>
              <div className="text-xs text-gray-500">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{pipelineStatus.overview.processing || 0}</div>
              <div className="text-xs text-gray-500">Processing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{pipelineStatus.overview.error || 0}</div>
              <div className="text-xs text-gray-500">Errors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{pipelineStatus.totalAssets || 0}</div>
              <div className="text-xs text-gray-500">Total Assets</div>
            </div>
          </div>
          
          {pipelineStatus.currentlyProcessing.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Currently Processing:</h4>
              <div className="space-y-1">
                {pipelineStatus.currentlyProcessing.map((asset: any) => (
                  <div key={asset.id} className="text-sm text-gray-600 flex justify-between">
                    <span>{asset.assetName}</span>
                    <span className="text-yellow-600">{asset.assetType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selection Controls */}
      {assets.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg">
          <div className="flex items-center space-x-4">
            <button
              onClick={selectAllAssets}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Select All ({assets.length})
            </button>
            {selectedAssets.size > 0 && (
              <button
                onClick={clearSelection}
                className="text-sm text-gray-600 hover:text-gray-700"
              >
                Clear Selection
              </button>
            )}
          </div>
          
          {selectedAssets.size > 0 && (
            <div className="text-sm text-gray-600">
              {selectedAssets.size} of {assets.length} selected
            </div>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-3">Uploading Assets</h3>
          {Object.entries(uploadProgress).map(([filename, progress]) => (
            <div key={filename} className="mb-2 last:mb-0">
              <div className="flex justify-between text-sm">
                <span className="text-blue-800">{filename}</span>
                <span className="text-blue-600">{progress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 mt-1">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assets Grid */}
      {assets.length === 0 ? (
        <div className="text-center py-12">
          <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No assets found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {selectedProject === 'all' 
              ? 'Select a project and upload your first asset.'
              : 'Upload assets to start building your game.'
            }
          </p>
          {selectedProject !== 'all' && (
            <div className="mt-6">
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                Upload Assets
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {assets.map((asset) => {
            const typeInfo = getAssetTypeInfo(asset.assetType)
            const IconComponent = typeInfo.icon
            
            return (
              <div
                key={asset.id}
                className={`border rounded-lg p-4 transition-all hover:shadow-md ${
                  selectedAsset?.id === asset.id 
                    ? 'border-blue-500 bg-blue-50 shadow-md' 
                    : selectedAssets.has(asset.id)
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedAssets.has(asset.id)}
                      onChange={() => toggleAssetSelection(asset.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div
                      className={`p-2 rounded-lg ${typeInfo.color} cursor-pointer`}
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  
                  <div className="flex space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(asset.fileUrl, '_blank')
                      }}
                      className="p-1 text-gray-400 hover:text-blue-500"
                      title="View Asset"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOptimizeAsset(asset.id, ['compress', 'resize'])
                      }}
                      className="p-1 text-gray-400 hover:text-green-500"
                      title="Optimize Asset"
                    >
                      <WrenchScrewdriverIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteAsset(asset.id)
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Delete Asset"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900 truncate" title={asset.assetName}>
                    {asset.assetName}
                  </h3>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{typeInfo.label}</span>
                    <span>{formatFileSize(asset.fileSize)}</span>
                  </div>

                  <div className="text-xs text-gray-500">
                    {asset.project.name} • {asset.project.framework}
                  </div>

                  {asset.metadata.format && (
                    <div className="text-xs text-gray-500">
                      Format: {asset.metadata.format.toUpperCase()}
                    </div>
                  )}

                  {asset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {asset.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                        >
                          {tag}
                        </span>
                      ))}
                      {asset.tags.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          +{asset.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(asset.status)}`}>
                      {asset.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(asset.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Batch Processing Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Batch Process Assets ({selectedAssets.size} selected)
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Operations:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={batchOperation.includes('optimize')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchOperation(prev => prev + ',optimize')
                        } else {
                          setBatchOperation(prev => prev.replace(',optimize', '').replace('optimize,', '').replace('optimize', ''))
                        }
                      }}
                      className="mr-2"
                    />
                    Optimize assets (compress, resize)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={batchOperation.includes('validate')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchOperation(prev => prev + ',validate')
                        } else {
                          setBatchOperation(prev => prev.replace(',validate', '').replace('validate,', '').replace('validate', ''))
                        }
                      }}
                      className="mr-2"
                    />
                    Validate file integrity
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={batchOperation.includes('generateVariants')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchOperation(prev => prev + ',generateVariants')
                        } else {
                          setBatchOperation(prev => prev.replace(',generateVariants', '').replace('generateVariants,', '').replace('generateVariants', ''))
                        }
                      }}
                      className="mr-2"
                    />
                    Generate resolution variants
                  </label>
                </div>
              </div>
              
              <div className="text-sm text-gray-500">
                <p className="font-medium">Processing will include:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {batchOperation.includes('optimize') && (
                    <li>Compression and size optimization</li>
                  )}
                  {batchOperation.includes('validate') && (
                    <li>File format and integrity validation</li>
                  )}
                  {batchOperation.includes('generateVariants') && (
                    <li>Multiple resolution variants</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowBatchModal(false)
                  setBatchOperation('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const operations = batchOperation.split(',').filter(Boolean)
                  if (operations.length > 0) {
                    handleBatchProcess(operations)
                  }
                }}
                disabled={!batchOperation}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Process Assets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Assets</h3>
            
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.classList.add('border-blue-400', 'bg-blue-50')
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
                if (e.dataTransfer.files && selectedProject !== 'all') {
                  handleFileUpload(e.dataTransfer.files, selectedProject)
                  setShowUploadModal(false)
                }
              }}
            >
              <ArrowDownTrayIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supported: Images, 3D Models, Audio, Animations, Scripts
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && selectedProject !== 'all') {
                  handleFileUpload(e.target.files, selectedProject)
                  setShowUploadModal(false)
                }
              }}
            />

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Details Sidebar */}
      {selectedAsset && (
        <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-lg border-l border-gray-200 p-6 overflow-y-auto z-40">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-gray-900">Asset Details</h3>
            <button
              onClick={() => setSelectedAsset(null)}
              className="text-gray-400 hover:text-gray-500"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900">{selectedAsset.assetName}</h4>
              <p className="text-sm text-gray-600">{getAssetTypeInfo(selectedAsset.assetType).label}</p>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Project:</dt>
                  <dd className="text-gray-900">{selectedAsset.project.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Framework:</dt>
                  <dd className="text-gray-900">{selectedAsset.project.framework}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Size:</dt>
                  <dd className="text-gray-900">{formatFileSize(selectedAsset.fileSize)}</dd>
                </div>
                {selectedAsset.metadata.format && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Format:</dt>
                    <dd className="text-gray-900">{selectedAsset.metadata.format.toUpperCase()}</dd>
                  </div>
                )}
                {selectedAsset.metadata.resolution && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Resolution:</dt>
                    <dd className="text-gray-900">{selectedAsset.metadata.resolution}</dd>
                  </div>
                )}
                {selectedAsset.metadata.duration && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Duration:</dt>
                    <dd className="text-gray-900">{selectedAsset.metadata.duration}s</dd>
                  </div>
                )}
              </dl>
            </div>

            {selectedAsset.tags.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h5 className="font-medium text-gray-900 mb-2">Tags</h5>
                <div className="flex flex-wrap gap-2">
                  {selectedAsset.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800"
                    >
                      <TagIcon className="h-3 w-3 mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedAsset.category && (
              <div className="border-t border-gray-200 pt-4">
                <h5 className="font-medium text-gray-900">Category</h5>
                <p className="text-sm text-gray-600">{selectedAsset.category}</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <button
                onClick={() => window.open(selectedAsset.fileUrl, '_blank')}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <EyeIcon className="h-4 w-4 mr-2" />
                View Asset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}