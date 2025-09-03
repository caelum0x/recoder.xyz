'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Instagram, Youtube, Facebook, Twitter, Linkedin, Zap, Star, Users, Play } from 'lucide-react'
import { toast } from 'sonner'

interface Template {
  id: string
  name: string
  description: string
  category: string
  platforms: string[]
  format: string
  featured: boolean
  popularity: number
  previewUrl?: string
  customizations: Record<string, any>
}

interface TemplateGalleryProps {
  selectedFiles: string[]
  files: any[]
}

export function TemplateGallery({ selectedFiles, files }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [customizations, setCustomizations] = useState<Record<string, any>>({})
  const [isApplying, setIsApplying] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchTemplates()
  }, [])

  useEffect(() => {
    filterTemplates()
  }, [templates, activeCategory, searchQuery])

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/media-processing/templates')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates)
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error)
      // Fallback to mock data
      setTemplates(mockTemplates)
    }
  }

  const filterTemplates = () => {
    let filtered = templates

    if (activeCategory !== 'all') {
      filtered = filtered.filter(template => template.category === activeCategory)
    }

    if (searchQuery) {
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredTemplates(filtered)
  }

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'instagram': return <Instagram className="w-4 h-4" />
      case 'youtube': return <Youtube className="w-4 h-4" />
      case 'facebook': return <Facebook className="w-4 h-4" />
      case 'twitter': return <Twitter className="w-4 h-4" />
      case 'linkedin': return <Linkedin className="w-4 h-4" />
      default: return <Zap className="w-4 h-4" />
    }
  }

  const applyTemplate = async () => {
    if (!selectedTemplate || selectedFiles.length === 0) {
      toast.error('Please select a template and files')
      return
    }

    setIsApplying(true)

    try {
      const response = await fetch('/api/media-processing/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          fileIds: selectedFiles,
          customizations,
          projectId: 'current-project' // You might want to get this from context
        })
      })

      if (!response.ok) {
        throw new Error('Failed to apply template')
      }

      const result = await response.json()
      toast.success(`Template applied successfully! ${result.outputFiles.length} files will be processed.`)
      setSelectedTemplate(null)
      setCustomizations({})

    } catch (error) {
      console.error('Template application error:', error)
      toast.error('Failed to apply template')
    } finally {
      setIsApplying(false)
    }
  }

  const handleCustomizationChange = (key: string, value: any) => {
    setCustomizations(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const renderCustomizationInput = (key: string, config: any) => {
    switch (config.type) {
      case 'text':
        return (
          <div key={key} className="space-y-2">
            <Label>{key.charAt(0).toUpperCase() + key.slice(1)}</Label>
            <Input
              value={customizations[key] || config.default || ''}
              onChange={(e) => handleCustomizationChange(key, e.target.value)}
              placeholder={config.default}
            />
          </div>
        )

      case 'color':
        return (
          <div key={key} className="space-y-2">
            <Label>{key.charAt(0).toUpperCase() + key.slice(1)}</Label>
            <Input
              type="color"
              value={customizations[key] || config.default || '#000000'}
              onChange={(e) => handleCustomizationChange(key, e.target.value)}
            />
          </div>
        )

      case 'boolean':
        return (
          <div key={key} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={customizations[key] !== undefined ? customizations[key] : config.default}
              onChange={(e) => handleCustomizationChange(key, e.target.checked)}
              className="rounded"
            />
            <Label>{key.charAt(0).toUpperCase() + key.slice(1)}</Label>
          </div>
        )

      case 'select':
        return (
          <div key={key} className="space-y-2">
            <Label>{key.charAt(0).toUpperCase() + key.slice(1)}</Label>
            <Select
              value={customizations[key] || config.default}
              onValueChange={(value) => handleCustomizationChange(key, value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.options?.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      default:
        return null
    }
  }

  const categories = [
    { value: 'all', label: 'All Templates' },
    { value: 'social', label: 'Social Media' },
    { value: 'ads', label: 'Advertising' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'branding', label: 'Branding' }
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Campaign Templates</h2>
            <p className="text-sm text-muted-foreground">
              Professional templates for social media, ads, and campaigns
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            {categories.map(category => (
              <TabsTrigger key={category.value} value={category.value}>
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map(template => (
            <Card key={template.id} className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {template.name}
                      {template.featured && (
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="secondary">
                    {template.category}
                  </Badge>
                  <Badge variant="outline">
                    {template.format}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                {/* Platforms */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-muted-foreground">Platforms:</span>
                  <div className="flex gap-1">
                    {template.platforms.slice(0, 4).map(platform => (
                      <div
                        key={platform}
                        className="p-1 bg-muted rounded"
                        title={platform}
                      >
                        {getPlatformIcon(platform)}
                      </div>
                    ))}
                    {template.platforms.length > 4 && (
                      <div className="p-1 bg-muted rounded text-xs">
                        +{template.platforms.length - 4}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {template.popularity} uses
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {template.previewUrl && (
                    <Button variant="outline" size="sm" className="flex-1">
                      <Play className="w-3 h-3 mr-1" />
                      Preview
                    </Button>
                  )}
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => {
                          setSelectedTemplate(template)
                          // Initialize customizations with defaults
                          const defaults: Record<string, any> = {}
                          Object.entries(template.customizations).forEach(([key, config]) => {
                            defaults[key] = (config as any).default
                          })
                          setCustomizations(defaults)
                        }}
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Use Template
                      </Button>
                    </DialogTrigger>

                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Customize Template: {template.name}</DialogTitle>
                      </DialogHeader>

                      {selectedTemplate && (
                        <div className="space-y-6">
                          <div>
                            <h4 className="font-medium mb-2">Selected Files</h4>
                            <p className="text-sm text-muted-foreground">
                              {selectedFiles.length} files selected
                            </p>
                          </div>

                          {Object.keys(selectedTemplate.customizations).length > 0 && (
                            <div>
                              <h4 className="font-medium mb-4">Customization Options</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(selectedTemplate.customizations).map(([key, config]) =>
                                  renderCustomizationInput(key, config)
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                              Cancel
                            </Button>
                            <Button 
                              onClick={applyTemplate}
                              disabled={isApplying || selectedFiles.length === 0}
                            >
                              {isApplying ? 'Applying...' : 'Apply Template'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No templates found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Mock templates for fallback
const mockTemplates: Template[] = [
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    description: 'Perfect vertical video for Instagram Stories with branded overlay',
    category: 'social',
    platforms: ['instagram'],
    format: 'video',
    featured: true,
    popularity: 150,
    customizations: {
      brandName: { type: 'text', default: 'Your Brand' },
      backgroundColor: { type: 'color', default: '#000000' }
    }
  },
  {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    description: 'Eye-catching thumbnail template for YouTube videos',
    category: 'social',
    platforms: ['youtube'],
    format: 'image',
    featured: true,
    popularity: 120,
    customizations: {
      title: { type: 'text', default: 'AMAZING VIDEO!' },
      titleColor: { type: 'color', default: '#ff0000' }
    }
  },
  {
    id: 'facebook-ad',
    name: 'Facebook Ad',
    description: 'Conversion-optimized video template for Facebook advertising',
    category: 'ads',
    platforms: ['facebook'],
    format: 'video',
    featured: true,
    popularity: 180,
    customizations: {
      callToAction: { type: 'text', default: 'Shop Now!' },
      accentColor: { type: 'color', default: '#1877f2' }
    }
  }
]
