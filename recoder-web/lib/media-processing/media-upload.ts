import { promises as fs } from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { AWSS3Service, initializeS3Service, getS3Service } from '../cloud-storage/aws-s3-service'

export interface FileUploadOptions {
  file: File
  userId: string
  projectId?: string
  purpose: string
  metadata: Record<string, any>
}

export interface UploadResult {
  id: string
  filename: string
  originalName: string
  filePath: string
  size: number
  format: string
  mimeType: string
  purpose: string
  metadata: Record<string, any>
  thumbnailPath?: string
  createdAt: Date
  // Cloud storage fields
  cloudUrl?: string
  cdnUrl?: string
  s3Key?: string
  bucket?: string
}

export class MediaUploadService {
  private uploadDir: string
  private maxFileSize: number
  private allowedFormats: Set<string>
  private s3Service: AWSS3Service | null = null
  private useCloudStorage: boolean

  constructor() {
    this.uploadDir = process.env.MEDIA_UPLOAD_DIR || '/tmp/media-uploads'
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '500000000') // 500MB default
    this.useCloudStorage = process.env.USE_CLOUD_STORAGE === 'true'
    this.allowedFormats = new Set([
      // Video formats
      'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp',
      // Audio formats
      'mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'aiff',
      // Image formats
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg',
      // Document formats (for campaigns)
      'pdf', 'psd', 'ai', 'eps'
    ])

    // Initialize S3 service if cloud storage is enabled
    if (this.useCloudStorage) {
      try {
        this.s3Service = initializeS3Service()
      } catch (error) {
        console.warn('Failed to initialize S3 service:', error)
        this.useCloudStorage = false
      }
    }
  }

  async uploadFile(options: FileUploadOptions): Promise<UploadResult> {
    const { file, userId, projectId, purpose, metadata } = options

    // Validate file
    await this.validateFile(file)

    // Generate unique filename
    const fileExtension = this.getFileExtension(file.name)
    const uniqueFilename = `${uuidv4()}.${fileExtension}`
    const buffer = Buffer.from(await file.arrayBuffer())

    let uploadResult: UploadResult

    if (this.useCloudStorage && this.s3Service) {
      // Cloud storage upload
      const cloudFile = await this.s3Service.uploadMediaFile(
        buffer,
        file.name,
        file.type,
        userId,
        purpose as any
      )

      // Generate thumbnail if it's a video or image
      let thumbnailCloudFile: any = undefined
      if (this.isVideoFile(file.type) || this.isImageFile(file.type)) {
        thumbnailCloudFile = await this.generateCloudThumbnail(cloudFile, buffer, fileExtension)
      }

      uploadResult = {
        id: uuidv4(),
        filename: uniqueFilename,
        originalName: file.name,
        filePath: cloudFile.key, // Use S3 key as file path
        size: file.size,
        format: fileExtension,
        mimeType: file.type,
        purpose,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          userAgent: metadata.userAgent || 'unknown',
          s3Etag: cloudFile.etag
        },
        thumbnailPath: thumbnailCloudFile?.key,
        cloudUrl: cloudFile.url,
        cdnUrl: cloudFile.cdnUrl,
        s3Key: cloudFile.key,
        bucket: cloudFile.bucket,
        createdAt: new Date()
      }
    } else {
      // Local storage upload (fallback)
      const userDir = path.join(this.uploadDir, userId)
      const filePath = path.join(userDir, uniqueFilename)

      // Ensure user directory exists
      await fs.mkdir(userDir, { recursive: true })

      // Save file
      await fs.writeFile(filePath, buffer)

      // Generate thumbnail if it's a video or image
      let thumbnailPath: string | undefined
      if (this.isVideoFile(file.type) || this.isImageFile(file.type)) {
        thumbnailPath = await this.generateThumbnail(filePath, fileExtension)
      }

      uploadResult = {
        id: uuidv4(),
        filename: uniqueFilename,
        originalName: file.name,
        filePath,
        size: file.size,
        format: fileExtension,
        mimeType: file.type,
        purpose,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          userAgent: metadata.userAgent || 'unknown'
        },
        thumbnailPath,
        createdAt: new Date()
      }
    }

    return uploadResult
  }

  private async validateFile(file: File): Promise<void> {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize / 1000000}MB`)
    }

    // Check file format
    const extension = this.getFileExtension(file.name)
    if (!this.allowedFormats.has(extension.toLowerCase())) {
      throw new Error(`File format .${extension} is not supported`)
    }

    // Check MIME type
    if (!this.isValidMimeType(file.type, extension)) {
      throw new Error('File type does not match file extension')
    }
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || ''
  }

  private isValidMimeType(mimeType: string, extension: string): boolean {
    const mimeTypeMap: Record<string, string[]> = {
      mp4: ['video/mp4'],
      avi: ['video/x-msvideo'],
      mov: ['video/quicktime'],
      wmv: ['video/x-ms-wmv'],
      webm: ['video/webm'],
      mp3: ['audio/mpeg', 'audio/mp3'],
      wav: ['audio/wav', 'audio/wave'],
      flac: ['audio/flac'],
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      gif: ['image/gif'],
      webp: ['image/webp'],
      pdf: ['application/pdf']
    }

    const validMimeTypes = mimeTypeMap[extension] || []
    return validMimeTypes.includes(mimeType) || mimeType.startsWith('video/') || mimeType.startsWith('audio/') || mimeType.startsWith('image/')
  }

  private isVideoFile(mimeType: string): boolean {
    return mimeType.startsWith('video/')
  }

  private isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/')
  }

  private async generateCloudThumbnail(cloudFile: any, originalBuffer: Buffer, extension: string): Promise<any> {
    try {
      if (this.isVideoFile(`video/${extension}`)) {
        // For video thumbnails, we need to download, process, and re-upload
        // This is a simplified version - in production, use a more efficient approach
        const tempFilePath = `/tmp/${uuidv4()}.${extension}`
        const tempThumbnailPath = `/tmp/${uuidv4()}_thumb.jpg`

        // Save temp file
        await fs.writeFile(tempFilePath, originalBuffer)

        // Generate thumbnail
        const { FFmpegProcessor } = await import('./ffmpeg-processor')
        const processor = new FFmpegProcessor()
        const thumbnailGenerated = await processor.generateThumbnail(tempFilePath, 1, tempThumbnailPath)

        if (thumbnailGenerated && this.s3Service) {
          // Upload thumbnail to S3
          const thumbnailBuffer = await fs.readFile(tempThumbnailPath)
          const thumbnailKey = cloudFile.key.replace(`.${extension}`, '_thumb.jpg')
          
          const thumbnailCloudFile = await this.s3Service.uploadFile({
            bucket: cloudFile.bucket,
            key: thumbnailKey,
            body: thumbnailBuffer,
            contentType: 'image/jpeg',
            acl: 'public-read',
            metadata: {
              sourceKey: cloudFile.key,
              type: 'thumbnail'
            }
          })

          // Cleanup temp files
          await fs.unlink(tempFilePath).catch(() => {})
          await fs.unlink(tempThumbnailPath).catch(() => {})

          return thumbnailCloudFile
        }

        // Cleanup temp files on failure
        await fs.unlink(tempFilePath).catch(() => {})
        await fs.unlink(tempThumbnailPath).catch(() => {})
        
      } else if (this.isImageFile(`image/${extension}`) && this.s3Service) {
        // For images, create a resized thumbnail
        // Using the original as thumbnail for now - in production, use sharp or similar
        const thumbnailKey = cloudFile.key.replace(`.${extension}`, '_thumb.jpg')
        
        return await this.s3Service.uploadFile({
          bucket: cloudFile.bucket,
          key: thumbnailKey,
          body: originalBuffer,
          contentType: 'image/jpeg',
          acl: 'public-read',
          metadata: {
            sourceKey: cloudFile.key,
            type: 'thumbnail'
          }
        })
      }

      return undefined
    } catch (error) {
      console.error('Failed to generate cloud thumbnail:', error)
      return undefined
    }
  }

  private async generateThumbnail(filePath: string, extension: string): Promise<string | undefined> {
    try {
      const thumbnailDir = path.join(path.dirname(filePath), 'thumbnails')
      await fs.mkdir(thumbnailDir, { recursive: true })

      const thumbnailFilename = `${path.basename(filePath, `.${extension}`)}_thumb.jpg`
      const thumbnailPath = path.join(thumbnailDir, thumbnailFilename)

      if (this.isVideoFile(`video/${extension}`)) {
        // Use FFmpeg to generate video thumbnail
        const { FFmpegProcessor } = await import('./ffmpeg-processor')
        const processor = new FFmpegProcessor()
        const success = await processor.generateThumbnail(filePath, 1, thumbnailPath)
        return success ? thumbnailPath : undefined
      } else if (this.isImageFile(`image/${extension}`)) {
        // For images, we could use sharp or similar library to resize
        // For now, we'll just copy the original as thumbnail
        await fs.copyFile(filePath, thumbnailPath)
        return thumbnailPath
      }

      return undefined
    } catch (error) {
      console.error('Failed to generate thumbnail:', error)
      return undefined
    }
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath)
      
      // Also delete thumbnail if exists
      const thumbnailPath = this.getThumbnailPath(filePath)
      if (thumbnailPath) {
        try {
          await fs.unlink(thumbnailPath)
        } catch (error) {
          // Thumbnail deletion failure is not critical
        }
      }

      return true
    } catch (error) {
      console.error('Failed to delete file:', error)
      return false
    }
  }

  private getThumbnailPath(filePath: string): string | undefined {
    const dir = path.dirname(filePath)
    const filename = path.basename(filePath)
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'))
    return path.join(dir, 'thumbnails', `${nameWithoutExt}_thumb.jpg`)
  }

  async getFileInfo(filePath: string): Promise<{
    exists: boolean
    size?: number
    mimeType?: string
    lastModified?: Date
  }> {
    try {
      const stats = await fs.stat(filePath)
      return {
        exists: true,
        size: stats.size,
        lastModified: stats.mtime
      }
    } catch (error) {
      return { exists: false }
    }
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true })
      await fs.rename(sourcePath, destinationPath)
      return true
    } catch (error) {
      console.error('Failed to move file:', error)
      return false
    }
  }

  // Cleanup temporary files older than specified hours
  async cleanupOldFiles(hoursOld = 24): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000)
      let deletedCount = 0

      const cleanupDir = async (dirPath: string) => {
        try {
          const files = await fs.readdir(dirPath, { withFileTypes: true })
          
          for (const file of files) {
            const fullPath = path.join(dirPath, file.name)
            
            if (file.isDirectory()) {
              await cleanupDir(fullPath)
            } else {
              const stats = await fs.stat(fullPath)
              if (stats.mtime < cutoffTime) {
                await fs.unlink(fullPath)
                deletedCount++
              }
            }
          }
        } catch (error) {
          // Continue cleanup even if some directories fail
        }
      }

      await cleanupDir(this.uploadDir)
      return deletedCount

    } catch (error) {
      console.error('Cleanup failed:', error)
      return 0
    }
  }

  // Cloud storage methods
  async getPresignedUploadUrl(fileName: string, contentType: string, userId: string, purpose: string): Promise<{
    uploadUrl: string
    key: string
    fields?: Record<string, string>
  } | null> {
    if (!this.s3Service) {
      return null
    }

    try {
      const fileExtension = this.getFileExtension(fileName)
      const uniqueKey = `media/${userId}/${purpose}/${Date.now()}-${uuidv4()}.${fileExtension}`
      
      const uploadUrl = await this.s3Service.getPresignedUploadUrl({
        bucket: process.env.AWS_S3_BUCKET!,
        key: uniqueKey,
        contentType,
        expires: 3600, // 1 hour
        metadata: {
          userId,
          purpose,
          originalName: fileName
        }
      })

      return {
        uploadUrl,
        key: uniqueKey
      }
    } catch (error) {
      console.error('Failed to generate presigned URL:', error)
      return null
    }
  }

  async getPresignedDownloadUrl(s3Key: string, expiresIn = 3600): Promise<string | null> {
    if (!this.s3Service) {
      return null
    }

    try {
      return await this.s3Service.getPresignedDownloadUrl(
        process.env.AWS_S3_BUCKET!,
        s3Key,
        expiresIn
      )
    } catch (error) {
      console.error('Failed to generate download URL:', error)
      return null
    }
  }

  async deleteCloudFile(s3Key: string): Promise<boolean> {
    if (!this.s3Service) {
      return false
    }

    try {
      return await this.s3Service.deleteFile(process.env.AWS_S3_BUCKET!, s3Key)
    } catch (error) {
      console.error('Failed to delete cloud file:', error)
      return false
    }
  }

  async moveCloudFile(sourceKey: string, destKey: string): Promise<boolean> {
    if (!this.s3Service) {
      return false
    }

    try {
      const bucket = process.env.AWS_S3_BUCKET!
      await this.s3Service.moveFile(bucket, sourceKey, bucket, destKey)
      return true
    } catch (error) {
      console.error('Failed to move cloud file:', error)
      return false
    }
  }

  getOptimizedUrl(s3Key: string, transformations?: {
    width?: number
    height?: number
    quality?: number
    format?: 'webp' | 'avif' | 'jpg' | 'png'
  }): string | null {
    if (!this.s3Service) {
      return null
    }

    return this.s3Service.getOptimizedUrl(s3Key, transformations)
  }

  isCloudStorageEnabled(): boolean {
    return this.useCloudStorage && this.s3Service !== null
  }
}

// Export singleton instance for easy use
export const mediaUploadService = new MediaUploadService();
