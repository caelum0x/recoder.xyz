'use client'

import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import { XMarkIcon, DocumentTextIcon, PlayIcon } from '@heroicons/react/24/outline'

interface UnityProject {
  id: string
  name: string
  metadata: {
    unityVersion: string
    template: string
    renderPipeline: string
  }
}

interface UnityScriptGeneratorProps {
  project: UnityProject
  onClose: () => void
  onScriptGenerated: () => void
}

interface GeneratedScript {
  scriptContent: string
  testContent?: string
  files: {
    script: string
    test?: string
  }
}

export default function UnityScriptGenerator({ project, onClose, onScriptGenerated }: UnityScriptGeneratorProps) {
  const [formData, setFormData] = useState({
    scriptName: '',
    scriptType: 'MonoBehaviour',
    namespace: '',
    baseClass: '',
    interfaces: [] as string[],
    functionality: '',
    includeComments: true,
    generateTests: false
  })
  const [loading, setLoading] = useState(false)
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const scriptTypes = [
    { value: 'MonoBehaviour', label: 'MonoBehaviour', description: 'Component script for GameObjects' },
    { value: 'ScriptableObject', label: 'ScriptableObject', description: 'Data container script' },
    { value: 'Editor', label: 'Editor Script', description: 'Unity Editor extension script' },
    { value: 'Custom', label: 'Custom Class', description: 'Plain C# class' }
  ]

  const commonInterfaces = [
    'IPointerClickHandler',
    'IPointerEnterHandler', 
    'IPointerExitHandler',
    'IBeginDragHandler',
    'IDragHandler',
    'IEndDragHandler',
    'ISerializationCallbackReceiver'
  ]

  const scriptExamples = {
    MonoBehaviour: [
      'Player movement controller with WASD input',
      'Enemy AI with pathfinding and state machine',
      'Inventory system with item management',
      'Health system with damage and healing',
      'Audio manager for sound effects and music',
      'UI manager for menu navigation',
      'Camera follow script with smooth movement'
    ],
    ScriptableObject: [
      'Item data container with stats and properties',
      'Game settings configuration',
      'Character stats and abilities',
      'Weapon data with damage and effects',
      'Quest data with objectives and rewards'
    ],
    Editor: [
      'Custom inspector for component properties',
      'Scene view gizmos for visualization',
      'Asset post-processor for import settings',
      'Custom menu items for workflow automation'
    ]
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleInterfaceToggle = (interfaceName: string) => {
    setFormData(prev => ({
      ...prev,
      interfaces: prev.interfaces.includes(interfaceName)
        ? prev.interfaces.filter(i => i !== interfaceName)
        : [...prev.interfaces, interfaceName]
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.scriptName.trim()) {
      newErrors.scriptName = 'Script name is required'
    } else if (!/^[A-Za-z][A-Za-z0-9]*$/.test(formData.scriptName)) {
      newErrors.scriptName = 'Script name must be a valid C# class name'
    }
    
    if (!formData.functionality.trim()) {
      newErrors.functionality = 'Please describe what the script should do'
    } else if (formData.functionality.length < 10) {
      newErrors.functionality = 'Please provide a more detailed description'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleGenerate = async () => {
    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/game-development/unity/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          projectId: project.id,
          ...formData
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedScript(data.data)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate script')
      }
    } catch (error) {
      console.error('Failed to generate script:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate script')
    } finally {
      setLoading(false)
    }
  }

  const handleUseExample = (example: string) => {
    setFormData(prev => ({ ...prev, functionality: example }))
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-6xl w-full bg-white rounded-xl shadow-xl max-h-screen overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <Dialog.Title className="text-lg font-medium text-gray-900">
                Generate Unity Script
              </Dialog.Title>
              <p className="text-sm text-gray-500">Project: {project.name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex h-[calc(100vh-12rem)]">
            {/* Configuration Panel */}
            <div className="w-1/2 p-6 border-r border-gray-200 overflow-y-auto">
              <div className="space-y-6">
                {/* Script Name and Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Script Name *
                    </label>
                    <input
                      type="text"
                      value={formData.scriptName}
                      onChange={(e) => handleInputChange('scriptName', e.target.value)}
                      className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                        errors.scriptName ? 'border-red-500' : ''
                      }`}
                      placeholder="PlayerController"
                    />
                    {errors.scriptName && (
                      <p className="mt-1 text-sm text-red-600">{errors.scriptName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Script Type
                    </label>
                    <select
                      value={formData.scriptType}
                      onChange={(e) => handleInputChange('scriptType', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      {scriptTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Namespace and Base Class */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Namespace (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.namespace}
                      onChange={(e) => handleInputChange('namespace', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="MyGame.Controllers"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Base Class (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.baseClass}
                      onChange={(e) => handleInputChange('baseClass', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="BaseController"
                    />
                  </div>
                </div>

                {/* Interfaces */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Interfaces
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {commonInterfaces.map(interfaceName => (
                      <label
                        key={interfaceName}
                        className={`relative flex cursor-pointer rounded border p-2 focus:outline-none text-sm ${
                          formData.interfaces.includes(interfaceName)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.interfaces.includes(interfaceName)}
                          onChange={() => handleInterfaceToggle(interfaceName)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 font-mono">{interfaceName}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Functionality Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Script Functionality *
                  </label>
                  <textarea
                    value={formData.functionality}
                    onChange={(e) => handleInputChange('functionality', e.target.value)}
                    rows={6}
                    className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                      errors.functionality ? 'border-red-500' : ''
                    }`}
                    placeholder="Describe what the script should do, its main functionality, methods, and behavior..."
                  />
                  {errors.functionality && (
                    <p className="mt-1 text-sm text-red-600">{errors.functionality}</p>
                  )}
                </div>

                {/* Example Suggestions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Example Scripts for {scriptTypes.find(t => t.value === formData.scriptType)?.label}
                  </label>
                  <div className="space-y-1">
                    {(scriptExamples[formData.scriptType as keyof typeof scriptExamples] || []).map((example: string, index: number) => (
                      <button
                        key={index}
                        onClick={() => handleUseExample(example)}
                        className="block w-full text-left text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.includeComments}
                      onChange={(e) => handleInputChange('includeComments', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-900">Include XML documentation comments</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.generateTests}
                      onChange={(e) => handleInputChange('generateTests', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-900">Generate unit tests</span>
                  </label>
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <PlayIcon className="h-4 w-4 mr-2" />
                      Generate Script
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Generated Script Panel */}
            <div className="w-1/2 p-6 overflow-y-auto">
              {!generatedScript ? (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <DocumentTextIcon className="h-12 w-12 mx-auto mb-4" />
                    <p>Configure your script and click "Generate Script" to see the generated code</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-medium text-gray-900">Generated Script</h3>
                      <button
                        onClick={() => copyToClipboard(generatedScript.scriptContent)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Copy Code
                      </button>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                        {generatedScript.scriptContent}
                      </pre>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      File: {generatedScript.files.script}
                    </p>
                  </div>

                  {generatedScript.testContent && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-medium text-gray-900">Generated Tests</h3>
                        <button
                          onClick={() => copyToClipboard(generatedScript.testContent!)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Copy Tests
                        </button>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                        <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                          {generatedScript.testContent}
                        </pre>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        File: {generatedScript.files.test}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        onScriptGenerated()
                        onClose()
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      Use Script
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}