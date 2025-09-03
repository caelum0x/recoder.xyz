'use client'

import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VideoEditor } from './video-editor'

import { Upload, Film, Music, Palette, Package, Download, Zap } from 'lucide-react'
import { toast } from 'sonner'

interface MediaFile {
  id: string
  filename: string
  originalName: string
  size: number
  format: string
  mimeType: string
  thumbnailUrl?: string
  uploadProgress?: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
}

export function MediaStudio() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [activeTab, setActiveTab] = useState('upload')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true)
    
    for (const file of acceptedFiles) {
      const tempId = `temp_${Date.now()}_${Math.random()}`
      const mediaFile: MediaFile = {
        id: tempId,
        filename: file.name,
        originalName: file.name,
        size: file.size,
        format: file.name.split('.').pop() || '',
        mimeType: file.type,
        uploadProgress: 0,
        status: 'uploading'
      }

      setFiles(prev => [...prev, mediaFile])

      try {
        await uploadFile(file, tempId)
      } catch (error) {
        console.error('Upload failed:', error)
        setFiles(prev => prev.map(f => 
          f.id === tempId ? { ...f, status: 'error' } : f
        ))
        toast.error(`Failed to upload ${file.name}`)
      }
    }
    
    setIsUploading(false)
  }, [])

  const uploadFile = async (file: File, tempId: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('purpose', 'media-processing')

    const response = await fetch('/api/media-processing/upload', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error('Upload failed')
    }

    const result = await response.json()
    
    setFiles(prev => prev.map(f => 
      f.id === tempId ? {
        ...f,
        id: result.file.id,
        status: 'completed',
        uploadProgress: 100,
        thumbnailUrl: result.file.thumbnailUrl
      } : f
    ))

    toast.success(`${file.name} uploaded successfully`)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.wmv', '.webm'],
      'audio/*': ['.mp3', '.wav', '.flac', '.aac'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    },
    maxSize: 500 * 1024 * 1024 // 500MB
  })

  const handleFileSelect = (fileId: string, selected: boolean) => {
    setSelectedFiles(prev => 
      selected 
        ? [...prev, fileId]
        : prev.filter(id => id !== fileId)
    )
  }

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case 'upload': return <Upload className="w-4 h-4" />
      case 'video': return <Film className="w-4 h-4" />
      case 'audio': return <Music className="w-4 h-4" />
      case 'templates': return <Palette className="w-4 h-4" />
      case 'batch': return <Package className="w-4 h-4" />
      case 'export': return <Download className="w-4 h-4" />
      default: return null
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Zap className="w-6 h-6 text-primary" />
                Media Studio
              </h1>
              <p className="text-muted-foreground">
                Professional media processing with FFmpeg - Create content for apps, campaigns, and ads
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {files.length} files
              </Badge>
              <Badge variant="outline">
                {selectedFiles.length} selected
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              {getTabIcon('upload')}
              Upload
            </TabsTrigger>
            <TabsTrigger value="video" className="flex items-center gap-2">
              {getTabIcon('video')}
              Video
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex items-center gap-2">
              {getTabIcon('audio')}
              Audio
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              {getTabIcon('templates')}
              Templates
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              {getTabIcon('batch')}
              Batch
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              {getTabIcon('export')}
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="h-full">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              <div className="lg:col-span-2">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Upload Media Files</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      {...getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                        isDragActive 
                          ? 'border-primary bg-primary/5' 
                          : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      {isDragActive ? (
                        <p className="text-lg font-medium">Drop files here...</p>
                      ) : (
                        <div>
                          <p className="text-lg font-medium mb-2">
                            Drag & drop files here, or click to browse
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Supports video, audio, and image files up to 500MB
                          </p>
                        </div>
                      )}
                    </div>

                    {isUploading && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Uploading files...</span>
                        </div>
                        <Progress value={75} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>File Library</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {files.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No files uploaded yet
                        </p>
                      ) : (
                        files.map(file => (
                          <div
                            key={file.id}
                            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                            onClick={() => handleFileSelect(
                              file.id, 
                              !selectedFiles.includes(file.id)
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedFiles.includes(file.id)}
                              onChange={(e) => handleFileSelect(file.id, e.target.checked)}
                              className="rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {file.originalName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {(file.size / 1024 / 1024).toFixed(1)} MB • {file.format.toUpperCase()}
                              </p>
                              {file.uploadProgress !== undefined && file.uploadProgress < 100 && (
                                <Progress value={file.uploadProgress} className="mt-1" />
                              )}
                            </div>
                            <Badge 
                              variant={
                                file.status === 'completed' ? 'default' :
                                file.status === 'error' ? 'destructive' :
                                'secondary'
                              }
                            >
                              {file.status}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="video" className="h-full">
            <VideoEditor selectedFiles={selectedFiles} files={files} />
          </TabsContent>

          <TabsContent value="audio" className="h-full">
            <AudioProcessor selectedFiles={selectedFiles} files={files} />
          </TabsContent>

          <TabsContent value="templates" className="h-full">
            <TemplateGallery selectedFiles={selectedFiles} files={files} />
          </TabsContent>

          <TabsContent value="batch" className="h-full">
            <BatchProcessor selectedFiles={selectedFiles} files={files} />
          </TabsContent>

          <TabsContent value="export" className="h-full">
            <ExportManager selectedFiles={selectedFiles} files={files} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
