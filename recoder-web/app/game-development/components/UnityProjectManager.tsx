'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, FolderOpenIcon, PlayIcon, CogIcon, TrashIcon } from '@heroicons/react/24/outline'
import CreateUnityProjectModal from './CreateUnityProjectModal'
import UnityScriptGenerator from './UnityScriptGenerator'

interface UnityProject {
  id: string
  name: string
  description?: string
  type: string
  framework: string
  language: string
  status: string
  metadata: {
    gameEngine: string
    unityVersion: string
    template: string
    platforms: string[]
    renderPipeline: string
    features: string[]
    isMultiplayer: boolean
    projectPath: string
  }
  createdAt: string
  updatedAt: string
}

interface UnityProjectManagerProps {
  onStatsChange: () => void
}

export default function UnityProjectManager({ onStatsChange }: UnityProjectManagerProps) {
  const [projects, setProjects] = useState<UnityProject[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<UnityProject | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showScriptGenerator, setShowScriptGenerator] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/game-development/projects?engine=unity', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setProjects(data.data.projects)
        onStatsChange()
      }
    } catch (error) {
      console.error('Failed to fetch Unity projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (projectData: any) => {
    try {
      const response = await fetch('/api/game-development/unity/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(projectData)
      })

      if (response.ok) {
        const data = await response.json()
        setProjects(prev => [data.data.project, ...prev])
        setShowCreateModal(false)
        onStatsChange()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create project')
      }
    } catch (error) {
      console.error('Failed to create Unity project:', error)
      alert((error instanceof Error ? error.message : String(error)) || 'Failed to create project')
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        setProjects(prev => prev.filter(p => p.id !== projectId))
        setSelectedProject(null)
        onStatsChange()
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'planning': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'archived': return 'bg-gray-100 text-gray-800'
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
          <h2 className="text-xl font-semibold text-gray-900">Unity Projects</h2>
          <p className="text-sm text-gray-600">Manage your Unity game development projects</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
          New Unity Project
        </button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpenIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No Unity projects</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new Unity project.</p>
          <div className="mt-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              New Unity Project
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="relative group bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedProject(project)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h3 className="text-lg font-medium text-gray-900">{project.name}</h3>
                    <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{project.description}</p>
                  
                  <div className="mt-4 space-y-2">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Unity Version:</span> {project.metadata?.unityVersion}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Template:</span> {project.metadata?.template}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Platforms:</span> {project.metadata?.platforms?.join(', ')}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Render Pipeline:</span> {project.metadata?.renderPipeline}
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedProject(project)
                      setShowScriptGenerator(true)
                    }}
                    className="p-2 text-gray-400 hover:text-blue-500"
                    title="Generate Script"
                  >
                    <CogIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteProject(project.id)
                    }}
                    className="p-2 text-gray-400 hover:text-red-500"
                    title="Delete Project"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
              
              <div className="mt-4 text-xs text-gray-500">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Project Details */}
      {selectedProject && !showScriptGenerator && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">{selectedProject.name}</h3>
              <p className="text-sm text-gray-600">{selectedProject.description}</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowScriptGenerator(true)}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <PlayIcon className="-ml-1 mr-2 h-4 w-4" />
                Generate Script
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-900">Project Details</h4>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Engine:</dt>
                  <dd className="text-gray-900">{selectedProject.metadata?.gameEngine}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Unity Version:</dt>
                  <dd className="text-gray-900">{selectedProject.metadata?.unityVersion}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Template:</dt>
                  <dd className="text-gray-900">{selectedProject.metadata?.template}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Language:</dt>
                  <dd className="text-gray-900">{selectedProject.language}</dd>
                </div>
              </dl>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900">Configuration</h4>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Render Pipeline:</dt>
                  <dd className="text-gray-900">{selectedProject.metadata?.renderPipeline}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Multiplayer:</dt>
                  <dd className="text-gray-900">{selectedProject.metadata?.isMultiplayer ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Platforms:</dt>
                  <dd className="text-gray-900">{selectedProject.metadata?.platforms?.join(', ')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Features:</dt>
                  <dd className="text-gray-900">{selectedProject.metadata?.features?.join(', ')}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateUnityProjectModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateProject}
        />
      )}

      {showScriptGenerator && selectedProject && (
        <UnityScriptGenerator
          project={selectedProject}
          onClose={() => setShowScriptGenerator(false)}
          onScriptGenerated={() => {
            setShowScriptGenerator(false)
            // Refresh projects or update UI as needed
          }}
        />
      )}
    </div>
  )
}