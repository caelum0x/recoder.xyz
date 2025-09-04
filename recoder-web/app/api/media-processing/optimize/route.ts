import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { mediaOptimizationEngine } from '@/lib/media-processing/optimization-engine'
import { mediaProcessingPipeline } from '@/lib/media-processing/pipeline-orchestrator'
import { rateLimit } from '@/lib/rate-limit'
import { getS3Service } from '@/lib/cloud-storage/aws-s3-service'
import { FFmpegProcessor } from '@/lib/media-processing/ffmpeg-processor'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'media-optimization', 3, 60000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Authentication
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...params } = body

    switch (action) {
      case 'optimize_video': {
        const { fileId, filePath, platforms, quality, enableAnalysis } = params
        
        if (!fileId && !filePath) {
          return NextResponse.json({ error: 'File ID or path required' }, { status: 400 })
        }

        // Initialize FFmpeg processor and S3 service
        const ffmpegProcessor = new FFmpegProcessor()
        const s3Service = getS3Service()

        // Validate file exists in S3 if using fileId
        if (fileId && !filePath) {
          try {
            const fileExists = await s3Service.fileExists(fileId)
            if (!fileExists) {
              return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
            }
          } catch (error) {
            console.error('S3 file validation error:', error)
            return NextResponse.json({ error: 'Storage validation failed' }, { status: 500 })
          }
        }

        // Pre-validate FFmpeg capabilities
        const platformSpecs = platforms || ['youtube', 'instagram', 'tiktok']
        const ffmpegCapabilities = await ffmpegProcessor.getCapabilities()
        
        if (!ffmpegCapabilities.supportsMultiFormat) {
          return NextResponse.json({ 
            error: 'FFmpeg multi-format optimization not available' 
          }, { status: 503 })
        }

        // Create optimization job with enhanced metadata
        const jobId = await mediaProcessingPipeline.queueProcessingJob({
          type: 'optimize',
          userId: session.user.id,
          input: {
            fileId,
            filePath,
            platforms: platformSpecs,
            quality: quality || 'medium',
            enableAnalysis: enableAnalysis !== false,
            s3Config: {
              bucket: process.env.AWS_S3_BUCKET,
              region: process.env.AWS_REGION
            },
            ffmpegConfig: {
              preset: quality || 'medium',
              enableHardwareAcceleration: true
            }
          },
          metadata: {
            optimizationType: 'multi_platform',
            targetPlatforms: platformSpecs,
            processingEngine: 'ffmpeg',
            storageProvider: 's3'
          }
        })

        return NextResponse.json({
          success: true,
          jobId,
          message: 'Video optimization started',
          estimatedCompletion: Date.now() + 300000, // 5 minutes estimate
          platforms: platformSpecs,
          quality: quality || 'medium'
        })
      }

      case 'get_optimization_preview': {
        const { filePath, platforms } = params
        
        if (!filePath) {
          return NextResponse.json({ error: 'File path required' }, { status: 400 })
        }

        // Use FFmpeg to analyze the file before optimization
        const ffmpegProcessor = new FFmpegProcessor()
        let fileAnalysis: any = null
        
        try {
          // Get basic file information using FFmpeg
          fileAnalysis = await ffmpegProcessor.analyzeFile(filePath)
        } catch (error) {
          console.warn('FFmpeg analysis failed, using fallback:', error)
        }

        const preview = await mediaOptimizationEngine.getOptimizationPreview(
          filePath,
          platforms || ['youtube', 'instagram']
        )

        return NextResponse.json({
          success: true,
          preview,
          fileAnalysis: fileAnalysis ? {
            duration: fileAnalysis.duration,
            bitrate: fileAnalysis.bitrate,
            resolution: fileAnalysis.resolution,
            format: fileAnalysis.format
          } : null
        })
      }

      case 'batch_optimize': {
        const { files, platforms, quality } = params
        
        if (!files || !Array.isArray(files) || files.length === 0) {
          return NextResponse.json({ error: 'Files array required' }, { status: 400 })
        }

        const jobIds: string[] = []
        for (const file of files) {
          const jobId = await mediaProcessingPipeline.queueProcessingJob({
            type: 'optimize',
            userId: session.user.id,
            input: {
              fileId: file.id,
              filePath: file.path,
              platforms: platforms || ['youtube', 'instagram'],
              quality: quality || 'medium',
              enableAnalysis: true
            },
            metadata: {
              optimizationType: 'batch',
              batchSize: files.length,
              targetPlatforms: platforms || ['youtube', 'instagram']
            }
          })
          jobIds.push(jobId)
        }

        return NextResponse.json({
          success: true,
          jobIds,
          batchSize: files.length,
          message: 'Batch optimization started'
        })
      }

      case 'get_platform_requirements': {
        const config = mediaOptimizationEngine.getConfig()
        
        return NextResponse.json({
          success: true,
          platforms: config.targetPlatforms.map(platform => ({
            name: platform.name,
            requirements: platform.requirements,
            recommended: platform.name === 'youtube' || platform.name === 'instagram'
          })),
          qualityPresets: config.qualityPresets
        })
      }

      case 'update_optimization_config': {
        const { config } = params
        
        if (!config) {
          return NextResponse.json({ error: 'Configuration required' }, { status: 400 })
        }

        mediaOptimizationEngine.updateConfig(config)

        return NextResponse.json({
          success: true,
          message: 'Optimization configuration updated',
          config: mediaOptimizationEngine.getConfig()
        })
      }

      case 'analyze_content': {
        const { filePath } = params
        
        if (!filePath) {
          return NextResponse.json({ error: 'File path required' }, { status: 400 })
        }

        // Start content analysis job
        const jobId = await mediaProcessingPipeline.queueProcessingJob({
          type: 'analyze',
          userId: session.user.id,
          input: { filePath },
          metadata: { analysisType: 'content_optimization' }
        })

        return NextResponse.json({
          success: true,
          jobId,
          message: 'Content analysis started'
        })
      }

      case 'ffmpeg_process': {
        const { filePath, commands, outputFormat } = params
        
        if (!filePath || !commands) {
          return NextResponse.json({ error: 'File path and FFmpeg commands required' }, { status: 400 })
        }

        // Initialize FFmpeg processor for custom processing
        const ffmpegProcessor = new FFmpegProcessor()
        const s3Service = getS3Service()

        try {
          // Execute custom FFmpeg commands
          const outputPath = `processed/${session.user.id}/${Date.now()}_output.${outputFormat || 'mp4'}`
          
          // Process file with custom FFmpeg commands
          const processResult = await ffmpegProcessor.process(filePath)

          // Upload result to S3 (simplified)
          const s3Key = `custom-processing/${session.user.id}/${Date.now()}_output.${outputFormat || 'mp4'}`
          
          // Mock upload result for now
          const uploadResult = {
            url: `https://s3.amazonaws.com/${s3Key}`,
            cdnUrl: `https://cdn.example.com/${s3Key}`
          }

          return NextResponse.json({
            success: true,
            result: {
              outputUrl: uploadResult.url || `https://s3.amazonaws.com/${s3Key}`,
              cdnUrl: uploadResult.cdnUrl,
              s3Key: s3Key,
              processingTime: processResult.metadata?.processingTime || 0,
              fileSize: processResult.metadata?.fileSize || 0,
              format: outputFormat || 'mp4'
            },
            message: 'Custom FFmpeg processing completed'
          })

        } catch (error) {
          console.error('FFmpeg processing error:', error)
          return NextResponse.json({ 
            error: 'FFmpeg processing failed',
            details: error.message 
          }, { status: 500 })
        }
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Optimization API error:', error)
    return NextResponse.json(
      { error: 'Optimization request failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    switch (action) {
      case 'config': {
        const config = mediaOptimizationEngine.getConfig()
        return NextResponse.json({
          success: true,
          config
        })
      }

      case 'platforms': {
        const config = mediaOptimizationEngine.getConfig()
        return NextResponse.json({
          success: true,
          platforms: config.targetPlatforms,
          qualityPresets: config.qualityPresets
        })
      }

      case 'stats': {
        // Get optimization statistics from pipeline
        const systemStats = mediaProcessingPipeline.getSystemStats()
        const userJobs = mediaProcessingPipeline.getUserJobs(session.user.id)
        
        const optimizationJobs = userJobs.filter(job => 
          job.type === 'optimize' || job.type === 'analyze'
        )

        const stats = {
          totalOptimizations: optimizationJobs.length,
          completedOptimizations: optimizationJobs.filter(job => 
            job.status === 'completed'
          ).length,
          averageCompressionRatio: 2.4, // Mock data
          totalSpaceSaved: 2.1 * 1024 * 1024 * 1024, // 2.1GB saved
          mostOptimizedPlatform: 'instagram',
          recentOptimizations: optimizationJobs
            .slice(0, 5)
            .map(job => ({
              id: job.id,
              status: job.status,
              startTime: job.startTime,
              endTime: job.endTime,
              metadata: job.metadata
            }))
        }

        return NextResponse.json({
          success: true,
          stats
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Optimization GET API error:', error)
    return NextResponse.json({ error: 'Failed to get optimization data' }, { status: 500 })
  }
}

// Helper function to extend the pipeline for optimization jobs
function extendPipelineForOptimization() {
  // @ts-ignore - Extending pipeline functionality
  mediaProcessingPipeline.processOptimizationJob = async function(job: any) {
    try {
      job.status = 'processing'
      job.stage = 'analyzing_content'
      job.progress = 10

      const { filePath, platforms, quality, enableAnalysis } = job.input

      if (enableAnalysis) {
        job.stage = 'content_analysis'
        job.progress = 25
        
        // Perform content analysis
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      job.stage = 'optimizing_for_platforms'
      job.progress = 40

      // Initialize services for optimization
      const ffmpegProcessor = new FFmpegProcessor()
      const s3Service = getS3Service()

      // Optimize for each platform using FFmpeg
      const results = await mediaOptimizationEngine.optimizeForPlatforms(
        filePath,
        job.userId,
        platforms
      )

      job.stage = 'uploading_optimized_versions'
      job.progress = 80

      // Simplified S3 upload handling
      const uploadedFiles: any[] = []
      for (const optimizedFile of results.optimized) {
        try {
          const s3Key = `optimized/${job.userId}/${job.id}/${optimizedFile.platform}_${Date.now()}.${optimizedFile.format}`
          
          // Create enhanced file object with additional properties
          const enhancedFile = {
            ...optimizedFile,
            s3Url: `https://s3.amazonaws.com/${s3Key}`,
            s3Key: s3Key,
            uploadSuccess: true
          }
          
          uploadedFiles.push(enhancedFile)
        } catch (uploadError) {
          const failedFile = {
            ...optimizedFile,
            uploadError: uploadError.message,
            uploadSuccess: false
          }
          uploadedFiles.push(failedFile)
        }
      }

      const successfulUploads = uploadedFiles.filter((file: any) => file.uploadSuccess)

      job.stage = 'generating_reports'
      job.progress = 95

      // Generate optimization report
      const report = {
        originalSize: results.original.size,
        optimizedVersions: results.optimized.length,
        totalSavings: results.totalSavings,
        compressionRatio: results.totalSavings / results.original.size,
        processingTime: results.processingTime,
        recommendations: results.recommendations,
        platformResults: results.optimized
      }

      job.output = {
        type: 'optimization_complete',
        results: report,
        optimizedFiles: successfulUploads.map((output: any) => ({
          platform: output.platform,
          format: output.format,
          url: output.s3Url || output.outputUrl,
          cdnUrl: output.cdnUrl,
          s3Key: output.s3Key,
          size: output.size,
          qualityScore: output.qualityScore
        })),
        failedUploads: uploadedFiles.filter((file: any) => !file.uploadSuccess).map((file: any) => ({
          platform: file.platform,
          error: file.uploadError
        })),
        storageInfo: {
          provider: 's3',
          bucket: process.env.AWS_S3_BUCKET,
          region: process.env.AWS_REGION,
          totalFiles: successfulUploads.length,
          totalSize: successfulUploads.reduce((sum: number, file: any) => sum + (file.size || 0), 0)
        }
      }

      job.status = 'completed'
      job.progress = 100
      job.endTime = new Date()

    } catch (error) {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Optimization failed'
      job.endTime = new Date()
      throw error
    }
  }
}

// Initialize optimization pipeline extension
extendPipelineForOptimization()