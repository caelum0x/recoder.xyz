'use client'

import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import { XMarkIcon, DocumentTextIcon, PlayIcon } from '@heroicons/react/24/outline'

interface UnrealProject {
  id: string
  name: string
  metadata: {
    engineVersion: string
    template: string
    blueprintOnly: boolean
    renderingFeatures: {
      rayTracing: boolean
      lumen: boolean
      nanite: boolean
      virtualShadowMaps: boolean
    }
  }
}

interface UnrealScriptGeneratorProps {
  project: UnrealProject
  onClose: () => void
  onScriptGenerated: () => void
}

interface GeneratedScript {
  scriptContent: string
  blueprintContent?: string
  headerContent?: string
  files: {
    script: string
    header?: string
    blueprint?: string
  }
}

export default function UnrealScriptGenerator({ project, onClose, onScriptGenerated }: UnrealScriptGeneratorProps) {
  const [formData, setFormData] = useState({
    scriptName: '',
    scriptType: 'ActorComponent',
    scriptLanguage: project.metadata.blueprintOnly ? 'Blueprint' : 'C++',
    baseClass: '',
    includeHeader: true,
    generateBlueprint: false,
    functionality: '',
    includeComments: true,
    generateTests: false,
    useUE5Features: parseFloat(project.metadata.engineVersion) >= 5.0
  })
  const [loading, setLoading] = useState(false)
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const scriptTypes = [
    { value: 'Actor', label: 'Actor', description: 'Base class for objects that can be placed in a level' },
    { value: 'ActorComponent', label: 'ActorComponent', description: 'Component that can be attached to Actors' },
    { value: 'Pawn', label: 'Pawn', description: 'Actor that can be possessed by PlayerController or AI' },
    { value: 'Character', label: 'Character', description: 'Pawn with built-in movement and collision' },
    { value: 'PlayerController', label: 'PlayerController', description: 'Handles input and controls Pawns' },
    { value: 'GameMode', label: 'GameMode', description: 'Defines the rules and flow of the game' },
    { value: 'Widget', label: 'UserWidget', description: 'Base class for UI widgets' },
    { value: 'Object', label: 'UObject', description: 'Base Unreal Engine object class' },
    { value: 'Interface', label: 'Interface', description: 'Pure virtual interface class' },
    { value: 'Subsystem', label: 'Subsystem', description: 'Auto-instanced and managed system' }
  ]

  const scriptLanguages = [
    { value: 'C++', label: 'C++', description: 'Native C++ implementation with Blueprint exposure' },
    { value: 'Blueprint', label: 'Blueprint', description: 'Visual scripting system (Blueprint only)' },
    { value: 'Hybrid', label: 'C++ + Blueprint', description: 'C++ base with Blueprint extension' }
  ]

  const scriptExamples = {
    Actor: [
      'Interactive pickup item with physics and sound effects',
      'Destructible environment object with particle effects',
      'Moving platform with spline-based movement',
      'Trigger volume that activates gameplay events',
      'Spawnable projectile with collision and damage'
    ],
    ActorComponent: [
      'Health component with damage handling and regeneration',
      'Inventory component with item management and UI',
      'Audio component with 3D spatial audio and occlusion',
      'Movement component with custom physics behavior',
      'Interaction component with highlight and prompt system'
    ],
    Character: [
      'Third person character with enhanced input system',
      'Multiplayer character with network replication',
      'Character with climbing and parkour abilities',
      'RPG character with stats, skills and equipment',
      'Vehicle character with wheel physics and suspension'
    ],
    PlayerController: [
      'Enhanced input controller with customizable key bindings',
      'Camera controller with smooth transitions and shake',
      'UI controller with menu navigation and HUD management',
      'Save system controller with progress persistence',
      'Network controller for multiplayer sessions'
    ],
    Widget: [
      'Main menu with smooth transitions and animations',
      'HUD widget with health bar, minimap and notifications',
      'Inventory UI with drag and drop functionality',
      'Settings menu with graphics and audio options',
      'Dialog system with character portraits and choices'
    ]
  }

  const ue5Features = [
    'Lumen Dynamic Lighting',
    'Nanite Virtualized Geometry',
    'Chaos Physics System',
    'MetaSound Audio System',
    'World Partition',
    'Enhanced Input System'
  ]

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.scriptName.trim()) {
      newErrors.scriptName = 'Script name is required'
    } else if (!/^[A-Z][A-Za-z0-9]*$/.test(formData.scriptName)) {
      newErrors.scriptName = 'Script name must be PascalCase and start with uppercase letter'
    }
    
    if (!formData.functionality.trim()) {
      newErrors.functionality = 'Please describe what the script should do'
    } else if (formData.functionality.length < 15) {
      newErrors.functionality = 'Please provide a more detailed description (minimum 15 characters)'
    }

    if (formData.scriptLanguage === 'Blueprint' && project.metadata.blueprintOnly === false) {
      // This is fine - they can create Blueprint scripts in C++ projects
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
      const response = await fetch('/api/game-development/unreal/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          projectId: project.id,
          ...formData,
          projectMetadata: project.metadata
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
      console.error('Failed to generate Unreal script:', error)
      alert(error.message || 'Failed to generate script')
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
                Generate Unreal Engine Script
              </Dialog.Title>
              <p className="text-sm text-gray-500">
                Project: {project.name} (UE{project.metadata.engineVersion})
              </p>
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
                      Class Name *
                    </label>
                    <input
                      type="text"
                      value={formData.scriptName}
                      onChange={(e) => handleInputChange('scriptName', e.target.value)}
                      className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                        errors.scriptName ? 'border-red-500' : ''
                      }`}
                      placeholder="AMyPlayerCharacter"
                    />
                    {errors.scriptName && (
                      <p className="mt-1 text-sm text-red-600">{errors.scriptName}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">Use UE naming convention (A prefix for Actors, U for Objects)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Base Class Type
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
                    <p className="mt-1 text-xs text-gray-500">
                      {scriptTypes.find(t => t.value === formData.scriptType)?.description}
                    </p>
                  </div>
                </div>

                {/* Script Language */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Implementation Language
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {scriptLanguages
                      .filter(lang => !project.metadata.blueprintOnly || lang.value !== 'C++')
                      .map(language => (
                      <label
                        key={language.value}
                        className={`relative flex cursor-pointer rounded-lg border p-3 focus:outline-none ${
                          formData.scriptLanguage === language.value
                            ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50'
                            : 'border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          checked={formData.scriptLanguage === language.value}
                          onChange={() => handleInputChange('scriptLanguage', language.value)}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div className="ml-3">
                          <span className="block text-sm font-medium text-gray-900">{language.label}</span>
                          <span className="text-xs text-gray-500">{language.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Custom Base Class */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Custom Base Class (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.baseClass}
                    onChange={(e) => handleInputChange('baseClass', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="UMyBaseComponent"
                  />
                  <p className="mt-1 text-xs text-gray-500">Override default base class (e.g., UMyCustomBaseActor)</p>
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
                    placeholder="Describe what the script should do, its main functionality, methods, and behavior. Be specific about Unreal Engine features you want to use..."
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
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(scriptExamples[formData.scriptType] || []).map((example, index) => (
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

                {/* UE5 Features */}
                {formData.useUE5Features && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Available UE5 Features
                    </label>
                    <div className="text-xs text-gray-600 space-y-1">
                      {ue5Features.map(feature => (
                        <div key={feature} className="flex items-center">
                          <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Options */}
                <div className="space-y-3">
                  {formData.scriptLanguage === 'C++' && (
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.includeHeader}
                        onChange={(e) => handleInputChange('includeHeader', e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-900">Generate header file (.h)</span>
                    </label>
                  )}

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.generateBlueprint}
                      onChange={(e) => handleInputChange('generateBlueprint', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-900">Generate Blueprint wrapper</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.includeComments}
                      onChange={(e) => handleInputChange('includeComments', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-900">Include detailed comments and documentation</span>
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

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.useUE5Features}
                      onChange={(e) => handleInputChange('useUE5Features', e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      disabled={parseFloat(project.metadata.engineVersion) < 5.0}
                    />
                    <span className="ml-2 text-sm text-gray-900">Use UE5-specific features and APIs</span>
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
                      Generate Unreal Script
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
                    <p>Configure your Unreal Engine script and click "Generate Script" to see the generated code</p>
                    <div className="mt-4 text-sm text-gray-400">
                      <p>Supports: C++, Blueprints, UE5 features</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Generated C++ Script */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-medium text-gray-900">
                        Generated {formData.scriptLanguage} Script
                      </h3>
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

                  {/* Generated Header File */}
                  {generatedScript.headerContent && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-medium text-gray-900">Generated Header File</h3>
                        <button
                          onClick={() => copyToClipboard(generatedScript.headerContent!)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Copy Header
                        </button>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                        <pre className="text-blue-400 text-sm font-mono whitespace-pre-wrap">
                          {generatedScript.headerContent}
                        </pre>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        File: {generatedScript.files.header}
                      </p>
                    </div>
                  )}

                  {/* Generated Blueprint */}
                  {generatedScript.blueprintContent && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-medium text-gray-900">Blueprint Configuration</h3>
                        <button
                          onClick={() => copyToClipboard(generatedScript.blueprintContent!)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Copy Blueprint
                        </button>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                        <pre className="text-purple-400 text-sm font-mono whitespace-pre-wrap">
                          {generatedScript.blueprintContent}
                        </pre>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        File: {generatedScript.files.blueprint}
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