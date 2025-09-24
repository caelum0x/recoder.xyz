'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, PlayIcon, CodeBracketIcon, TrashIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import VisualScriptingEditor from './VisualScriptingEditor'

interface VisualScript {
  id: string
  name: string
  description: string
  nodes: any[]
  connections: any[]
  variables: any[]
  compiledCode: string
  framework: string
  status: string
  createdAt: string
  updatedAt: string
  project: {
    name: string
    framework: string
  }
}

interface VisualScriptManagerProps {
  onStatsChange: () => void
}

export default function VisualScriptManager({ onStatsChange }: VisualScriptManagerProps) {
  const [scripts, setScripts] = useState<VisualScript[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [projects, setProjects] = useState<Array<{ id: string; name: string; framework: string }>>([])
  const [showEditor, setShowEditor] = useState(false)
  const [editingScript, setEditingScript] = useState<VisualScript | null>(null)
  const [selectedScript, setSelectedScript] = useState<VisualScript | null>(null)
  const [showCompiledCode, setShowCompiledCode] = useState(false)

  useEffect(() => {
    fetchScripts()
    fetchProjects()
  }, [])

  useEffect(() => {
    if (selectedProject) {
      fetchScripts()
    }
  }, [selectedProject])

  const fetchScripts = async () => {
    try {
      setLoading(true)
      const url = selectedProject === 'all' 
        ? '/api/game-development/visual-scripts'
        : `/api/game-development/visual-scripts?projectId=${selectedProject}`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setScripts(data.data.scripts)
        onStatsChange()
      }
    } catch (error) {
      console.error('Failed to fetch visual scripts:', error)
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

  const handleCreateScript = (projectId: string) => {
    setEditingScript(null)
    setSelectedProject(projectId)
    setShowEditor(true)
  }

  const handleEditScript = (script: VisualScript) => {
    setEditingScript(script)
    setShowEditor(true)
  }

  const handleSaveScript = (script: any) => {
    fetchScripts()
    setShowEditor(false)
    setEditingScript(null)
  }

  const handleDeleteScript = async (scriptId: string) => {
    if (!confirm('Are you sure you want to delete this visual script?')) {
      return
    }

    try {
      const response = await fetch(`/api/game-development/visual-scripts/${scriptId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        setScripts(prev => prev.filter(s => s.id !== scriptId))
        setSelectedScript(null)
        onStatsChange()
      }
    } catch (error) {
      console.error('Failed to delete visual script:', error)
      alert('Failed to delete visual script')
    }
  }

  const handleCompileScript = async (scriptId: string) => {
    try {
      const response = await fetch(`/api/game-development/visual-scripts/${scriptId}/compile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setScripts(prev => prev.map(script => 
          script.id === scriptId 
            ? { ...script, compiledCode: data.data.compiledCode }
            : script
        ))
        alert('Visual script compiled successfully!')
      }
    } catch (error) {
      console.error('Failed to compile visual script:', error)
      alert('Failed to compile visual script')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'error': return 'bg-red-100 text-red-800'
      case 'draft': return 'bg-yellow-100 text-yellow-800'
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
          <h2 className="text-xl font-semibold text-gray-900">Visual Script Manager</h2>
          <p className="text-sm text-gray-600">Create and manage visual scripts for your game projects</p>
        </div>
        
        <div className="flex items-center space-x-3">
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
          
          {selectedProject !== 'all' && (
            <button
              onClick={() => handleCreateScript(selectedProject)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              New Visual Script
            </button>
          )}
        </div>
      </div>

      {/* Scripts Grid */}
      {scripts.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No visual scripts</h3>
          <p className="mt-1 text-sm text-gray-500">
            {selectedProject === 'all' 
              ? 'Create your first visual script by selecting a project.'
              : 'Get started by creating a new visual script for this project.'
            }
          </p>
          {selectedProject !== 'all' && (
            <div className="mt-6">
              <button
                onClick={() => handleCreateScript(selectedProject)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                New Visual Script
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Scripts List */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Visual Scripts</h3>
            {scripts.map((script) => (
              <div
                key={script.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedScript?.id === script.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedScript(script)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="text-lg font-medium text-gray-900">{script.name}</h4>
                    <p className="text-sm text-gray-500">{script.description}</p>
                    
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                      <span>Project: {script.project.name}</span>
                      <span>Framework: {script.project.framework}</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(script.status)}`}>
                        {script.status}
                      </span>
                    </div>
                    
                    <div className="mt-2 text-xs text-gray-500">
                      Nodes: {script.nodes.length} | 
                      Connections: {script.connections.length} | 
                      Variables: {script.variables.length}
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditScript(script)
                      }}
                      className="p-2 text-gray-400 hover:text-blue-500"
                      title="Edit Script"
                    >
                      <DocumentTextIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCompileScript(script.id)
                      }}
                      className="p-2 text-gray-400 hover:text-green-500"
                      title="Compile Script"
                    >
                      <PlayIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteScript(script.id)
                      }}
                      className="p-2 text-gray-400 hover:text-red-500"
                      title="Delete Script"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Script Details */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Script Details</h3>
            {selectedScript ? (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900">{selectedScript.name}</h4>
                    <p className="text-sm text-gray-600">{selectedScript.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Project:</span>
                      <span className="ml-2 text-gray-600">{selectedScript.project.name}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Framework:</span>
                      <span className="ml-2 text-gray-600">{selectedScript.project.framework}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Status:</span>
                      <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedScript.status)}`}>
                        {selectedScript.status}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Updated:</span>
                      <span className="ml-2 text-gray-600">
                        {new Date(selectedScript.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h5 className="font-medium text-gray-900 mb-2">Script Structure</h5>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div>Nodes: {selectedScript.nodes.length}</div>
                      <div>Connections: {selectedScript.connections.length}</div>
                      <div>Variables: {selectedScript.variables.length}</div>
                    </div>
                  </div>

                  {selectedScript.compiledCode && (
                    <div className="border-t border-gray-200 pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="font-medium text-gray-900">Compiled Code</h5>
                        <button
                          onClick={() => setShowCompiledCode(!showCompiledCode)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {showCompiledCode ? 'Hide' : 'Show'} Code
                        </button>
                      </div>
                      
                      {showCompiledCode && (
                        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                          <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                            {selectedScript.compiledCode}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => handleEditScript(selectedScript)}
                      className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                    >
                      <DocumentTextIcon className="h-4 w-4 mr-2" />
                      Edit Script
                    </button>
                    <button
                      onClick={() => handleCompileScript(selectedScript.id)}
                      className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <PlayIcon className="h-4 w-4 mr-2" />
                      Compile
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-500">
                Select a visual script to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Script Editor Modal */}
      {showEditor && (
        <VisualScriptingEditor
          projectId={selectedProject}
          onClose={() => setShowEditor(false)}
          onSave={handleSaveScript}
          initialScript={editingScript ?? undefined}
        />
      )}
    </div>
  )
}