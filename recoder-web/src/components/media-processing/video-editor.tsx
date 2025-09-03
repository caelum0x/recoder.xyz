'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Scissors, Scale, FileDown, Type, Merge, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface VideoEditorProps {
  selectedFiles: string[]
  files: any[]
}

interface VideoOperation {
  type: 'resize' | 'compress' | 'trim' | 'watermark' | 'merge' | 'convert'
  parameters: Record<string, any>
}

export function VideoEditor({ selectedFiles, files }: VideoEditorProps) {
  const [activeOperation, setActiveOperation] = useState('resize')
  const [operations, setOperations] = useState<VideoOperation[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Operation parameters
  const [resizeParams, setResizeParams] = useState({
    width: 1920,
    height: 1080,
    aspectRatio: '16:9'
  })

  const [compressParams, setCompressParams] = useState({
    quality: 'medium',
    bitrate: '2000k',
    preset: 'medium'
  })

  const [trimParams, setTrimParams] = useState({
    startTime: '00:00:00',
    endTime: '00:01:00',
    duration: '60'
  })

  const [watermarkParams, setWatermarkParams] = useState({
    text: 'Made with Recoder',
    position: 'bottom-right',
    fontSize: 24,
    color: '#ffffff',
    opacity: 0.8
  })

  const selectedVideoFiles = files.filter(file => 
    selectedFiles.includes(file.id) && file.mimeType.startsWith('video/')
  )

  const aspectRatios = [
    { label: '16:9 (Landscape)', value: '16:9', width: 1920, height: 1080 },
    { label: '9:16 (Portrait)', value: '9:16', width: 1080, height: 1920 },
    { label: '1:1 (Square)', value: '1:1', width: 1080, height: 1080 },
    { label: '4:3 (Standard)', value: '4:3', width: 1024, height: 768 },
    { label: '21:9 (Ultrawide)', value: '21:9', width: 2560, height: 1080 }
  ]

  const qualityPresets = [
    { label: 'Low (Web)', value: 'low', crf: 28, bitrate: '500k' },
    { label: 'Medium (Social)', value: 'medium', crf: 23, bitrate: '2000k' },
    { label: 'High (Broadcast)', value: 'high', crf: 18, bitrate: '5000k' },
    { label: 'Ultra (Archive)', value: 'ultra', crf: 15, bitrate: '10000k' }
  ]

  const handleAspectRatioChange = (ratio: string) => {
    const preset = aspectRatios.find(ar => ar.value === ratio)
    if (preset) {
      setResizeParams({
        ...resizeParams,
        aspectRatio: ratio,
        width: preset.width,
        height: preset.height
      })
    }
  }

  const addOperation = (operation: VideoOperation) => {
    setOperations(prev => [...prev, operation])
    toast.success(`${operation.type} operation added`)
  }

  const removeOperation = (index: number) => {
    setOperations(prev => prev.filter((_, i) => i !== index))
  }

  const processVideos = async () => {
    if (selectedVideoFiles.length === 0) {
      toast.error('Please select at least one video file')
      return
    }

    if (operations.length === 0) {
      toast.error('Please add at least one operation')
      return
    }

    setIsProcessing(true)

    try {
      for (const file of selectedVideoFiles) {
        for (const operation of operations) {
          const response = await fetch('/api/media-processing/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId: file.id,
              operation: operation.type,
              parameters: operation.parameters,
              outputFormat: 'mp4',
              quality: 'high'
            })
          })

          if (!response.ok) {
            throw new Error(`Failed to process ${file.filename}`)
          }

          const result = await response.json()
          toast.success(`Processing started for ${file.filename}`)
        }
      }

      toast.success('All processing jobs started successfully')
      setOperations([])

    } catch (error) {
      console.error('Processing error:', error)
      toast.error('Failed to start processing')
    } finally {
      setIsProcessing(false)
    }
  }

  const renderOperationPanel = () => {
    switch (activeOperation) {
      case 'resize':
        return (
          <div className="space-y-4">
            <div>
              <Label>Aspect Ratio Preset</Label>
              <Select 
                value={resizeParams.aspectRatio} 
                onValueChange={handleAspectRatioChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aspectRatios.map(ratio => (
                    <SelectItem key={ratio.value} value={ratio.value}>
                      {ratio.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Width</Label>
                <Input
                  type="number"
                  value={resizeParams.width}
                  onChange={(e) => setResizeParams({
                    ...resizeParams,
                    width: parseInt(e.target.value) || 0
                  })}
                />
              </div>
              <div>
                <Label>Height</Label>
                <Input
                  type="number"
                  value={resizeParams.height}
                  onChange={(e) => setResizeParams({
                    ...resizeParams,
                    height: parseInt(e.target.value) || 0
                  })}
                />
              </div>
            </div>

            <Button 
              onClick={() => addOperation({
                type: 'resize',
                parameters: resizeParams
              })}
              className="w-full"
            >
              <Scale className="w-4 h-4 mr-2" />
              Add Resize Operation
            </Button>
          </div>
        )

      case 'compress':
        return (
          <div className="space-y-4">
            <div>
              <Label>Quality Preset</Label>
              <Select 
                value={compressParams.quality} 
                onValueChange={(value) => {
                  const preset = qualityPresets.find(q => q.value === value)
                  if (preset) {
                    setCompressParams({
                      ...compressParams,
                      quality: value,
                      bitrate: preset.bitrate
                    })
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {qualityPresets.map(preset => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Custom Bitrate</Label>
              <Input
                value={compressParams.bitrate}
                onChange={(e) => setCompressParams({
                  ...compressParams,
                  bitrate: e.target.value
                })}
                placeholder="e.g., 2000k"
              />
            </div>

            <Button 
              onClick={() => addOperation({
                type: 'compress',
                parameters: compressParams
              })}
              className="w-full"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Add Compression
            </Button>
          </div>
        )

      case 'trim':
        return (
          <div className="space-y-4">
            <div>
              <Label>Start Time (HH:MM:SS)</Label>
              <Input
                value={trimParams.startTime}
                onChange={(e) => setTrimParams({
                  ...trimParams,
                  startTime: e.target.value
                })}
                placeholder="00:00:00"
              />
            </div>

            <div>
              <Label>End Time (HH:MM:SS)</Label>
              <Input
                value={trimParams.endTime}
                onChange={(e) => setTrimParams({
                  ...trimParams,
                  endTime: e.target.value
                })}
                placeholder="00:01:00"
              />
            </div>

            <Button 
              onClick={() => addOperation({
                type: 'trim',
                parameters: {
                  startTime: trimParams.startTime,
                  duration: trimParams.duration
                }
              })}
              className="w-full"
            >
              <Scissors className="w-4 h-4 mr-2" />
              Add Trim Operation
            </Button>
          </div>
        )

      case 'watermark':
        return (
          <div className="space-y-4">
            <div>
              <Label>Watermark Text</Label>
              <Input
                value={watermarkParams.text}
                onChange={(e) => setWatermarkParams({
                  ...watermarkParams,
                  text: e.target.value
                })}
                placeholder="Enter watermark text"
              />
            </div>

            <div>
              <Label>Position</Label>
              <Select 
                value={watermarkParams.position} 
                onValueChange={(value) => setWatermarkParams({
                  ...watermarkParams,
                  position: value
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">Top Left</SelectItem>
                  <SelectItem value="top-right">Top Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Font Size</Label>
              <div className="flex items-center space-x-4">
                <Input
                  type="range"
                  min="12"
                  max="72"
                  step="2"
                  value={watermarkParams.fontSize}
                  onChange={(e) => setWatermarkParams({
                    ...watermarkParams,
                    fontSize: parseInt(e.target.value)
                  })}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground min-w-[3rem]">
                  {watermarkParams.fontSize}px
                </span>
              </div>
            </div>

            <Button 
              onClick={() => addOperation({
                type: 'watermark',
                parameters: watermarkParams
              })}
              className="w-full"
            >
              <Type className="w-4 h-4 mr-2" />
              Add Watermark
            </Button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Video Editor</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeOperation} onValueChange={setActiveOperation}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="resize">
                  <Scale className="w-4 h-4 mr-2" />
                  Resize
                </TabsTrigger>
                <TabsTrigger value="compress">
                  <FileDown className="w-4 h-4 mr-2" />
                  Compress
                </TabsTrigger>
                <TabsTrigger value="trim">
                  <Scissors className="w-4 h-4 mr-2" />
                  Trim
                </TabsTrigger>
                <TabsTrigger value="watermark">
                  <Type className="w-4 h-4 mr-2" />
                  Watermark
                </TabsTrigger>
              </TabsList>

              <div className="mt-6">
                {renderOperationPanel()}
              </div>
            </Tabs>

            {/* Operations Queue */}
            {operations.length > 0 && (
              <div className="mt-6">
                <h3 className="font-medium mb-3">Operations Queue</h3>
                <div className="space-y-2">
                  {operations.map((operation, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {operation.type}
                        </Badge>
                        <span className="text-sm">
                          {JSON.stringify(operation.parameters)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOperation(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Selected Videos</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedVideoFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No video files selected
              </p>
            ) : (
              <div className="space-y-3">
                {selectedVideoFiles.map(file => (
                  <div key={file.id} className="p-3 border rounded-lg">
                    <p className="text-sm font-medium truncate">
                      {file.originalName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                ))}

                <Button
                  onClick={processVideos}
                  disabled={isProcessing || operations.length === 0}
                  className="w-full mt-4"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Scissors className="w-4 h-4 mr-2" />
                      Process Videos ({operations.length} operations)
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
