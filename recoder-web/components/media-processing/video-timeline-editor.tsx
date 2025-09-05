'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Play, Pause, SkipBack, SkipForward, Scissors, Copy, Trash2, 
  Volume2, Settings, Download, Upload, Cloud, Layers, 
  Plus, Minus, RotateCcw, Save, Share, ZoomIn, ZoomOut,
  Maximize2, Minimize2, Grid3X3, Wand2, Palette, Music
} from 'lucide-react'
import { toast } from 'sonner'

interface TimelineClip {
  id: string
  name: string
  type: 'video' | 'audio' | 'image' | 'text'
  startTime: number
  endTime: number
  duration: number
  sourceUrl: string
  thumbnailUrl?: string
  track: number
  volume?: number
  opacity?: number
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  filters?: VideoFilter[]
  transitions?: {
    in?: TransitionEffect
    out?: TransitionEffect
  }
  // Cloud storage properties
  cloudUrl?: string
  cloudThumbnailUrl?: string
  cdnUrl?: string
  s3Key?: string
  cloudOptimized?: boolean
  streamingUrls?: {
    hls?: string
    dash?: string
    webrtc?: string
  }
}

interface VideoFilter {
  id: string
  type: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'hue' | 'sepia' | 'grayscale'
  intensity: number
  enabled: boolean
}

interface TransitionEffect {
  type: 'fade' | 'slide' | 'zoom' | 'wipe' | 'dissolve'
  duration: number
}

interface TimelineProject {
  id: string
  name: string
  duration: number
  fps: number
  width: number
  height: number
  tracks: TimelineTrack[]
  clips: TimelineClip[]
  createdAt: Date
  updatedAt: Date
  // Enhanced cloud properties
  cloudUrl?: string
  cloudProjectId?: string
  cloudBackupUrl?: string
  lastCloudSync?: Date
  cloudOptimized?: boolean
  collaborationEnabled?: boolean
  cdnDistribution?: boolean
}

interface TimelineTrack {
  id: string
  name: string
  type: 'video' | 'audio'
  height: number
  muted: boolean
  locked: boolean
  visible: boolean
}

interface VideoTimelineEditorProps {
  selectedFiles: string[]
  files: any[]
  onProcessingComplete?: (result: any) => void
}

export function VideoTimelineEditor({ selectedFiles, files, onProcessingComplete }: VideoTimelineEditorProps) {
  const [project, setProject] = useState<TimelineProject>({
    id: 'project_' + Date.now(),
    name: 'Untitled Project',
    duration: 60, // 60 seconds default
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      { id: 'video_1', name: 'Video 1', type: 'video', height: 80, muted: false, locked: false, visible: true },
      { id: 'video_2', name: 'Video 2', type: 'video', height: 80, muted: false, locked: false, visible: true },
      { id: 'audio_1', name: 'Audio 1', type: 'audio', height: 60, muted: false, locked: false, visible: true },
      { id: 'audio_2', name: 'Audio 2', type: 'audio', height: 60, muted: false, locked: false, visible: true }
    ],
    clips: [],
    createdAt: new Date(),
    updatedAt: new Date()
  })

  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [selectedClip, setSelectedClip] = useState<TimelineClip | null>(null)
  const [draggedClip, setDraggedClip] = useState<TimelineClip | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [playbackPosition, setPlaybackPosition] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [showWaveform, setShowWaveform] = useState(true)
  const [keyframeMode, setKeyframeMode] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedClips, setSelectedClips] = useState<string[]>([])
  const [clipboardClip, setClipboardClip] = useState<TimelineClip | null>(null)
  const [previewQuality, setPreviewQuality] = useState<'low' | 'medium' | 'high'>('medium')

  const timelineRef = useRef<HTMLDivElement>(null)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const timelineWidth = 1200
  const pixelsPerSecond = 20 * zoom

  // Convert time to pixels
  const timeToPixels = (time: number): number => time * pixelsPerSecond

  // Convert pixels to time
  const pixelsToTime = (pixels: number): number => pixels / pixelsPerSecond

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const frames = Math.floor((seconds % 1) * project.fps)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`
  }

  // Add clip to timeline
  const addClipToTimeline = useCallback((file: any, track: number) => {
    if (!file) return

    const newClip: TimelineClip = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: file.originalName || file.name,
      type: file.mimeType.startsWith('video/') ? 'video' : 
            file.mimeType.startsWith('audio/') ? 'audio' : 
            file.mimeType.startsWith('image/') ? 'image' : 'video',
      startTime: currentTime,
      endTime: currentTime + (file.duration || 10), // Default 10 seconds for non-video files
      duration: file.duration || 10,
      sourceUrl: file.url || file.path || '',
      thumbnailUrl: file.thumbnailUrl,
      track,
      volume: 1,
      opacity: 1,
      filters: [],
      // Enhanced cloud properties
      cloudUrl: file.cloudUrl,
      cloudThumbnailUrl: file.cloudThumbnailUrl,
      cdnUrl: file.cdnUrl,
      s3Key: file.s3Key,
      cloudOptimized: !!file.cloudUrl,
      streamingUrls: file.streamingUrls || {}
    }

    setProject(prev => ({
      ...prev,
      clips: [...prev.clips, newClip],
      duration: Math.max(prev.duration, newClip.endTime),
      updatedAt: new Date(),
      cloudOptimized: prev.cloudOptimized || !!file.cloudUrl
    }))

    const source = file.cloudUrl ? 'cloud' : 'local'
    toast.success(`Added ${file.originalName} to timeline (${source})`)
  }, [currentTime])

  // Remove clip from timeline
  const removeClip = (clipId: string) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.filter(clip => clip.id !== clipId),
      updatedAt: new Date()
    }))
    
    if (selectedClip?.id === clipId) {
      setSelectedClip(null)
    }
    
    toast.success('Clip removed from timeline')
  }

  // Update clip properties
  const updateClip = (clipId: string, updates: Partial<TimelineClip>) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(clip => 
        clip.id === clipId ? { ...clip, ...updates } : clip
      ),
      updatedAt: new Date()
    }))
  }

  // Duplicate clip
  const duplicateClip = (clip: TimelineClip) => {
    const newClip: TimelineClip = {
      ...clip,
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: clip.name + ' Copy',
      startTime: clip.endTime + 0.1,
      endTime: clip.endTime + clip.duration + 0.1
    }

    setProject(prev => ({
      ...prev,
      clips: [...prev.clips, newClip],
      duration: Math.max(prev.duration, newClip.endTime),
      updatedAt: new Date()
    }))

    toast.success('Clip duplicated')
  }

  // Split clip at current position
  const splitClip = (clip: TimelineClip) => {
    if (currentTime <= clip.startTime || currentTime >= clip.endTime) {
      toast.error('Cannot split clip here')
      return
    }

    const splitPoint = currentTime - clip.startTime
    const clip1Duration = splitPoint
    const clip2Duration = clip.duration - splitPoint

    const clip1: TimelineClip = {
      ...clip,
      duration: clip1Duration,
      endTime: clip.startTime + clip1Duration
    }

    const clip2: TimelineClip = {
      ...clip,
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: clip.name + ' (Split)',
      startTime: currentTime,
      duration: clip2Duration,
      endTime: currentTime + clip2Duration
    }

    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => c.id === clip.id ? clip1 : c).concat(clip2),
      updatedAt: new Date()
    }))

    toast.success('Clip split at playhead')
  }

  // Advanced timeline functions
  const copyClip = (clip: TimelineClip) => {
    setClipboardClip({ ...clip })
    toast.success('Clip copied to clipboard')
  }

  const pasteClip = () => {
    if (!clipboardClip) {
      toast.error('No clip in clipboard')
      return
    }

    const newClip: TimelineClip = {
      ...clipboardClip,
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: clipboardClip.name + ' (Pasted)',
      startTime: currentTime,
      endTime: currentTime + clipboardClip.duration
    }

    setProject(prev => ({
      ...prev,
      clips: [...prev.clips, newClip],
      duration: Math.max(prev.duration, newClip.endTime),
      updatedAt: new Date()
    }))

    toast.success('Clip pasted')
  }

  const selectAllClips = () => {
    const allClipIds = project.clips.map(clip => clip.id)
    setSelectedClips(allClipIds)
    toast.success(`Selected ${allClipIds.length} clips`)
  }

  const deleteSelectedClips = () => {
    if (selectedClips.length === 0) return

    setProject(prev => ({
      ...prev,
      clips: prev.clips.filter(clip => !selectedClips.includes(clip.id)),
      updatedAt: new Date()
    }))

    setSelectedClips([])
    setSelectedClip(null)
    toast.success(`Deleted ${selectedClips.length} clips`)
  }

  const rippleDelete = (clipId: string) => {
    const clipToDelete = project.clips.find(c => c.id === clipId)
    if (!clipToDelete) return

    const clipsAfter = project.clips.filter(c => 
      c.track === clipToDelete.track && c.startTime > clipToDelete.endTime
    )

    const rippleDuration = clipToDelete.duration

    setProject(prev => ({
      ...prev,
      clips: prev.clips.filter(c => c.id !== clipId).map(clip => {
        if (clipsAfter.some(c => c.id === clip.id)) {
          return {
            ...clip,
            startTime: clip.startTime - rippleDuration,
            endTime: clip.endTime - rippleDuration
          }
        }
        return clip
      }),
      duration: Math.max(0, prev.duration - rippleDuration),
      updatedAt: new Date()
    }))

    toast.success('Clip deleted with ripple')
  }

  const alignClipsToGrid = () => {
    const gridInterval = 1 // 1 second grid
    
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(clip => {
        const alignedStart = Math.round(clip.startTime / gridInterval) * gridInterval
        return {
          ...clip,
          startTime: alignedStart,
          endTime: alignedStart + clip.duration
        }
      }),
      updatedAt: new Date()
    }))

    toast.success('Clips aligned to grid')
  }

  const generateAudioWaveform = async (audioUrl: string): Promise<number[]> => {
    // Simplified waveform generation - in production, use Web Audio API
    const mockWaveform = Array.from({ length: 100 }, (_, i) => 
      Math.sin(i * 0.1) * 0.5 + Math.random() * 0.3
    )
    return mockWaveform
  }

  const addKeyframe = (clipId: string, property: string, value: any) => {
    const clip = selectedClip as any
    updateClip(clipId, {
      keyframes: {
        ...clip?.keyframes,
        [currentTime]: {
          ...clip?.keyframes?.[currentTime],
          [property]: value
        }
      }
    } as any)
    toast.success(`Keyframe added for ${property}`)
  }

  // Playback controls
  const togglePlayback = () => {
    setIsPlaying(!isPlaying)
    if (videoPreviewRef.current) {
      if (isPlaying) {
        videoPreviewRef.current.pause()
      } else {
        videoPreviewRef.current.play()
      }
    }
  }

  const seekToTime = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, project.duration)))
    if (videoPreviewRef.current) {
      videoPreviewRef.current.currentTime = time
    }
  }

  const skipBackward = () => seekToTime(currentTime - 5)
  const skipForward = () => seekToTime(currentTime + 5)
  const goToStart = () => seekToTime(0)
  const goToEnd = () => seekToTime(project.duration)

  // Cloud storage integration
  const saveProjectToCloud = async () => {
    setIsProcessing(true)
    setProcessingProgress(0)

    try {
      // Prepare cloud-optimized project data
      const cloudProjectData = {
        ...project,
        version: '2.0',
        clips: project.clips.map(clip => ({
          ...clip,
          // Ensure cloud URLs are used if available
          sourceUrl: clip.cloudUrl || clip.sourceUrl,
          thumbnailUrl: clip.cloudThumbnailUrl || clip.thumbnailUrl
        })),
        exportSettings: {
          format: 'mp4',
          quality: 'high',
          resolution: `${project.width}x${project.height}`,
          fps: project.fps,
          cloudOptimized: true,
          cdnDelivery: true
        },
        cloudMetadata: {
          storageProvider: 's3',
          cdnEnabled: true,
          autoBackup: true,
          collaborationEnabled: false
        }
      }

      setProcessingProgress(30)

      // Save project metadata to cloud
      const saveResponse = await fetch('/api/media-processing/cloud/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudProjectData)
      })

      if (!saveResponse.ok) throw new Error('Failed to save project')

      const result = await saveResponse.json()
      
      setProcessingProgress(80)

      // Update project with cloud information
      setProject(prev => ({
        ...prev,
        cloudUrl: result.cloudUrl,
        cloudProjectId: result.projectId,
        cloudBackupUrl: result.backupUrl,
        lastCloudSync: new Date(),
        updatedAt: new Date()
      }))

      setProcessingProgress(100)
      toast.success('Project saved to cloud with CDN optimization')
    } catch (error) {
      console.error('Cloud save error:', error)
      toast.error('Failed to save project to cloud')
    } finally {
      setIsProcessing(false)
      setProcessingProgress(0)
    }
  }

  // Cloud-optimized export
  const exportTimelineToCloud = async () => {
    if (project.clips.length === 0) {
      toast.error('Add clips to timeline before exporting')
      return
    }

    setIsProcessing(true)
    setProcessingProgress(10)

    try {
      // Prepare cloud-optimized export configuration
      const exportConfig = {
        projectId: project.id,
        clips: project.clips.map(clip => ({
          ...clip,
          filters: clip.filters?.filter(f => f.enabled),
          // Use cloud URLs for processing
          sourceUrl: clip.cloudUrl || clip.sourceUrl,
          thumbnailUrl: clip.cloudThumbnailUrl || clip.thumbnailUrl
        })),
        tracks: project.tracks,
        settings: {
          width: project.width,
          height: project.height,
          fps: project.fps,
          format: 'mp4',
          quality: 'high',
          bitrate: '8000k',
          codec: 'h264',
          cloudOptimized: true,
          cdnDistribution: true,
          multiRegionBackup: true
        },
        duration: project.duration,
        cloudExport: {
          enableCDN: true,
          generateMultipleFormats: true,
          adaptiveBitrate: true,
          globalDistribution: true
        }
      }

      setProcessingProgress(30)

      // Start cloud export process
      const exportResponse = await fetch('/api/media-processing/cloud/export-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportConfig)
      })

      if (!exportResponse.ok) throw new Error('Failed to start cloud export')

      const exportResult = await exportResponse.json()
      const jobId = exportResult.jobId

      setProcessingProgress(50)

      // Poll for completion with enhanced status tracking
      let completed = false
      let attempts = 0
      const maxAttempts = 120 // 10 minutes max for cloud processing

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        const statusResponse = await fetch(`/api/media-processing/cloud/jobs/${jobId}/status`)
        const status = await statusResponse.json()

        if (status.status === 'completed') {
          completed = true
          setProcessingProgress(100)
          
          if (onProcessingComplete) {
            onProcessingComplete({
              type: 'cloud_timeline_export',
              outputUrl: status.outputUrl,
              cloudUrl: status.cloudUrl,
              cdnUrl: status.cdnUrl,
              duration: project.duration,
              settings: exportConfig.settings,
              formats: status.availableFormats || ['mp4'],
              regions: status.availableRegions || ['us-east-1'],
              adaptiveBitrates: status.adaptiveBitrates || []
            })
          }

          toast.success('Timeline exported to cloud with global CDN distribution!')
          
          // Auto-download primary format if available
          if (status.downloadUrl) {
            const link = document.createElement('a')
            link.href = status.downloadUrl
            link.download = `${project.name}_cloud.mp4`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
          }
        } else if (status.status === 'failed') {
          throw new Error(status.error || 'Cloud export failed')
        } else {
          // Update progress based on cloud processing stages
          let progressBase = 50
          if (status.stage === 'processing') progressBase = 60
          else if (status.stage === 'encoding') progressBase = 75
          else if (status.stage === 'uploading') progressBase = 85
          else if (status.stage === 'cdn_distribution') progressBase = 95
          
          setProcessingProgress(progressBase + (attempts / maxAttempts) * 10)
        }

        attempts++
      }

      if (!completed) {
        throw new Error('Cloud export timed out')
      }

    } catch (error) {
      console.error('Cloud export error:', error)
      toast.error('Failed to export timeline to cloud')
    } finally {
      setIsProcessing(false)
      setProcessingProgress(0)
    }
  }

  // Export timeline as video
  const exportTimeline = async () => {
    if (project.clips.length === 0) {
      toast.error('Add clips to timeline before exporting')
      return
    }

    setIsProcessing(true)
    setProcessingProgress(10)

    try {
      // Prepare export configuration
      const exportConfig = {
        projectId: project.id,
        clips: project.clips.map(clip => ({
          ...clip,
          filters: clip.filters?.filter(f => f.enabled)
        })),
        tracks: project.tracks,
        settings: {
          width: project.width,
          height: project.height,
          fps: project.fps,
          format: 'mp4',
          quality: 'high',
          bitrate: '8000k',
          codec: 'h264'
        },
        duration: project.duration
      }

      setProcessingProgress(30)

      // Start export process
      const exportResponse = await fetch('/api/media-processing/export-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportConfig)
      })

      if (!exportResponse.ok) throw new Error('Failed to start export')

      const exportResult = await exportResponse.json()
      const jobId = exportResult.jobId

      setProcessingProgress(50)

      // Poll for completion
      let completed = false
      let attempts = 0
      const maxAttempts = 60 // 5 minutes max

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        const statusResponse = await fetch(`/api/media-processing/jobs/${jobId}/status`)
        const status = await statusResponse.json()

        if (status.status === 'completed') {
          completed = true
          setProcessingProgress(100)
          
          if (onProcessingComplete) {
            onProcessingComplete({
              type: 'timeline_export',
              outputUrl: status.outputUrl,
              cloudUrl: status.cloudUrl,
              duration: project.duration,
              settings: exportConfig.settings
            })
          }

          toast.success('Timeline exported successfully!')
          
          // Auto-download if available
          if (status.downloadUrl) {
            const link = document.createElement('a')
            link.href = status.downloadUrl
            link.download = `${project.name}.mp4`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
          }
        } else if (status.status === 'failed') {
          throw new Error(status.error || 'Export failed')
        } else {
          setProcessingProgress(50 + (attempts / maxAttempts) * 40)
        }

        attempts++
      }

      if (!completed) {
        throw new Error('Export timed out')
      }

    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export timeline')
    } finally {
      setIsProcessing(false)
      setProcessingProgress(0)
    }
  }

  // Drag and drop handling
  const handleDragStart = (e: React.DragEvent, clip: TimelineClip) => {
    setDraggedClip(clip)
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetTrack: number) => {
    e.preventDefault()
    
    if (!draggedClip) return

    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const newStartTime = pixelsToTime(x)
    const newEndTime = newStartTime + draggedClip.duration

    updateClip(draggedClip.id, {
      startTime: Math.max(0, newStartTime),
      endTime: Math.max(draggedClip.duration, newEndTime),
      track: targetTrack
    })

    setDraggedClip(null)
    setIsDragging(false)
    toast.success('Clip moved')
  }

  // Timeline ruler
  const renderTimelineRuler = () => {
    const rulers: React.ReactElement[] = []
    const step = zoom < 0.5 ? 10 : zoom < 1 ? 5 : 1
    
    for (let i = 0; i <= project.duration; i += step) {
      const x = timeToPixels(i)
      rulers.push(
        <div
          key={i}
          className="absolute top-0 bottom-0 border-l border-muted-foreground/20"
          style={{ left: x }}
        >
          <div className="absolute -top-6 left-1 text-xs text-muted-foreground">
            {formatTime(i)}
          </div>
        </div>
      )
    }
    
    return rulers
  }

  // Render timeline clip
  const renderTimelineClip = (clip: TimelineClip) => {
    const x = timeToPixels(clip.startTime)
    const width = timeToPixels(clip.duration)
    const isSelected = selectedClip?.id === clip.id
    const isMultiSelected = selectedClips.includes(clip.id)

    return (
      <div
        key={clip.id}
        className={`absolute rounded cursor-pointer border-2 overflow-hidden transition-all ${
          isSelected 
            ? 'border-primary bg-primary/20 shadow-lg z-10' 
            : isMultiSelected
            ? 'border-blue-500 bg-blue-500/20'
            : 'border-muted bg-muted hover:bg-muted/80'
        }`}
        style={{
          left: x,
          width: Math.max(width, 20),
          height: '60px',
          top: '5px'
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, clip)}
        onClick={(e) => {
          if (multiSelectMode && e.ctrlKey) {
            if (selectedClips.includes(clip.id)) {
              setSelectedClips(prev => prev.filter(id => id !== clip.id))
            } else {
              setSelectedClips(prev => [...prev, clip.id])
            }
          } else {
            setSelectedClip(clip)
            setSelectedClips([clip.id])
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setSelectedClip(clip)
        }}
      >
        <div className="p-2 h-full flex items-center relative">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{clip.name}</div>
            <div className="text-xs text-muted-foreground">
              {formatTime(clip.duration)}
            </div>
          </div>
          
          {/* Audio waveform visualization for audio clips */}
          {(clip.type === 'audio' || clip.type === 'video') && showWaveform && (
            <div className="absolute bottom-1 left-2 right-2 h-4 bg-primary/10 rounded-sm overflow-hidden">
              <div className="flex h-full items-end gap-px">
                {Array.from({ length: Math.min(Math.floor(width / 4), 50) }, (_, i) => (
                  <div
                    key={i}
                    className="bg-primary/50 flex-1"
                    style={{
                      height: `${30 + Math.random() * 70}%`,
                      minWidth: '1px'
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Volume indicator */}
          {clip.volume !== undefined && clip.volume !== 1 && (
            <div className="absolute top-1 right-1">
              <Badge variant="secondary" className="text-xs px-1 py-0">
                <Volume2 className="w-2 h-2 mr-1" />
                {Math.round(clip.volume * 100)}%
              </Badge>
            </div>
          )}
        </div>
        
        {/* Resize handles */}
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-primary/20 cursor-ew-resize opacity-0 hover:opacity-100 hover:bg-primary/40" />
        <div className="absolute right-0 top-0 bottom-0 w-2 bg-primary/20 cursor-ew-resize opacity-0 hover:opacity-100 hover:bg-primary/40" />
        
        {/* Transition indicators */}
        {clip.transitions?.in && (
          <div className="absolute top-0 left-0 w-0 h-0 border-l-8 border-t-8 border-l-transparent border-t-yellow-400" />
        )}
        {clip.transitions?.out && (
          <div className="absolute top-0 right-0 w-0 h-0 border-r-8 border-t-8 border-r-transparent border-t-yellow-400" />
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top toolbar */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Input
              value={project.name}
              onChange={(e) => setProject(prev => ({ ...prev, name: e.target.value }))}
              className="w-48"
            />
            <Badge variant="outline">
              {formatTime(project.duration)}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSnapToGrid(!snapToGrid)}
              className={snapToGrid ? 'bg-primary/10' : ''}
            >
              <Grid3X3 className="w-4 h-4 mr-2" />
              Snap
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWaveform(!showWaveform)}
              className={showWaveform ? 'bg-primary/10' : ''}
            >
              <Music className="w-4 h-4 mr-2" />
              Waveform
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={alignClipsToGrid}
              disabled={project.clips.length === 0}
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Align
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={saveProjectToCloud}
              disabled={isProcessing}
            >
              <Cloud className="w-4 h-4 mr-2" />
              Save to Cloud
            </Button>
            
            <Button
              onClick={exportTimelineToCloud}
              disabled={isProcessing || project.clips.length === 0}
              className="bg-primary"
            >
              <Cloud className="w-4 h-4 mr-2" />
              Export to Cloud
            </Button>
          </div>
        </div>

        {/* Processing progress */}
        {isProcessing && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {processingProgress < 50 ? 'Preparing export...' : 'Rendering video...'}
              </span>
              <span className="text-sm text-muted-foreground">{processingProgress}%</span>
            </div>
            <Progress value={processingProgress} className="h-2" />
          </div>
        )}
      </div>

      <div className="flex-1 flex">
        {/* Left sidebar - File browser */}
        <div className="w-64 border-r bg-muted/20 p-4">
          <h3 className="font-semibold mb-3">Media Files</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {files.filter(file => selectedFiles.includes(file.id)).map(file => (
              <div
                key={file.id}
                className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(file))
                }}
                onDoubleClick={() => addClipToTimeline(file, 0)}
              >
                <div className="text-sm font-medium truncate">{file.originalName}</div>
                <div className="text-xs text-muted-foreground">
                  {file.mimeType} • {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main editing area */}
        <div className="flex-1 flex flex-col">
          {/* Video preview */}
          <div className="h-64 border-b bg-black flex items-center justify-center">
            <div className="relative">
              <video
                ref={videoPreviewRef}
                className="max-h-full max-w-full"
                controls={false}
                muted
              />
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black/50 px-2 py-1 rounded">
                {formatTime(currentTime)} / {formatTime(project.duration)}
              </div>
            </div>
          </div>

          {/* Playback controls */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm" onClick={goToStart}>
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={skipBackward}>
                <Minus className="w-4 h-4" />
              </Button>
              <Button onClick={togglePlayback} size="sm">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={skipForward}>
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToEnd}>
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            <div className="mt-4">
              <Slider
                value={[currentTime]}
                onValueChange={(value) => seekToTime(value[0])}
                max={project.duration}
                step={1 / project.fps}
                className="w-full"
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 relative overflow-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Label>Zoom:</Label>
                  <Slider
                    value={[zoom]}
                    onValueChange={(value) => setZoom(value[0])}
                    min={0.1}
                    max={5}
                    step={0.1}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">{zoom.toFixed(1)}x</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllClips}
                    disabled={project.clips.length === 0}
                  >
                    Select All
                  </Button>
                  
                  {selectedClips.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deleteSelectedClips}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete ({selectedClips.length})
                    </Button>
                  )}

                  {clipboardClip && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={pasteClip}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Paste
                    </Button>
                  )}

                  {selectedClip && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyClip(selectedClip)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => duplicateClip(selectedClip)}
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => splitClip(selectedClip)}
                      >
                        <Scissors className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rippleDelete(selectedClip.id)}
                      >
                        Ripple Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Timeline tracks */}
              <div 
                ref={timelineRef}
                className="relative bg-muted/10 border rounded-lg overflow-hidden"
                style={{ height: '400px', minWidth: timeToPixels(project.duration) + 200 }}
              >
                {/* Ruler */}
                <div className="relative h-8 bg-background border-b">
                  {renderTimelineRuler()}
                </div>

                {/* Playhead */}
                <div
                  className="absolute top-8 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{ left: timeToPixels(currentTime) }}
                />

                {/* Tracks */}
                {project.tracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="relative border-b"
                    style={{ height: track.height }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    <div className="absolute left-2 top-2 text-xs font-medium z-10">
                      {track.name}
                    </div>
                    
                    {/* Track clips */}
                    {project.clips
                      .filter(clip => clip.track === index)
                      .map(clip => renderTimelineClip(clip))
                    }
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar - Clip properties */}
        {selectedClip && (
          <div className="w-64 border-l bg-muted/20 p-4">
            <h3 className="font-semibold mb-3">Clip Properties</h3>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={selectedClip.name}
                  onChange={(e) => updateClip(selectedClip.id, { name: e.target.value })}
                />
              </div>

              <div>
                <Label>Start Time</Label>
                <Input
                  value={selectedClip.startTime.toFixed(2)}
                  onChange={(e) => {
                    const startTime = parseFloat(e.target.value) || 0
                    updateClip(selectedClip.id, { 
                      startTime,
                      endTime: startTime + selectedClip.duration
                    })
                  }}
                />
              </div>

              <div>
                <Label>Duration</Label>
                <Input
                  value={selectedClip.duration.toFixed(2)}
                  onChange={(e) => {
                    const duration = parseFloat(e.target.value) || 1
                    updateClip(selectedClip.id, { 
                      duration,
                      endTime: selectedClip.startTime + duration
                    })
                  }}
                />
              </div>

              {selectedClip.type !== 'audio' && (
                <div>
                  <Label>Opacity</Label>
                  <Slider
                    value={[selectedClip.opacity || 1]}
                    onValueChange={(value) => updateClip(selectedClip.id, { opacity: value[0] })}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                </div>
              )}

              {selectedClip.type !== 'image' && (
                <div>
                  <Label>Volume</Label>
                  <Slider
                    value={[selectedClip.volume || 1]}
                    onValueChange={(value) => updateClip(selectedClip.id, { volume: value[0] })}
                    min={0}
                    max={2}
                    step={0.1}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}