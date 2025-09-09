'use client'

import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface CreateUnrealProjectModalProps {
  onClose: () => void
  onSubmit: (projectData: any) => Promise<void>
}

export default function CreateUnrealProjectModal({ onClose, onSubmit }: CreateUnrealProjectModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template: 'Blank',
    engineVersion: '5.3',
    targetPlatforms: ['Windows'],
    renderingFeatures: {
      rayTracing: false,
      lumen: true,
      nanite: true,
      virtualShadowMaps: true
    },
    isMultiplayer: false,
    blueprintOnly: false
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const templates = [
    { value: 'Blank', label: 'Blank Project', description: 'Empty project with minimal content' },
    { value: 'First Person', label: 'First Person', description: 'First person shooter template with basic mechanics' },
    { value: 'Third Person', label: 'Third Person', description: 'Third person adventure template' },
    { value: 'Top Down', label: 'Top Down', description: 'Top-down perspective game template' },
    { value: 'Vehicle', label: 'Vehicle Game', description: 'Advanced vehicle physics and controls' },
    { value: 'VR', label: 'Virtual Reality', description: 'VR-ready project with hand tracking' },
    { value: 'AR', label: 'Augmented Reality', description: 'AR project with camera integration' }
  ]

  const engineVersions = [
    '5.4',
    '5.3', 
    '5.2',
    '5.1',
    '5.0'
  ]

  const platforms = [
    'Windows',
    'Mac',
    'Linux', 
    'iOS',
    'Android',
    'Console'
  ]

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handlePlatformToggle = (platform: string) => {
    setFormData(prev => ({
      ...prev,
      targetPlatforms: prev.targetPlatforms.includes(platform)
        ? prev.targetPlatforms.filter(p => p !== platform)
        : [...prev.targetPlatforms, platform]
    }))
  }

  const handleRenderingFeatureToggle = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      renderingFeatures: {
        ...prev.renderingFeatures,
        [feature]: !prev.renderingFeatures[feature as keyof typeof prev.renderingFeatures]
      }
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required'
    } else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(formData.name)) {
      newErrors.name = 'Project name must start with a letter and contain only letters, numbers, and underscores'
    }
    
    if (formData.targetPlatforms.length === 0) {
      newErrors.targetPlatforms = 'At least one target platform must be selected'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      await onSubmit(formData)
    } catch (error) {
      console.error('Error creating Unreal project:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-4xl w-full bg-white rounded-xl shadow-xl max-h-screen overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <Dialog.Title className="text-lg font-medium text-gray-900">
              Create New Unreal Engine Project
            </Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                      errors.name ? 'border-red-500' : ''
                    }`}
                    placeholder="MyUnrealGame"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Engine Version
                  </label>
                  <select
                    value={formData.engineVersion}
                    onChange={(e) => handleInputChange('engineVersion', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {engineVersions.map(version => (
                      <option key={version} value={version}>Unreal Engine {version}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Brief description of your Unreal Engine project..."
                />
              </div>

              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Project Template
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map(template => (
                    <div
                      key={template.value}
                      className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                        formData.template === template.value
                          ? 'border-blue-500 ring-2 ring-blue-500'
                          : 'border-gray-300'
                      }`}
                      onClick={() => handleInputChange('template', template.value)}
                    >
                      <div className="flex h-5 items-center">
                        <input
                          type="radio"
                          checked={formData.template === template.value}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          readOnly
                        />
                      </div>
                      <div className="ml-3 flex flex-col">
                        <label className="block text-sm font-medium text-gray-900">
                          {template.label}
                        </label>
                        <span className="text-sm text-gray-500">{template.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Platforms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Target Platforms *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {platforms.map(platform => (
                    <label
                      key={platform}
                      className={`relative flex cursor-pointer rounded-lg border p-3 focus:outline-none ${
                        formData.targetPlatforms.includes(platform)
                          ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.targetPlatforms.includes(platform)}
                        onChange={() => handlePlatformToggle(platform)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-900">{platform}</span>
                    </label>
                  ))}
                </div>
                {errors.targetPlatforms && (
                  <p className="mt-1 text-sm text-red-600">{errors.targetPlatforms}</p>
                )}
              </div>

              {/* Rendering Features */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Rendering Features (UE5)
                </label>
                <div className="space-y-3">
                  <label className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                    formData.renderingFeatures.rayTracing ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.renderingFeatures.rayTracing}
                      onChange={() => handleRenderingFeatureToggle('rayTracing')}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="ml-3 flex flex-col">
                      <span className="block text-sm font-medium text-gray-900">Ray Tracing</span>
                      <span className="text-sm text-gray-500">Hardware ray tracing for realistic lighting and reflections</span>
                    </div>
                  </label>

                  <label className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                    formData.renderingFeatures.lumen ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.renderingFeatures.lumen}
                      onChange={() => handleRenderingFeatureToggle('lumen')}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="ml-3 flex flex-col">
                      <span className="block text-sm font-medium text-gray-900">Lumen Global Illumination</span>
                      <span className="text-sm text-gray-500">Dynamic global illumination and reflections system</span>
                    </div>
                  </label>

                  <label className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                    formData.renderingFeatures.nanite ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.renderingFeatures.nanite}
                      onChange={() => handleRenderingFeatureToggle('nanite')}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="ml-3 flex flex-col">
                      <span className="block text-sm font-medium text-gray-900">Nanite Virtualized Geometry</span>
                      <span className="text-sm text-gray-500">High-detail geometry rendering without performance loss</span>
                    </div>
                  </label>

                  <label className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                    formData.renderingFeatures.virtualShadowMaps ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.renderingFeatures.virtualShadowMaps}
                      onChange={() => handleRenderingFeatureToggle('virtualShadowMaps')}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="ml-3 flex flex-col">
                      <span className="block text-sm font-medium text-gray-900">Virtual Shadow Maps</span>
                      <span className="text-sm text-gray-500">High-resolution shadow mapping for detailed shadows</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Additional Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="relative flex cursor-pointer rounded-lg border border-gray-300 p-4 focus:outline-none">
                  <input
                    type="checkbox"
                    checked={formData.isMultiplayer}
                    onChange={(e) => handleInputChange('isMultiplayer', e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="ml-3 flex flex-col">
                    <span className="block text-sm font-medium text-gray-900">
                      Enable Multiplayer
                    </span>
                    <span className="text-sm text-gray-500">
                      Include multiplayer networking and replication
                    </span>
                  </div>
                </label>

                <label className="relative flex cursor-pointer rounded-lg border border-gray-300 p-4 focus:outline-none">
                  <input
                    type="checkbox"
                    checked={formData.blueprintOnly}
                    onChange={(e) => handleInputChange('blueprintOnly', e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="ml-3 flex flex-col">
                    <span className="block text-sm font-medium text-gray-900">
                      Blueprint Only Project
                    </span>
                    <span className="text-sm text-gray-500">
                      Use only Blueprints, no C++ code
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Unreal Project'}
              </button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}