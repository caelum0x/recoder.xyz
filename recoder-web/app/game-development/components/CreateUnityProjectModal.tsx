'use client'

import { useState } from 'react'
import { Dialog } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface CreateUnityProjectModalProps {
  onClose: () => void
  onSubmit: (projectData: any) => Promise<void>
}

export default function CreateUnityProjectModal({ onClose, onSubmit }: CreateUnityProjectModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template: '3D',
    unityVersion: '2022.3.0f1',
    platform: ['Windows'],
    renderPipeline: 'URP',
    features: [],
    isMultiplayer: false,
    analytics: true
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const templates = [
    { value: '2D', label: '2D Game', description: 'Perfect for 2D games, side-scrollers, and puzzle games' },
    { value: '3D', label: '3D Game', description: 'Complete 3D environment with lighting and physics' },
    { value: 'VR', label: 'Virtual Reality', description: 'VR-ready project with VR SDKs and components' },
    { value: 'Mobile', label: 'Mobile Optimized', description: 'Optimized for mobile platforms with touch controls' },
    { value: 'AR', label: 'Augmented Reality', description: 'AR-enabled project with AR Foundation' },
    { value: 'Custom', label: 'Custom Template', description: 'Start with a blank project for custom setup' }
  ]

  const unityVersions = [
    '2023.2.0f1',
    '2022.3.0f1',
    '2021.3.0f1',
    '2020.3.0f1'
  ]

  const platforms = [
    'Windows',
    'Mac', 
    'Linux',
    'iOS',
    'Android',
    'WebGL',
    'Console'
  ]

  const renderPipelines = [
    { value: 'Built-in', label: 'Built-in Render Pipeline', description: 'Unity\'s legacy rendering pipeline' },
    { value: 'URP', label: 'Universal Render Pipeline', description: 'Optimized for performance across platforms' },
    { value: 'HDRP', label: 'High Definition Render Pipeline', description: 'High-fidelity visuals for high-end platforms' }
  ]

  const availableFeatures = [
    'Analytics',
    'Ads',
    'In-App Purchases',
    'Cloud Build',
    'Multiplayer Netcode',
    'Addressables',
    'Visual Scripting',
    'Timeline',
    'Cinemachine',
    'ProBuilder',
    'Terrain Tools',
    'Shader Graph'
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
      platform: prev.platform.includes(platform)
        ? prev.platform.filter(p => p !== platform)
        : [...prev.platform, platform]
    }))
  }

  const handleFeatureToggle = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter(f => f !== feature)
        : [...prev.features, feature]
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required'
    }
    
    if (formData.platform.length === 0) {
      newErrors.platform = 'At least one platform must be selected'
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
      console.error('Error creating project:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-4xl w-full bg-white rounded-xl shadow-xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <Dialog.Title className="text-lg font-medium text-gray-900">
              Create New Unity Project
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
                    placeholder="My Unity Game"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Unity Version
                  </label>
                  <select
                    value={formData.unityVersion}
                    onChange={(e) => handleInputChange('unityVersion', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {unityVersions.map(version => (
                      <option key={version} value={version}>{version}</option>
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
                  placeholder="Brief description of your game project..."
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

              {/* Render Pipeline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Render Pipeline
                </label>
                <div className="space-y-3">
                  {renderPipelines.map(pipeline => (
                    <div
                      key={pipeline.value}
                      className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                        formData.renderPipeline === pipeline.value
                          ? 'border-blue-500 ring-2 ring-blue-500'
                          : 'border-gray-300'
                      }`}
                      onClick={() => handleInputChange('renderPipeline', pipeline.value)}
                    >
                      <div className="flex h-5 items-center">
                        <input
                          type="radio"
                          checked={formData.renderPipeline === pipeline.value}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          readOnly
                        />
                      </div>
                      <div className="ml-3 flex flex-col">
                        <label className="block text-sm font-medium text-gray-900">
                          {pipeline.label}
                        </label>
                        <span className="text-sm text-gray-500">{pipeline.description}</span>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {platforms.map(platform => (
                    <label
                      key={platform}
                      className={`relative flex cursor-pointer rounded-lg border p-3 focus:outline-none ${
                        formData.platform.includes(platform)
                          ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.platform.includes(platform)}
                        onChange={() => handlePlatformToggle(platform)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-900">{platform}</span>
                    </label>
                  ))}
                </div>
                {errors.platform && (
                  <p className="mt-1 text-sm text-red-600">{errors.platform}</p>
                )}
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Unity Features & Packages
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableFeatures.map(feature => (
                    <label
                      key={feature}
                      className={`relative flex cursor-pointer rounded-lg border p-3 focus:outline-none ${
                        formData.features.includes(feature)
                          ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.features.includes(feature)}
                        onChange={() => handleFeatureToggle(feature)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-900">{feature}</span>
                    </label>
                  ))}
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
                      Include multiplayer networking components
                    </span>
                  </div>
                </label>

                <label className="relative flex cursor-pointer rounded-lg border border-gray-300 p-4 focus:outline-none">
                  <input
                    type="checkbox"
                    checked={formData.analytics}
                    onChange={(e) => handleInputChange('analytics', e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="ml-3 flex flex-col">
                    <span className="block text-sm font-medium text-gray-900">
                      Enable Analytics
                    </span>
                    <span className="text-sm text-gray-500">
                      Track project usage and performance
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
                {loading ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}