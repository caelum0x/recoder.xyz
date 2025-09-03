export interface CampaignTemplate {
  id: string
  name: string
  description: string
  category: 'social' | 'ads' | 'presentations' | 'marketing' | 'branding'
  platforms: string[] // instagram, tiktok, youtube, facebook, linkedin, etc.
  format: 'video' | 'image' | 'audio' | 'mixed'
  operations: any[]
  customizations: Record<string, any>
  previewUrl?: string
  featured: boolean
  popularity: number
}

export interface TemplateApplication {
  template: CampaignTemplate
  files: any[]
  customizations: Record<string, any>
  userId: string
  projectId?: string
}

export class CampaignTemplateEngine {
  private templates: Map<string, CampaignTemplate> = new Map()

  constructor() {
    this.initializeDefaultTemplates()
  }

  private initializeDefaultTemplates() {
    const defaultTemplates: CampaignTemplate[] = [
      {
        id: 'instagram-story-template',
        name: 'Instagram Story Template',
        description: 'Perfect vertical video template for Instagram Stories with branded overlay',
        category: 'social',
        platforms: ['instagram'],
        format: 'video',
        operations: [
          {
            type: 'resize',
            parameters: { width: 1080, height: 1920 }
          },
          {
            type: 'add_watermark',
            parameters: { 
              watermarkText: '{{brandName}}',
              position: 'bottom-right',
              fontSize: 48,
              color: 'white'
            }
          }
        ],
        customizations: {
          brandName: { type: 'text', default: 'Your Brand' },
          backgroundColor: { type: 'color', default: '#000000' },
          textColor: { type: 'color', default: '#ffffff' }
        },
        featured: true,
        popularity: 150
      },
      {
        id: 'tiktok-vertical-template',
        name: 'TikTok Vertical Video',
        description: 'Optimized vertical video template for TikTok with trending effects',
        category: 'social',
        platforms: ['tiktok'],
        format: 'video',
        operations: [
          {
            type: 'resize',
            parameters: { width: 1080, height: 1920 }
          },
          {
            type: 'compress',
            parameters: { quality: 'high', maxBitrate: '5000k' }
          }
        ],
        customizations: {
          addCaptions: { type: 'boolean', default: true },
          musicVolume: { type: 'slider', default: 50, min: 0, max: 100 }
        },
        featured: true,
        popularity: 200
      },
      {
        id: 'youtube-thumbnail-template',
        name: 'YouTube Thumbnail',
        description: 'Eye-catching thumbnail template for YouTube videos',
        category: 'social',
        platforms: ['youtube'],
        format: 'image',
        operations: [
          {
            type: 'resize',
            parameters: { width: 1280, height: 720 }
          },
          {
            type: 'add_watermark',
            parameters: {
              watermarkText: '{{title}}',
              position: 'center',
              fontSize: 72,
              color: 'white',
              strokeColor: 'black',
              strokeWidth: 2
            }
          }
        ],
        customizations: {
          title: { type: 'text', default: 'AMAZING VIDEO!' },
          titleColor: { type: 'color', default: '#ff0000' },
          backgroundColor: { type: 'color', default: '#000000' }
        },
        featured: true,
        popularity: 120
      },
      {
        id: 'facebook-ad-template',
        name: 'Facebook Ad Template',
        description: 'Conversion-optimized video template for Facebook advertising',
        category: 'ads',
        platforms: ['facebook'],
        format: 'video',
        operations: [
          {
            type: 'resize',
            parameters: { width: 1200, height: 628 }
          },
          {
            type: 'trim',
            parameters: { duration: '15' } // 15 second max for ads
          },
          {
            type: 'add_watermark',
            parameters: {
              watermarkText: '{{callToAction}}',
              position: 'bottom-center',
              fontSize: 36,
              color: 'white',
              backgroundColor: 'rgba(0,0,0,0.7)'
            }
          }
        ],
        customizations: {
          callToAction: { type: 'text', default: 'Shop Now!' },
          brandLogo: { type: 'file', default: null },
          accentColor: { type: 'color', default: '#1877f2' }
        },
        featured: true,
        popularity: 180
      },
      {
        id: 'linkedin-post-template',
        name: 'LinkedIn Professional Post',
        description: 'Professional video template for LinkedIn business content',
        category: 'marketing',
        platforms: ['linkedin'],
        format: 'video',
        operations: [
          {
            type: 'resize',
            parameters: { width: 1200, height: 675 }
          },
          {
            type: 'add_watermark',
            parameters: {
              watermarkText: '{{companyName}}',
              position: 'bottom-left',
              fontSize: 24,
              color: 'white'
            }
          }
        ],
        customizations: {
          companyName: { type: 'text', default: 'Your Company' },
          professionalTheme: { type: 'select', default: 'blue', options: ['blue', 'gray', 'navy'] }
        },
        featured: false,
        popularity: 90
      },
      {
        id: 'product-showcase-template',
        name: 'Product Showcase',
        description: 'Multi-platform product showcase template with zoom effects',
        category: 'marketing',
        platforms: ['instagram', 'facebook', 'twitter'],
        format: 'video',
        operations: [
          {
            type: 'resize',
            parameters: { width: 1080, height: 1080 } // Square format
          },
          {
            type: 'add_watermark',
            parameters: {
              watermarkText: '{{productName}}',
              position: 'bottom-center',
              fontSize: 48,
              color: 'white'
            }
          }
        ],
        customizations: {
          productName: { type: 'text', default: 'Amazing Product' },
          showPrice: { type: 'boolean', default: true },
          price: { type: 'text', default: '$99.99' },
          backgroundColor: { type: 'color', default: '#ffffff' }
        },
        featured: true,
        popularity: 160
      },
      {
        id: 'podcast-audio-template',
        name: 'Podcast Audio Template',
        description: 'Audio processing template for podcast episodes with intro/outro',
        category: 'marketing',
        platforms: ['spotify', 'apple-podcasts', 'google-podcasts'],
        format: 'audio',
        operations: [
          {
            type: 'extract_audio',
            parameters: { format: 'mp3', bitrate: '128k' }
          },
          {
            type: 'normalize_audio',
            parameters: { level: '-16dB' }
          }
        ],
        customizations: {
          addIntro: { type: 'boolean', default: true },
          introFile: { type: 'file', default: null },
          addOutro: { type: 'boolean', default: true },
          outroFile: { type: 'file', default: null }
        },
        featured: false,
        popularity: 75
      },
      {
        id: 'multi-platform-batch-template',
        name: 'Multi-Platform Batch Template',
        description: 'Create multiple versions of your content for different platforms automatically',
        category: 'marketing',
        platforms: ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter'],
        format: 'mixed',
        operations: [
          {
            type: 'batch_resize',
            parameters: {
              formats: [
                { name: 'instagram-story', width: 1080, height: 1920 },
                { name: 'instagram-post', width: 1080, height: 1080 },
                { name: 'youtube-short', width: 1080, height: 1920 },
                { name: 'facebook-post', width: 1200, height: 628 },
                { name: 'twitter-post', width: 1200, height: 675 }
              ]
            }
          }
        ],
        customizations: {
          platforms: { 
            type: 'multiselect', 
            default: ['instagram', 'facebook'], 
            options: ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'linkedin']
          },
          quality: { type: 'select', default: 'high', options: ['medium', 'high', 'ultra'] }
        },
        featured: true,
        popularity: 250
      }
    ]

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template)
    })
  }

  async applyTemplate(options: TemplateApplication): Promise<{
    outputFiles: any[]
    processingJobs: any[]
  }> {
    const { template, files, customizations, userId, projectId } = options
    const outputFiles: any[] = []
    const processingJobs: any[] = []

    for (const file of files) {
      // Apply template operations to each file
      const templateOperations = this.processTemplateOperations(
        template.operations,
        customizations
      )

      for (const operation of templateOperations) {
        // Create processing job for each operation
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        const processingJob = {
          id: jobId,
          userId,
          fileId: file.id,
          templateId: template.id,
          operation: operation.type,
          parameters: operation.parameters,
          status: 'queued',
          priority: template.featured ? 'high' : 'normal',
          createdAt: new Date()
        }

        processingJobs.push(processingJob)

        // Generate output file info
        const outputFile = {
          id: `output_${jobId}`,
          originalFileId: file.id,
          templateId: template.id,
          filename: this.generateOutputFilename(file.filename, template, operation),
          status: 'processing',
          createdAt: new Date()
        }

        outputFiles.push(outputFile)
      }
    }

    return {
      outputFiles,
      processingJobs
    }
  }

  private processTemplateOperations(operations: any[], customizations: Record<string, any>): any[] {
    return operations.map(operation => {
      const processedOperation = { ...operation }
      
      // Replace customization placeholders
      processedOperation.parameters = this.replacePlaceholders(
        operation.parameters,
        customizations
      )

      return processedOperation
    })
  }

  private replacePlaceholders(parameters: any, customizations: Record<string, any>): any {
    const processed = { ...parameters }

    for (const [key, value] of Object.entries(processed)) {
      if (typeof value === 'string' && value.includes('{{')) {
        // Replace template variables like {{brandName}}
        processed[key] = value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
          return customizations[varName] || match
        })
      }
    }

    return processed
  }

  private generateOutputFilename(originalFilename: string, template: CampaignTemplate, operation: any): string {
    const baseName = originalFilename.substring(0, originalFilename.lastIndexOf('.'))
    const extension = this.getOutputExtension(operation)
    const templateSuffix = template.name.toLowerCase().replace(/\s+/g, '-')
    
    return `${baseName}_${templateSuffix}_${Date.now()}.${extension}`
  }

  private getOutputExtension(operation: any): string {
    switch (operation.type) {
      case 'extract_audio':
        return operation.parameters.format || 'mp3'
      case 'convert':
        return operation.parameters.format || 'mp4'
      default:
        return 'mp4' // Default to mp4 for video operations
    }
  }

  getTemplate(templateId: string): CampaignTemplate | undefined {
    return this.templates.get(templateId)
  }

  getAllTemplates(): CampaignTemplate[] {
    return Array.from(this.templates.values())
  }

  getTemplatesByCategory(category: string): CampaignTemplate[] {
    return Array.from(this.templates.values()).filter(
      template => template.category === category
    )
  }

  getTemplatesByPlatform(platform: string): CampaignTemplate[] {
    return Array.from(this.templates.values()).filter(
      template => template.platforms.includes(platform)
    )
  }

  getFeaturedTemplates(): CampaignTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.featured)
      .sort((a, b) => b.popularity - a.popularity)
  }

  getPopularTemplates(limit = 10): CampaignTemplate[] {
    return Array.from(this.templates.values())
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit)
  }

  // Admin functions for managing templates
  addTemplate(template: CampaignTemplate): void {
    this.templates.set(template.id, template)
  }

  updateTemplate(templateId: string, updates: Partial<CampaignTemplate>): boolean {
    const existing = this.templates.get(templateId)
    if (!existing) return false

    this.templates.set(templateId, { ...existing, ...updates })
    return true
  }

  deleteTemplate(templateId: string): boolean {
    return this.templates.delete(templateId)
  }
}
