import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

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
}

export class MediaUploadService {
  private uploadDir: string
  private maxFileSize: number
  private allowedFormats: Set<string>

  constructor() {
    this.uploadDir = process.env.MEDIA_UPLOAD_DIR || '/tmp/media-uploads'
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '500000000') // 500MB default
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
  }

  async uploadFile(options: FileUploadOptions): Promise<UploadResult> {
    const { file, userId, projectId, purpose, metadata } = options

    // Validate file
    await this.validateFile(file)

    // Generate unique filename
    const fileExtension = this.getFileExtension(file.name)
    const uniqueFilename = `${uuidv4()}.${fileExtension}`
    const userDir = path.join(this.uploadDir, userId)
    const filePath = path.join(userDir, uniqueFilename)

    // Ensure user directory exists
    await fs.mkdir(userDir, { recursive: true })

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    // Generate thumbnail if it's a video or image
    let thumbnailPath: string | undefined
    if (this.isVideoFile(file.type) || this.isImageFile(file.type)) {
      thumbnailPath = await this.generateThumbnail(filePath, fileExtension)
    }

    // Create database record
    const uploadResult: UploadResult = {
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
        const success = await processor.generateThumbnail(filePath, thumbnailPath)
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
}

// Export singleton instance for easy use
export const mediaUploadService = new MediaUploadService();
