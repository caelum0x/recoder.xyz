'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Music, Volume2, FileAudio, Scissors, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface AudioProcessorProps {
  selectedFiles: string[]
  files: any[]
}

interface AudioOperation {
  type: 'convert' | 'extract' | 'enhance' | 'trim' | 'normalize' | 'mix'
  parameters: Record<string, any>
}

export function AudioProcessor({ selectedFiles, files }: AudioProcessorProps) {
  const [activeOperation, setActiveOperation] = useState('convert')
  const [operations, setOperations] = useState<AudioOperation[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Operation parameters
  const [convertParams, setConvertParams] = useState({
    format: 'mp3',
    bitrate: '128k',
    sampleRate: '44100'
  })

  const [enhanceParams, setEnhanceParams] = useState({
    removeNoise: true,
    normalize: true,
    compressor: false,
    eq: 'none'
  })

  const [trimParams, setTrimParams] = useState({
    startTime: '00:00:00',
    endTime: '00:01:00'
  })

  const selectedAudioFiles = files.filter(file => 
    selectedFiles.includes(file.id) && (
      file.mimeType.startsWith('audio/') || 
      file.mimeType.startsWith('video/') // Can extract audio from video
    )
  )

  const audioFormats = [
    { label: 'MP3 (Most Compatible)', value: 'mp3' },
    { label: 'WAV (Uncompressed)', value: 'wav' },
    { label: 'FLAC (Lossless)', value: 'flac' },
    { label: 'AAC (High Quality)', value: 'aac' },
    { label: 'OGG (Open Source)', value: 'ogg' }
  ]

  const bitrateOptions = [
    { label: '96 kbps (Low)', value: '96k' },
    { label: '128 kbps (Standard)', value: '128k' },
    { label: '192 kbps (High)', value: '192k' },
    { label: '256 kbps (Very High)', value: '256k' },
    { label: '320 kbps (Maximum)', value: '320k' }
  ]

  const sampleRates = [
    { label: '22.05 kHz', value: '22050' },
    { label: '44.1 kHz (CD Quality)', value: '44100' },
    { label: '48 kHz (Professional)', value: '48000' },
    { label: '96 kHz (High-Res)', value: '96000' }
  ]

  const eqPresets = [
    { label: 'None', value: 'none' },
    { label: 'Bass Boost', value: 'bass' },
    { label: 'Treble Boost', value: 'treble' },
    { label: 'Vocal Enhance', value: 'vocal' },
    { label: 'Classical', value: 'classical' },
    { label: 'Rock', value: 'rock' },
    { label: 'Jazz', value: 'jazz' }
  ]

  const addOperation = (operation: AudioOperation) => {
    setOperations(prev => [...prev, operation])
    toast.success(`${operation.type} operation added`)
  }

  const removeOperation = (index: number) => {
    setOperations(prev => prev.filter((_, i) => i !== index))
  }

  const processAudio = async () => {
    if (selectedAudioFiles.length === 0) {
      toast.error('Please select at least one audio/video file')
      return
    }

    if (operations.length === 0) {
      toast.error('Please add at least one operation')
      return
    }

    setIsProcessing(true)

    try {
      for (const file of selectedAudioFiles) {
        for (const operation of operations) {
          const response = await fetch('/api/media-processing/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId: file.id,
              operation: operation.type,
              parameters: operation.parameters,
              outputFormat: operation.type === 'convert' ? operation.parameters.format : 'mp3',
              quality: 'high'
            })
          })

          if (!response.ok) {
            throw new Error(`Failed to process ${file.filename}`)
          }

          toast.success(`Processing started for ${file.filename}`)
        }
      }

      toast.success('All audio processing jobs started successfully')
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
      case 'convert':
        return (
          <div className="space-y-4">
            <div>
              <Label>Output Format</Label>
              <Select 
                value={convertParams.format} 
                onValueChange={(value) => setConvertParams({
                  ...convertParams,
                  format: value
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {audioFormats.map(format => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Bitrate</Label>
              <Select 
                value={convertParams.bitrate} 
                onValueChange={(value) => setConvertParams({
                  ...convertParams,
                  bitrate: value
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bitrateOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Sample Rate</Label>
              <Select 
                value={convertParams.sampleRate} 
                onValueChange={(value) => setConvertParams({
                  ...convertParams,
                  sampleRate: value
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sampleRates.map(rate => (
                    <SelectItem key={rate.value} value={rate.value}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={() => addOperation({
                type: 'convert',
                parameters: convertParams
              })}
              className="w-full"
            >
              <FileAudio className="w-4 h-4 mr-2" />
              Add Audio Conversion
            </Button>
          </div>
        )

      case 'extract':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Extract Audio from Video</h4>
              <p className="text-sm text-muted-foreground">
                Extract high-quality audio tracks from video files for podcasts, music, or voiceovers.
              </p>
            </div>

            <div>
              <Label>Output Format</Label>
              <Select 
                value={convertParams.format} 
                onValueChange={(value) => setConvertParams({
                  ...convertParams,
                  format: value
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {audioFormats.map(format => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={() => addOperation({
                type: 'extract',
                parameters: { format: convertParams.format }
              })}
              className="w-full"
            >
              <Music className="w-4 h-4 mr-2" />
              Add Audio Extraction
            </Button>
          </div>
        )

      case 'enhance':
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={enhanceParams.removeNoise}
                  onChange={(e) => setEnhanceParams({
                    ...enhanceParams,
                    removeNoise: e.target.checked
                  })}
                  className="rounded"
                />
                <Label>Remove Background Noise</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={enhanceParams.normalize}
                  onChange={(e) => setEnhanceParams({
                    ...enhanceParams,
                    normalize: e.target.checked
                  })}
                  className="rounded"
                />
                <Label>Normalize Volume</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={enhanceParams.compressor}
                  onChange={(e) => setEnhanceParams({
                    ...enhanceParams,
                    compressor: e.target.checked
                  })}
                  className="rounded"
                />
                <Label>Apply Compressor</Label>
              </div>
            </div>

            <div>
              <Label>EQ Preset</Label>
              <Select 
                value={enhanceParams.eq} 
                onValueChange={(value) => setEnhanceParams({
                  ...enhanceParams,
                  eq: value
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eqPresets.map(preset => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={() => addOperation({
                type: 'enhance',
                parameters: enhanceParams
              })}
              className="w-full"
            >
              <Volume2 className="w-4 h-4 mr-2" />
              Add Audio Enhancement
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
                parameters: trimParams
              })}
              className="w-full"
            >
              <Scissors className="w-4 h-4 mr-2" />
              Add Audio Trim
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
            <CardTitle>Audio Processor</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeOperation} onValueChange={setActiveOperation}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="convert">
                  <FileAudio className="w-4 h-4 mr-2" />
                  Convert
                </TabsTrigger>
                <TabsTrigger value="extract">
                  <Music className="w-4 h-4 mr-2" />
                  Extract
                </TabsTrigger>
                <TabsTrigger value="enhance">
                  <Volume2 className="w-4 h-4 mr-2" />
                  Enhance
                </TabsTrigger>
                <TabsTrigger value="trim">
                  <Scissors className="w-4 h-4 mr-2" />
                  Trim
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
            <CardTitle>Selected Files</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedAudioFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No audio or video files selected
              </p>
            ) : (
              <div className="space-y-3">
                {selectedAudioFiles.map(file => (
                  <div key={file.id} className="p-3 border rounded-lg">
                    <p className="text-sm font-medium truncate">
                      {file.originalName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(1)} MB • {file.format.toUpperCase()}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      {file.mimeType.startsWith('audio/') ? 'Audio' : 'Video'}
                    </Badge>
                  </div>
                ))}

                <Button
                  onClick={processAudio}
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
                      <Music className="w-4 h-4 mr-2" />
                      Process Audio ({operations.length} operations)
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
