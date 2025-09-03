'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Package, Play, Pause, RotateCcw, Clock, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface BatchProcessorProps {
  selectedFiles: string[]
  files: any[]
}

interface BatchOperation {
  type: string
  parameters: Record<string, any>
}

export function BatchProcessor({ selectedFiles, files }: BatchProcessorProps) {
  const [batchName, setBatchName] = useState(`Batch ${new Date().toLocaleDateString()}`)
  const [operations, setOperations] = useState<BatchOperation[]>([])
  const [outputFormat, setOutputFormat] = useState('mp4')
  const [quality, setQuality] = useState('medium')
  const [isProcessing, setIsProcessing] = useState(false)

  const selectedFilesData = files.filter(file => selectedFiles.includes(file.id))

  const formatOptions = [
    { label: 'MP4 (Video)', value: 'mp4' },
    { label: 'MP3 (Audio)', value: 'mp3' },
    { label: 'WebM (Web)', value: 'webm' },
    { label: 'PNG (Image)', value: 'png' },
    { label: 'JPG (Image)', value: 'jpg' }
  ]

  const qualityOptions = [
    { label: 'Low (Fast)', value: 'low' },
    { label: 'Medium (Balanced)', value: 'medium' },
    { label: 'High (Quality)', value: 'high' },
    { label: 'Ultra (Slow)', value: 'ultra' }
  ]

  const commonOperations = [
    {
      name: 'Social Media Pack',
      description: 'Create versions for all major social platforms',
      operations: [
        { type: 'resize', parameters: { width: 1080, height: 1920, name: 'story' } },
        { type: 'resize', parameters: { width: 1080, height: 1080, name: 'post' } },
        { type: 'resize', parameters: { width: 1200, height: 628, name: 'landscape' } }
      ]
    },
    {
      name: 'Quality Variants',
      description: 'Generate different quality versions',
      operations: [
        { type: 'compress', parameters: { quality: 'low', name: 'mobile' } },
        { type: 'compress', parameters: { quality: 'medium', name: 'web' } },
        { type: 'compress', parameters: { quality: 'high', name: 'desktop' } }
      ]
    },
    {
      name: 'Format Pack',
      description: 'Convert to multiple formats',
      operations: [
        { type: 'convert', parameters: { format: 'mp4', name: 'video' } },
        { type: 'convert', parameters: { format: 'webm', name: 'web' } },
        { type: 'extract_audio', parameters: { format: 'mp3', name: 'audio' } }
      ]
    }
  ]

  const addCommonOperations = (operationSet: BatchOperation[]) => {
    setOperations(prev => [...prev, ...operationSet])
    toast.success('Operations added to batch')
  }

  const removeOperation = (index: number) => {
    setOperations(prev => prev.filter((_, i) => i !== index))
  }

  const startBatchProcessing = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select files to process')
      return
    }

    if (operations.length === 0) {
      toast.error('Please add operations to the batch')
      return
    }

    setIsProcessing(true)

    try {
      const response = await fetch('/api/media-processing/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: selectedFiles,
          operations,
          outputFormat,
          quality,
          batchName
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start batch processing')
      }

      const result = await response.json()
      toast.success(`Batch processing started! ${result.processingJobs.length} jobs queued.`)
      
      // Reset form
      setOperations([])
      setBatchName(`Batch ${new Date().toLocaleDateString()}`)

    } catch (error) {
      console.error('Batch processing error:', error)
      toast.error('Failed to start batch processing')
    } finally {
      setIsProcessing(false)
    }
  }

  const estimatedTime = operations.length * selectedFiles.length * 30 // 30 seconds per operation per file

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <div className="lg:col-span-2">
        <div className="space-y-6">
          {/* Batch Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Batch Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Batch Name</Label>
                <Input
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Enter batch name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Output Format</Label>
                  <Select value={outputFormat} onValueChange={setOutputFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formatOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Quality</Label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {qualityOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Common Operations */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Operations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {commonOperations.map((opSet, index) => (
                  <div
                    key={index}
                    className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => addCommonOperations(opSet.operations)}
                  >
                    <h4 className="font-medium mb-1">{opSet.name}</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      {opSet.description}
                    </p>
                    <Badge variant="outline">
                      {opSet.operations.length} operations
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Operations Queue */}
          {operations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Operations Queue</CardTitle>
              </CardHeader>
              <CardContent>
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
                          {operation.parameters.name && (
                            <span className="font-medium">{operation.parameters.name}: </span>
                          )}
                          {JSON.stringify(operation.parameters).slice(0, 100)}...
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

                <div className="mt-4 p-3 bg-primary/5 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span>Estimated processing time:</span>
                    <span className="font-medium">
                      {Math.ceil(estimatedTime / 60)} minutes
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Total operations:</span>
                    <span className="font-medium">
                      {operations.length * selectedFiles.length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Selected Files</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedFilesData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No files selected for batch processing
              </p>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground mb-4">
                  {selectedFilesData.length} files selected
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedFilesData.map(file => (
                    <div key={file.id} className="p-2 border rounded text-xs">
                      <p className="font-medium truncate">{file.originalName}</p>
                      <p className="text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  ))}
                </div>

                {operations.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Batch Summary</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Files:</span>
                        <span>{selectedFilesData.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Operations:</span>
                        <span>{operations.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total jobs:</span>
                        <span>{operations.length * selectedFilesData.length}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Est. time:</span>
                        <span>{Math.ceil(estimatedTime / 60)}m</span>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={startBatchProcessing}
                  disabled={isProcessing || operations.length === 0}
                  className="w-full mt-4"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Starting Batch...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start Batch Processing
                    </>
                  )}
                </Button>

                {isProcessing && (
                  <div className="mt-4">
                    <Progress value={25} className="mb-2" />
                    <p className="text-xs text-muted-foreground text-center">
                      Initializing batch processing...
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
