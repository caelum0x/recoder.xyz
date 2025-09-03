import { FFmpegProcessor } from './ffmpeg-processor'
import { getS3Service } from '../cloud-storage/aws-s3-service'
import { mediaUploadService } from './media-upload'

export interface OptimizationConfig {
  enableAutoOptimization: boolean
  targetPlatforms: Platform[]
  qualityPresets: QualityPreset[]
  compressionLevel: number
  enableAdaptiveBitrate: boolean
  enableSmartCropping: boolean
  enableContentAwareEncoding: boolean
}

export interface Platform {
  name: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'linkedin' | 'facebook' | 'web'
  requirements: {
    maxResolution: string
    maxBitrate: string
    maxDuration: number
    aspectRatio: string
    formats: string[]
  }
}

export interface QualityPreset {
  name: string
  targetBitrate: string
  resolution: string
  fps: number
  codec: string
  profile: string
}

export interface OptimizationResult {
  original: {
    size: number
    bitrate: number
    duration: number
    resolution: string
  }
  optimized: Array<{
    platform: string
    format: string
    size: number
    bitrate: number
    compressionRatio: number
    qualityScore: number
    outputUrl: string
    cdnUrl?: string
  }>
  totalSavings: number
  processingTime: number
  recommendations: string[]
}

export class MediaOptimizationEngine {
  private ffmpegProcessor: FFmpegProcessor
  private config: OptimizationConfig

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.ffmpegProcessor = new FFmpegProcessor()
    this.config = {
      enableAutoOptimization: true,
      targetPlatforms: this.getDefaultPlatforms(),
      qualityPresets: this.getDefaultQualityPresets(),
      compressionLevel: 5, // 1-10 scale
      enableAdaptiveBitrate: true,
      enableSmartCropping: true,
      enableContentAwareEncoding: true,
      ...config
    }
  }

  async optimizeForPlatforms(
    inputPath: string,
    userId: string,
    platforms: string[] = []
  ): Promise<OptimizationResult> {
    const startTime = Date.now()
    
    // Analyze input media
    const mediaInfo = await this.ffmpegProcessor.getMediaInfo(inputPath)
    
    const targetPlatforms = platforms.length > 0 
      ? this.config.targetPlatforms.filter(p => platforms.includes(p.name))
      : this.config.targetPlatforms

    const optimizedOutputs = []
    let totalOriginalSize = 0
    let totalOptimizedSize = 0

    for (const platform of targetPlatforms) {
      try {
        const optimized = await this.optimizeForPlatform(inputPath, platform, mediaInfo)
        optimizedOutputs.push(optimized)
        totalOptimizedSize += optimized.size
      } catch (error) {
        console.error(`Failed to optimize for ${platform.name}:`, error)
      }
    }

    totalOriginalSize = mediaInfo.fileSize * targetPlatforms.length
    const totalSavings = totalOriginalSize - totalOptimizedSize
    const processingTime = Date.now() - startTime

    // Generate recommendations
    const recommendations = this.generateOptimizationRecommendations(
      mediaInfo,
      optimizedOutputs
    )

    return {
      original: {
        size: mediaInfo.fileSize,
        bitrate: mediaInfo.bitrate,
        duration: mediaInfo.duration,
        resolution: `${mediaInfo.width}x${mediaInfo.height}`
      },
      optimized: optimizedOutputs,
      totalSavings,
      processingTime,
      recommendations
    }
  }

  private async optimizeForPlatform(
    inputPath: string,
    platform: Platform,
    mediaInfo: any
  ): Promise<any> {
    const outputFormat = platform.requirements.formats[0]
    const tempOutputPath = `/tmp/optimized_${platform.name}_${Date.now()}.${outputFormat}`

    // Determine optimal settings based on content analysis
    const optimalSettings = await this.analyzeContentForOptimalSettings(
      inputPath,
      platform,
      mediaInfo
    )

    // Apply platform-specific optimizations
    const processingOptions = {
      inputPath,
      outputPath: tempOutputPath,
      resolution: this.calculateOptimalResolution(
        mediaInfo.width,
        mediaInfo.height,
        platform.requirements.maxResolution
      ),
      bitrate: this.calculateOptimalBitrate(
        mediaInfo.bitrate,
        platform.requirements.maxBitrate,
        optimalSettings.contentComplexity
      ),
      fps: Math.min(mediaInfo.fps, 30), // Most platforms prefer 30fps max
      codec: 'h264',
      profile: 'high',
      filters: this.buildOptimizationFilters(platform, optimalSettings)
    }

    // Process the video
    await this.ffmpegProcessor.processVideo(processingOptions)

    // Upload optimized version if cloud storage is enabled
    let outputUrl = tempOutputPath
    let cdnUrl: string | undefined

    if (mediaUploadService.isCloudStorageEnabled()) {
      const uploadResult = await this.uploadOptimizedVersion(
        tempOutputPath,
        platform.name,
        outputFormat
      )
      outputUrl = uploadResult.cloudUrl || uploadResult.localPath
      cdnUrl = uploadResult.cdnUrl
    }

    // Calculate quality metrics
    const optimizedInfo = await this.ffmpegProcessor.getMediaInfo(tempOutputPath)
    const qualityScore = this.calculateQualityScore(mediaInfo, optimizedInfo)
    const compressionRatio = mediaInfo.fileSize / optimizedInfo.fileSize

    return {
      platform: platform.name,
      format: outputFormat,
      size: optimizedInfo.fileSize,
      bitrate: optimizedInfo.bitrate,
      compressionRatio,
      qualityScore,
      outputUrl,
      cdnUrl
    }
  }

  private async analyzeContentForOptimalSettings(
    inputPath: string,
    platform: Platform,
    mediaInfo: any
  ): Promise<{
    contentComplexity: number
    motionLevel: number
    sceneChanges: number
    audioComplexity: number
    recommendedBitrate: number
  }> {
    // Simplified content analysis - in production, use ML models or advanced FFmpeg filters
    
    // Estimate content complexity based on resolution and duration
    const pixelCount = mediaInfo.width * mediaInfo.height
    const complexityScore = Math.min(pixelCount / (1920 * 1080), 2) // Normalize to 1080p
    
    // Estimate motion level from bitrate vs resolution ratio
    const expectedBitrate = pixelCount * 0.1 // Rough estimate
    const motionLevel = Math.min(mediaInfo.bitrate / expectedBitrate, 3)

    // Mock scene change detection (in production, use FFmpeg scene detection)
    const sceneChanges = Math.floor(mediaInfo.duration / 3) // Assume scene change every 3 seconds

    return {
      contentComplexity: complexityScore,
      motionLevel,
      sceneChanges,
      audioComplexity: mediaInfo.hasAudio ? 1 : 0,
      recommendedBitrate: this.calculateContentAwareBitrate(
        complexityScore,
        motionLevel,
        platform.requirements.maxBitrate
      )
    }
  }

  private calculateOptimalResolution(
    inputWidth: number,
    inputHeight: number,
    maxResolution: string
  ): string {
    const [maxWidth, maxHeight] = maxResolution.split('x').map(Number)
    
    // Maintain aspect ratio while fitting within max dimensions
    const aspectRatio = inputWidth / inputHeight
    
    let outputWidth = Math.min(inputWidth, maxWidth)
    let outputHeight = Math.min(inputHeight, maxHeight)
    
    // Adjust to maintain aspect ratio
    if (outputWidth / outputHeight > aspectRatio) {
      outputWidth = Math.floor(outputHeight * aspectRatio)
    } else {
      outputHeight = Math.floor(outputWidth / aspectRatio)
    }
    
    // Ensure even dimensions for encoding compatibility
    outputWidth = Math.floor(outputWidth / 2) * 2
    outputHeight = Math.floor(outputHeight / 2) * 2
    
    return `${outputWidth}x${outputHeight}`
  }

  private calculateOptimalBitrate(
    inputBitrate: number,
    maxBitrate: string,
    contentComplexity: number
  ): string {
    const maxBitrateNum = parseInt(maxBitrate.replace(/[^\d]/g, ''))
    const maxBitrateUnit = maxBitrate.replace(/\d/g, '')
    
    // Adjust bitrate based on content complexity
    const complexityMultiplier = 0.7 + (contentComplexity * 0.6)
    const targetBitrate = Math.min(
      inputBitrate * complexityMultiplier,
      maxBitrateNum
    )
    
    return Math.floor(targetBitrate) + maxBitrateUnit
  }

  private calculateContentAwareBitrate(
    complexity: number,
    motion: number,
    maxBitrate: string
  ): number {
    const maxBitrateNum = parseInt(maxBitrate.replace(/[^\d]/g, ''))
    
    // Base bitrate calculation considering content characteristics
    const baseBitrate = maxBitrateNum * 0.6 // Start at 60% of max
    const complexityBoost = complexity * 0.2
    const motionBoost = motion * 0.15
    
    return Math.min(
      baseBitrate * (1 + complexityBoost + motionBoost),
      maxBitrateNum
    )
  }

  private buildOptimizationFilters(platform: Platform, settings: any): string[] {
    const filters = []
    
    // Platform-specific optimizations
    switch (platform.name) {
      case 'instagram':
        filters.push('unsharp=5:5:1.0:5:5:0.0') // Sharpen for mobile viewing
        if (this.config.enableSmartCropping) {
          filters.push('crop=1080:1080') // Square crop for Instagram
        }
        break
        
      case 'tiktok':
        filters.push('eq=contrast=1.1:brightness=0.1') // Slight contrast boost
        break
        
      case 'youtube':
        if (settings.contentComplexity > 1.5) {
          filters.push('noise=alls=1:allf=t') // Noise reduction for complex content
        }
        break
        
      case 'web':
        filters.push('scale=flags=lanczos') // High-quality scaling for web
        break
    }
    
    // Content-aware filters
    if (this.config.enableContentAwareEncoding) {
      if (settings.motionLevel > 2) {
        filters.push('mpdecimate=max=2:hi=576:lo=320') // Remove duplicate frames
      }
      
      if (settings.sceneChanges > 20) {
        filters.push('select=not(mod(n\\,2))') // Frame rate reduction for scene-heavy content
      }
    }
    
    return filters
  }

  private calculateQualityScore(originalInfo: any, optimizedInfo: any): number {
    // Simple quality score calculation
    const sizeRatio = optimizedInfo.fileSize / originalInfo.fileSize
    const bitrateRatio = optimizedInfo.bitrate / originalInfo.bitrate
    const resolutionRatio = (optimizedInfo.width * optimizedInfo.height) / 
                          (originalInfo.width * originalInfo.height)
    
    // Higher score for better compression efficiency
    const compressionEfficiency = (1 - sizeRatio) * 0.4
    const qualityPreservation = Math.min(bitrateRatio, resolutionRatio) * 0.6
    
    return Math.round((compressionEfficiency + qualityPreservation) * 100)
  }

  private generateOptimizationRecommendations(
    mediaInfo: any,
    optimizedOutputs: any[]
  ): string[] {
    const recommendations = []
    
    // Check if original resolution is unnecessarily high
    if (mediaInfo.width > 1920) {
      recommendations.push('Consider reducing resolution to 1080p for most platforms to save bandwidth')
    }
    
    // Check bitrate efficiency
    const avgCompressionRatio = optimizedOutputs.reduce((sum, output) => 
      sum + output.compressionRatio, 0) / optimizedOutputs.length
    
    if (avgCompressionRatio > 3) {
      recommendations.push('Original file is highly compressible - consider using higher compression for storage')
    }
    
    // Frame rate recommendations
    if (mediaInfo.fps > 30) {
      recommendations.push('Consider reducing frame rate to 30fps for most social platforms')
    }
    
    // Audio optimization
    if (mediaInfo.hasAudio && mediaInfo.audioCodec !== 'aac') {
      recommendations.push('Convert audio to AAC for better compatibility and smaller file size')
    }
    
    // Platform-specific recommendations
    const platforms = optimizedOutputs.map(output => output.platform)
    if (platforms.includes('instagram') && !platforms.includes('tiktok')) {
      recommendations.push('Consider optimizing for TikTok as well - similar mobile-first audience')
    }
    
    return recommendations
  }

  private async uploadOptimizedVersion(
    localPath: string,
    platform: string,
    format: string
  ) {
    // Mock implementation - in production, integrate with your upload service
    return {
      localPath,
      cloudUrl: `https://cdn.example.com/optimized/${platform}/video.${format}`,
      cdnUrl: `https://cdn.example.com/optimized/${platform}/video.${format}`
    }
  }

  private getDefaultPlatforms(): Platform[] {
    return [
      {
        name: 'youtube',
        requirements: {
          maxResolution: '1920x1080',
          maxBitrate: '8000k',
          maxDuration: 43200, // 12 hours
          aspectRatio: '16:9',
          formats: ['mp4', 'webm']
        }
      },
      {
        name: 'instagram',
        requirements: {
          maxResolution: '1080x1080',
          maxBitrate: '3500k',
          maxDuration: 60,
          aspectRatio: '1:1',
          formats: ['mp4']
        }
      },
      {
        name: 'tiktok',
        requirements: {
          maxResolution: '1080x1920',
          maxBitrate: '3000k',
          maxDuration: 180,
          aspectRatio: '9:16',
          formats: ['mp4']
        }
      },
      {
        name: 'twitter',
        requirements: {
          maxResolution: '1280x720',
          maxBitrate: '2000k',
          maxDuration: 140,
          aspectRatio: '16:9',
          formats: ['mp4']
        }
      }
    ]
  }

  private getDefaultQualityPresets(): QualityPreset[] {
    return [
      {
        name: 'Ultra',
        targetBitrate: '8000k',
        resolution: '1920x1080',
        fps: 60,
        codec: 'h264',
        profile: 'high'
      },
      {
        name: 'High',
        targetBitrate: '5000k',
        resolution: '1920x1080',
        fps: 30,
        codec: 'h264',
        profile: 'high'
      },
      {
        name: 'Medium',
        targetBitrate: '2500k',
        resolution: '1280x720',
        fps: 30,
        codec: 'h264',
        profile: 'main'
      },
      {
        name: 'Low',
        targetBitrate: '1000k',
        resolution: '854x480',
        fps: 30,
        codec: 'h264',
        profile: 'baseline'
      }
    ]
  }

  // Public API methods
  async optimizeVideo(
    inputPath: string,
    userId: string,
    options: {
      platforms?: string[]
      quality?: string
      enableAnalysis?: boolean
    } = {}
  ): Promise<OptimizationResult> {
    return this.optimizeForPlatforms(
      inputPath,
      userId,
      options.platforms
    )
  }

  async getOptimizationPreview(
    inputPath: string,
    platforms: string[]
  ): Promise<{
    estimatedSavings: number
    estimatedProcessingTime: number
    recommendations: string[]
  }> {
    const mediaInfo = await this.ffmpegProcessor.getMediaInfo(inputPath)
    
    // Estimate savings based on typical compression ratios
    const avgCompressionRatio = 2.5
    const estimatedSavings = (mediaInfo.fileSize * (avgCompressionRatio - 1)) * platforms.length
    
    // Estimate processing time based on duration and platform count
    const estimatedProcessingTime = mediaInfo.duration * platforms.length * 2 // 2x real-time
    
    const recommendations = [
      'Enable adaptive bitrate encoding for best quality-size balance',
      'Consider batch processing multiple files for efficiency',
      'Use CDN distribution for optimized global delivery'
    ]
    
    return {
      estimatedSavings,
      estimatedProcessingTime,
      recommendations
    }
  }

  updateConfig(newConfig: Partial<OptimizationConfig>) {
    this.config = { ...this.config, ...newConfig }
  }

  getConfig(): OptimizationConfig {
    return { ...this.config }
  }
}

// Singleton instance
export const mediaOptimizationEngine = new MediaOptimizationEngine()