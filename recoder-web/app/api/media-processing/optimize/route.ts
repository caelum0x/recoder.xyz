import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../lib/auth'
import { mediaOptimizationEngine } from '../../../lib/media-processing/optimization-engine'
import { mediaProcessingPipeline } from '../../../lib/media-processing/pipeline-orchestrator'
import { rateLimit } from '../../../lib/rate-limit'

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

        // Create optimization job
        const jobId = await mediaProcessingPipeline.queueProcessingJob({
          type: 'optimize',
          userId: session.user.id,
          input: {
            fileId,
            filePath,
            platforms: platforms || ['youtube', 'instagram', 'tiktok'],
            quality: quality || 'medium',
            enableAnalysis: enableAnalysis !== false
          },
          metadata: {
            optimizationType: 'multi_platform',
            targetPlatforms: platforms || ['youtube', 'instagram', 'tiktok']
          }
        })

        return NextResponse.json({
          success: true,
          jobId,
          message: 'Video optimization started',
          estimatedCompletion: Date.now() + 300000 // 5 minutes estimate
        })
      }

      case 'get_optimization_preview': {
        const { filePath, platforms } = params
        
        if (!filePath) {
          return NextResponse.json({ error: 'File path required' }, { status: 400 })
        }

        const preview = await mediaOptimizationEngine.getOptimizationPreview(
          filePath,
          platforms || ['youtube', 'instagram']
        )

        return NextResponse.json({
          success: true,
          preview
        })
      }

      case 'batch_optimize': {
        const { files, platforms, quality } = params
        
        if (!files || !Array.isArray(files) || files.length === 0) {
          return NextResponse.json({ error: 'Files array required' }, { status: 400 })
        }

        const jobIds = []
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
  const originalProcessJob = mediaProcessingPipeline.processJob
  
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

      // Optimize for each platform
      const results = await mediaOptimizationEngine.optimizeForPlatforms(
        filePath,
        job.userId,
        platforms
      )

      job.stage = 'uploading_optimized_versions'
      job.progress = 80

      // Upload optimized versions (mock)
      await new Promise(resolve => setTimeout(resolve, 3000))

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
        optimizedFiles: results.optimized.map(output => ({
          platform: output.platform,
          format: output.format,
          url: output.outputUrl,
          cdnUrl: output.cdnUrl,
          size: output.size,
          qualityScore: output.qualityScore
        }))
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